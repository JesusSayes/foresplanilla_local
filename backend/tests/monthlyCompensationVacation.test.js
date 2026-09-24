import test from 'node:test';
import assert from 'node:assert/strict';
import { computeCrossDayCompensation } from '../../src/lib/attendanceMetrics.js';
import { calcularMetricas } from '../utils/attendanceMetrics.js';
import { vacationAttendanceData, normalizeVacationAttendance, syncVacationAttendance } from '../services/vacationAttendance.js';

const employee = { id: 'e1', department_name: 'RRHH' };
const schedule = { employee_id: 'e1', is_active: true, monday_start: '07:00', monday_end: '16:00' };
const record = { id: 'r1', employee_id: 'e1', date: new Date('2026-09-21'), scheduled_start: '09:00', scheduled_end: '18:00', clock_in: '09:10', clock_out: '18:00' };

test('compensación mensual reparte saldo sin reutilizar minutos', () => {
  const result = computeCrossDayCompensation(
    [{ date: '2026-09-01', lateMinutes: 40 }, { date: '2026-09-02', lateMinutes: 30 }],
    [{ date: '2026-09-02', overtimeMinutes: 50 }, { date: '2026-09-03', overtimeMinutes: 10 }]
  );
  assert.equal(result.totalCompensated, 60);
  assert.deepEqual(result.remainingTardanza.map(d => d.minutes), [0, 10]);
  assert.deepEqual(result.remainingCompensable.map(d => d.minutes), [0, 0]);
});

for (const [date, expected] of [['2026-08-31', 0], ['2026-09-01', 30], ['2026-09-16', 30], ['2026-09-17', 0], ['2026-10-01', 0]]) {
  test(`compensación respeta fechas: ${date}`, () => {
    assert.equal(computeCrossDayCompensation([{ date: '2026-09-01', lateMinutes: 30 }], [{ date, overtimeMinutes: 30 }]).totalCompensated, expected);
  });
}

test('vacaciones limpian horarios en día libre, feriado y ausencia de horario', () => {
  for (const [date, schedules, holidays] of [
    ['2026-09-20', [schedule], []],
    ['2026-09-21', [schedule], [{ date: new Date('2026-09-21') }]],
    ['2026-09-21', [], []],
  ]) {
    const data = vacationAttendanceData({ ...record, date }, employee, schedules, holidays);
    assert.equal(data.scheduled_start, '');
    assert.equal(data.scheduled_end, '');
    assert.equal(data.late_minutes, 0);
    assert.equal(data.worked_hours, 0);
    assert.equal(data.is_absent, false);
    assert.equal(data.status, 'Vacaciones');
    assert.equal(Object.hasOwn(data, 'clock_in'), false);
  }
});

test('vacaciones respetan horario laborable y vigencia de asignación', () => {
  const data = vacationAttendanceData(record, employee, [schedule], []);
  assert.equal(Object.hasOwn(data, 'scheduled_start'), false);
  const expired = { ...schedule, effective_to: new Date('2026-09-01') };
  assert.equal(vacationAttendanceData(record, employee, [expired], []).scheduled_start, '');
});

test('recálculo no inventa horario ni faltas en días sin jornada', () => {
  for (const config of [null, { ...schedule, monday_start: '' }]) {
    const metrics = calcularMetricas(record, config, '2026-09-21', true);
    assert.equal(metrics.scheduled_start, null);
    assert.equal(metrics.scheduled_end, null);
    assert.equal(metrics.late_minutes, 0);
    assert.equal(metrics.is_absent, false);
    assert.equal(metrics.overtime_hours_25, 0);
  }
  assert.equal(calcularMetricas(record, schedule, '2026-09-21', false).scheduled_start, '07:00');
});

test('normalización conserva permisos sin goce y justificaciones ajenas a vacaciones', async () => {
  for (const status of ['Permiso sin goce', 'Justificado', 'Completo']) {
    assert.deepEqual(await normalizeVacationAttendance({}, { ...record, status }), {});
  }
});

test('automatización local limita actualizaciones al empleado y rango aprobado', async () => {
  const writes = [];
  const db = {
    employee: { findUnique: async () => employee },
    work_schedule: { findMany: async () => [schedule] },
    holiday: { findMany: async () => [] },
    attendance_record: {
      findMany: async ({ where }) => {
        assert.equal(where.employee_id, 'e1');
        assert.equal(where.date.gte.toISOString().slice(0, 10), '2026-09-20');
        assert.equal(where.date.lte.toISOString().slice(0, 10), '2026-09-21');
        return [{ ...record, date: new Date('2026-09-20') }];
      },
      update: async args => writes.push(args),
    },
  };
  const vacation = { employee_id: 'e1', status: 'Aprobada', request_type: 'Vacaciones', start_date: new Date('2026-09-20'), end_date: new Date('2026-09-21') };
  await syncVacationAttendance(db, { ...vacation, status: 'Pendiente' });
  await syncVacationAttendance(db, { ...vacation, request_type: 'Permiso sin goce' });
  assert.equal(writes.length, 0);
  await syncVacationAttendance(db, vacation);
  assert.equal(writes.length, 1);
  assert.equal(writes[0].where.id, 'r1');
  assert.equal(writes[0].data.scheduled_start, '');
});
