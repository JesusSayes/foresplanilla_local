import test from 'node:test';
import assert from 'node:assert/strict';
import * as backend from '../utils/attendanceMetrics.js';
import * as frontend from '../../src/lib/attendanceMetrics.js';
import prisma from '../config/prisma.js';
import { syncOvertimeAlert } from '../services/overtimeAlertSync.js';

const record = { id: 'r1', employee_id: 'e1', date: new Date('2026-09-21'),
  scheduled_start: '09:00', scheduled_end: '18:00', clock_in: '09:00', clock_out: '20:00' };
const cases = [
  ['jornada y dos horas adicionales', {}, 10, 120],
  ['entrada incompleta', { clock_out: null }, 0, 0],
  ['hueco entre segmentos', { clock_out: '18:00', clock_in_2: '19:00', clock_out_2: '20:00' }, 9, 60],
  ['segmentos superpuestos', { clock_in_2: '19:00', clock_out_2: '21:00' }, 11, 180],
  ['cruce de medianoche diurno', { clock_in: '16:00', clock_out: '02:00' }, 9, 480],
  ['segmentos nocturnos separados', { scheduled_start: '22:00', scheduled_end: '06:00', clock_in: '22:00', clock_out: '02:00', clock_in_2: '03:00', clock_out_2: '08:00' }, 8, 120],
  ['segmento posterior a turno nocturno', { scheduled_start: '22:00', scheduled_end: '06:00', clock_in: '07:00', clock_out: '08:00' }, 0, 60],
  ['entrada anticipada nocturna', { scheduled_start: '22:00', scheduled_end: '06:00', clock_in: '21:30', clock_out: '08:00' }, 9.5, 120],
  ['turno nocturno', { scheduled_start: '22:00', scheduled_end: '06:00', clock_in: '22:00', clock_out: '08:00' }, 9, 120],
];

for (const [name, changes, raw, additional] of cases) {
  test(`métricas locales y pantalla: ${name}`, () => {
    const r = { ...record, ...changes };
    const args = { record: r, schedStart: r.scheduled_start, schedEnd: r.scheduled_end };
    const metrics = backend.calcEffectiveMetrics(args);
    assert.deepEqual(metrics, frontend.calcEffectiveMetrics(args));
    assert.equal(metrics.rawWorkedHours, raw);
    assert.equal(backend.getAdditionalMinutes(r), additional);
    assert.equal(frontend.getAdditionalMinutes(r), additional);
  });
}

test('HE autorizadas incluyen anticipos completos sin contar huecos', () => {
  const schedule = { monday_start: '09:00', monday_end: '18:00', break_duration_minutes: 60 };
  const r = { ...record, clock_in: '08:00', clock_out: '18:00', clock_in_2: '19:00', clock_out_2: '22:00' };
  const paid = backend.calcularMetricas(r, schedule, '2026-09-21', true);
  assert.equal(paid.regular_hours, 8);
  assert.equal(paid.overtime_hours_25, 2);
  assert.equal(paid.overtime_hours_35, 2);
  assert.equal(paid.worked_hours, 12);
  const unpaid = backend.calcularMetricas(r, schedule, '2026-09-21', false);
  assert.equal(unpaid.overtime_hours_25 + unpaid.overtime_hours_35, 0);
  assert.equal(unpaid.worked_hours, 8);
});

test('las justificaciones cubren la tardanza sin inventar marcaciones', () => {
  const args = { record: { ...record, clock_in: '10:00', clock_out: '18:00' },
    schedStart: '09:00', schedEnd: '18:00',
    approvedIncidents: [{ justified_time_start: '09:00', justified_time_end: '10:00' }] };
  const metrics = backend.calcEffectiveMetrics(args);
  assert.deepEqual(metrics, frontend.calcEffectiveMetrics(args));
  assert.equal(metrics.justifiedHours, 1);
  assert.equal(metrics.remainingLateMinutes, 0);
  assert.equal(metrics.totalWorkedHours, 8);
});

test('sincronización local crea, actualiza y descarta sin reabrir decisiones', async t => {
  let current = record;
  let alerts = [];
  const writes = [];
  const tx = {
    employee: { findUnique: async () => ({ id: "e1" }) },
    work_schedule: { findMany: async () => [{ employee_id: "e1", is_active: true, monday_start: "09:00", monday_end: "18:00" }] },
    attendance_record: { findUnique: async () => current },
    overtime_alert: {
      findMany: async () => alerts,
      create: async args => writes.push(args),
      update: async args => writes.push(args),
    },
  };
  t.mock.method(prisma, '$transaction', async fn => fn(tx));
  await syncOvertimeAlert('r1', 'reviewer@example.test');
  assert.equal(writes.pop().data.overtime_hours, 2);
  for (const status of ['Autorizado', 'Aprobado', 'Descartado']) {
    alerts = [{ id: 'a1', status }];
    await syncOvertimeAlert('r1');
    assert.equal(writes.length, 0);
  }
  alerts = [{ id: 'a1', status: 'Pendiente' }];
  await syncOvertimeAlert('r1');
  assert.equal(writes.pop().data.overtime_hours, 2);
  current = { ...record, clock_out: '18:00' };
  await syncOvertimeAlert('r1');
  assert.equal(writes.pop().data.status, 'Descartado');
  current = { ...record, overtime_authorized: true };
  alerts = [];
  await syncOvertimeAlert('r1');
  assert.equal(writes.length, 0);
});

test('primera entrada y última salida respetan los segmentos de un turno nocturno', () => {
  const r = { scheduled_start: '22:00', scheduled_end: '06:00',
    clock_in: '22:00', clock_out: '02:00', clock_in_2: '03:00', clock_out_2: '08:00' };
  for (const metrics of [frontend, backend]) {
    assert.deepEqual(metrics.getSegmentClockTimes(r), { firstClockIn: '22:00', lastClockOut: '08:00' });
  }
  assert.equal(frontend.getPreShiftMinutes(r), 0);
});

for (const [name, marks, breakMinutes, expected] of [
  ['segmento único', { clock_in: '07:00', clock_out: '16:00' }, 60, 8],
  ['dos segmentos', { clock_in: '07:00', clock_out: '15:00', clock_in_2: '18:00', clock_out_2: '20:00' }, 60, 9],
  ['segundo incompleto', { clock_in: '07:00', clock_out: '15:00', clock_in_2: '18:00' }, 60, 7],
  ['duplicados', { clock_in: '07:00', clock_out: '16:00', clock_in_2: '07:00', clock_out_2: '16:00' }, 60, 8],
  ['sin refrigerio', { clock_in: '07:00', clock_out: '15:00', clock_in_2: '18:00', clock_out_2: '20:00' }, 0, 10],
]) {
  test(`consolidación RRHH: ${name}`, () => {
    const args = { record: marks, schedStart: '07:00', schedEnd: '16:00', breakMinutes };
    assert.equal(backend.calcEffectiveMetrics(args).rawWorkedHours, expected);
    assert.equal(frontend.calcEffectiveMetrics(args).rawWorkedHours, expected);
    assert.equal(frontend.calcEffectiveMetrics({ ...args, isUnscheduledDay: true }).rawWorkedHours, expected);
  });
}

test('anticipo incompleto genera aviso pero no horas extras pagables', () => {
  const r = { ...record, clock_in: '08:00', clock_out: null };
  const schedule = { monday_start: '09:00', monday_end: '18:00' };
  assert.equal(backend.getPreShiftMinutes(r), 60);
  const metrics = backend.calcularMetricas(r, schedule, '2026-09-21', true);
  assert.equal(metrics.overtime_hours_25 + metrics.overtime_hours_35, 0);
  assert.equal(metrics.worked_hours, 0);
});

test('alertas locales distinguen anticipos, decisiones y días libres', async t => {
  let current = { ...record, clock_in: '08:00' };
  let schedule = { employee_id: 'e1', is_active: true, monday_start: '09:00', monday_end: '18:00' };
  let alerts = [{ id: 'post', status: 'Descartado', overtime_hours: 2 }];
  const writes = [];
  const tx = {
    employee: { findUnique: async () => ({ id: 'e1' }) },
    work_schedule: { findMany: async () => [schedule] },
    attendance_record: { findUnique: async () => current },
    overtime_alert: {
      findMany: async () => alerts,
      create: async args => writes.push(args),
      update: async args => writes.push(args),
    },
  };
  t.mock.method(prisma, '$transaction', async fn => fn(tx));
  await syncOvertimeAlert('r1');
  assert.equal(writes.length, 1);
  assert.equal(writes.pop().data.overtime_hours, -1);
  alerts.push({ id: 'pre', status: 'Autorizado', overtime_hours: -1 });
  await syncOvertimeAlert('r1');
  assert.equal(writes.length, 0);
  alerts = [{ id: 'pre', status: 'Pendiente', overtime_hours: -1 }];
  current = { ...current, clock_in: '09:00', overtime_authorized: true };
  await syncOvertimeAlert('r1');
  assert.equal(writes.pop().data.status, 'Descartado');
  schedule = { ...schedule, monday_start: null, monday_end: null };
  alerts = [];
  current = { ...record, clock_in: '08:00' };
  await syncOvertimeAlert('r1');
  assert.equal(writes.length, 0);
});
