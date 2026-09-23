import test from 'node:test';
import assert from 'node:assert/strict';
import { generarAsistenciaDiaria } from '../scripts/generarAsistenciaDiaria.js';
import { createDailyAttendanceJob } from '../services/dailyAttendanceJob.js';

const now = new Date('2026-09-24T05:00:00Z'); // Medianoche de mañana en Lima.
function fixture(count = 1) {
  const employees = Array.from({ length: count }, (_, i) => ({
    id: `e${String(i).padStart(3, '0')}`, status: 'Activo', department_name: 'Ventas',
    hire_date: new Date('2026-01-01T00:00:00Z'),
  }));
  const schedules = [{ departments: ['Ventas'], thursday_start: '08:00', thursday_end: '17:00' }];
  const records = [];
  const holidays = [];
  const prisma = {
    work_schedule: { findMany: async () => schedules },
    holiday: { findMany: async () => holidays },
    contract: { findMany: async () => [] },
    employee: {
      count: async () => employees.length,
      findMany: async ({ cursor, take, where }) => employees
        .filter(e => (!where.id || e.id === where.id) && (!cursor || e.id > cursor.id)).slice(0, take),
    },
    attendance_record: {
      findMany: async ({ where }) => records.filter(r => r.employee_id === where.employee_id &&
        (!where.date || r.date.getTime() === where.date.getTime())),
      createMany: async ({ data, skipDuplicates }) => {
        assert.equal(skipDuplicates, true);
        let count = 0;
        for (const record of data) {
          if (!records.some(r => r.employee_id === record.employee_id && +r.date === +record.date)) {
            records.push(record); count++;
          }
        }
        return { count };
      },
    },
  };
  return { prisma, employees, schedules, records, holidays };
}

test('mañana crea sin marcaciones para todos, incluso después del primer lote de 200', async () => {
  const ctx = fixture(201);
  const result = await generarAsistenciaDiaria({}, { prisma: ctx.prisma, now });
  assert.equal(result.employees_processed, 201);
  assert.equal(result.records_created, 201);
  assert.equal(result.date, '2026-09-24');
  assert.ok(ctx.records.every(r => r.clock_in === null && r.clock_out === null && r.status === 'Ausente'));
  assert.equal(ctx.records[0].date.getTime(), new Date('2026-09-24T00:00:00').getTime());
});

test('reintentos conservan justificaciones y recuperan horarios agregados después', async () => {
  const ctx = fixture();
  ctx.schedules.length = 0;
  assert.equal((await generarAsistenciaDiaria({}, { prisma: ctx.prisma, now })).records_created, 0);
  ctx.schedules.push({ employee_id: 'e000', thursday_start: '08:00', thursday_end: '17:00' });
  assert.equal((await generarAsistenciaDiaria({}, { prisma: ctx.prisma, now })).records_created, 1);
  Object.assign(ctx.records[0], { status: 'Justificado', notes: 'Descanso médico', manually_protected_fields: ['status'] });
  const before = structuredClone(ctx.records);
  assert.equal((await generarAsistenciaDiaria({}, { prisma: ctx.prisma, now })).records_created, 0);
  assert.deepEqual(ctx.records, before);
});

test('respeta ceses, ingresos futuros, feriados y días sin horario', async () => {
  for (const change of [
    c => { c.employees[0].termination_date = new Date('2026-09-23'); },
    c => { c.employees[0].hire_date = new Date('2026-09-25'); },
    c => { c.holidays.push({ date: new Date('2026-09-24') }); },
    c => { c.schedules[0].thursday_start = null; },
  ]) {
    const ctx = fixture(); change(ctx);
    assert.equal((await generarAsistenciaDiaria({}, { prisma: ctx.prisma, now })).records_created, 0);
  }
});

test('conserva exoneración, backfill y cambio de día en Perú', async () => {
  const ctx = fixture(); ctx.schedules[0].exempt_from_clocking = true;
  const result = await generarAsistenciaDiaria({ date_from: '2026-09-23', employee_id: 'e000' }, { prisma: ctx.prisma, now });
  assert.equal(result.records_created, 1);
  assert.equal(ctx.records[0].clock_in, '08:00');
  assert.equal(ctx.records[0].worked_hours, 8);
  assert.equal(ctx.records[0].status, 'Completo');
  const previousDay = await generarAsistenciaDiaria({}, { prisma: fixture().prisma, now: new Date('2026-09-24T04:59:59Z') });
  assert.equal(previousDay.date, '2026-09-23');
  assert.equal(previousDay.records_created, 0);
});

test('errores de un empleado no impiden generar los siguientes', async () => {
  const ctx = fixture(2);
  ctx.employees[0].hire_date = 'fecha inválida';
  const result = await generarAsistenciaDiaria({}, { prisma: ctx.prisma, now });
  assert.equal(result.errors[0].employee_id, 'e000');
  assert.equal(result.records_created, 1);
});

test('tarea evita solapamientos, registra errores parciales y libera bloqueo tras fallar', async () => {
  let release;
  const pending = new Promise(resolve => { release = resolve; });
  let calls = 0;
  const errors = [];
  const run = createDailyAttendanceJob({
    getDate: () => '2026-09-24',
    updateStatuses: async () => { throw new Error('fallo ceses'); },
    generate: async () => {
      calls++;
      if (calls === 1) { await pending; throw new Error('fallo temporal'); }
      return { date: '2026-09-24', employees_processed: 2, records_created: 1, errors: [{ employee_id: 'e1' }] };
    },
    logger: { log: () => {}, error: (...args) => errors.push(args) },
  });
  const first = run();
  await run();
  release();
  await first;
  assert.equal(calls, 1);
  await run();
  assert.equal(calls, 2);
  assert.ok(errors.some(args => args[1] === 'fallo temporal'));
  assert.ok(errors.some(args => Array.isArray(args[1]) && args[1][0].employee_id === 'e1'));
});


test('tras completar el día no consulta de nuevo hasta el siguiente día', async () => {
  let date = '2026-09-24';
  let generations = 0;
  let updates = 0;
  const run = createDailyAttendanceJob({
    getDate: () => date,
    updateStatuses: async () => { updates++; return { updated: 0 }; },
    generate: async () => { generations++; return { success: true, date, employees_processed: 1, records_created: 1 }; },
    logger: { log() {}, error() {} },
  });
  await run();
  for (let i = 0; i < 24; i++) await run();
  assert.equal(generations, 1);
  assert.equal(updates, 1);
  date = '2026-09-25';
  await run();
  assert.equal(generations, 2);
  assert.equal(updates, 2);
});

test('errores parciales permiten reintentar y un éxito detiene las consultas', async () => {
  let calls = 0;
  const run = createDailyAttendanceJob({
    getDate: () => '2026-09-24',
    updateStatuses: async () => ({ updated: 0 }),
    generate: async () => ({ success: true, date: '2026-09-24', employees_processed: 2,
      records_created: 1, errors: ++calls === 1 ? [{ employee_id: 'e1' }] : undefined }),
    logger: { log() {}, error() {} },
  });
  await run();
  await run();
  await run();
  assert.equal(calls, 2);
});
