import test from 'node:test';
import assert from 'node:assert/strict';
import prisma from '../config/prisma.js';
import { create as createIncident } from '../controllers/attendance/incidentController.js';
import { generate, filter as filterAlerts } from '../controllers/attendance/overtimeAlertController.js';
import { correctVacationWeekends } from '../controllers/attendance/vacationWeekendController.js';
import { syncOvertimeAlert } from '../services/overtimeAlertSync.js';
import { requireAnyPermission } from '../middleware/authorization.js';

const response = () => ({ statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } });
const mockModel = (t, model, implementation) => {
  const original = prisma[model]; prisma[model] = implementation;
  t.after(() => { prisma[model] = original; });
};
const record = { id: 'r1', employee_id: 'e1', date: new Date('2026-09-21'), clock_in: '09:12', clock_out: '18:12', late_minutes: 12, overtime_hours_25: 0.2, notes: 'Original' };
const request = () => ({ accessibleEmployeeIds: ['e1'], body: { employee_id: 'e1', attendance_record_id: 'r1', incident_date: '2026-09-21', incident_type: 'Compensación de Tardanza', status: 'Pendiente', late_minutes_to_adjust: 12, hours_to_adjust: 0.2 } });

test('compensación: solicitante sin permiso de edición guarda incidencia y asistencia juntas', async t => {
  const req = request(); req.access = { permissions: new Set(['attendance.view_own']) };
  const denied = response();
  requireAnyPermission('attendance.edit', 'attendance.approve_compensations', 'attendance.manage')(req, denied, () => assert.fail('No debe editar asistencias'));
  assert.equal(denied.statusCode, 403);
  const writes = [];
  t.mock.method(prisma, '$transaction', async fn => fn({
    attendance_incident: { create: async ({ data }) => { writes.push('incident'); return data; } },
    attendance_record: {
      findUnique: async () => record,
      update: async ({ data }) => { assert.equal(data.status, 'Compensación'); assert.match(data.notes, /^Original \|/); writes.push('record'); },
    },
  }));
  const res = response(); await createIncident(req, res);
  assert.equal(res.statusCode, 201); assert.deepEqual(writes, ['incident', 'record']);
});

for (const [name, changes, expected] of [
  ['empleado ajeno', { employee_id: 'e2' }, 403],
  ['fecha distinta', { incident_date: '2026-09-22' }, 400],
  ['sin saldo HE', { hours_to_adjust: 1 }, 400],
  ['tardanza excesiva', { late_minutes_to_adjust: 30 }, 400],
  ['sin minutos', { late_minutes_to_adjust: 0, hours_to_adjust: 0 }, 400],
]) test(`compensación rechaza ${name}`, async t => {
  t.mock.method(prisma, '$transaction', async fn => fn({ attendance_record: { findUnique: async () => record }, attendance_incident: { create: async () => assert.fail('No debe escribir') } }));
  const req = request(); Object.assign(req.body, changes);
  const res = response(); await createIncident(req, res); assert.equal(res.statusCode, expected);
});

for (const date of ['2026-09-21', { $gte: '2026-09-20', $lte: '2026-09-27' }, undefined]) {
  test(`alertas y vacaciones filtran antes de procesar: ${JSON.stringify(date)}`, async t => {
    let alertWhere;
    mockModel(t, 'attendance_record', { findMany: async ({ where }) => { alertWhere = where; return []; } });
    mockModel(t, 'employee', { findMany: async () => [] });
    mockModel(t, 'work_schedule', { findMany: async () => [] });
    mockModel(t, 'overtime_alert', { count: async ({ where }) => { assert.deepEqual(where.alert_date, alertWhere.date); return 0; } });
    const req = { user: {}, access: { employee: { role: 'admin' } }, accessibleEmployeeIds: ['e1'], body: date === undefined ? {} : { date } };
    const res = response(); await generate(req, res); assert.equal(res.statusCode, 200);
    assert.deepEqual(alertWhere.employee_id, { in: ['e1'] });
    if (date) {
      assert.equal(alertWhere.date.gte.toISOString().slice(0, 10), typeof date === 'string' ? date : date.$gte);
      assert.equal(alertWhere.date.lte.toISOString().slice(0, 10), typeof date === 'string' ? date : date.$lte);
    } else assert.equal(alertWhere.date, undefined);
    t.mock.method(prisma, '$transaction', async fn => fn({ attendance_record: { findMany: async ({ where }) => { assert.deepEqual(where, { ...alertWhere, status: 'Vacaciones' }); return []; } } }));
    const vacations = response(); await correctVacationWeekends(req, vacations); assert.equal(vacations.statusCode, 200);
  });
}

for (const date of ['', {}, { $gte: '2026-09-27', $lte: '2026-09-20' }, '2026-02-30']) test(`rechaza fecha inválida sin consultar: ${JSON.stringify(date)}`, async t => {
  mockModel(t, 'attendance_record', { findMany: async () => assert.fail('No debe consultar') });
  const req = { user: {}, access: { employee: { role: 'admin' } }, accessibleEmployeeIds: ['e1'], body: { date } };
  for (const handler of [generate, correctVacationWeekends]) { const res = response(); await handler(req, res); assert.equal(res.statusCode, 400); }
});

for (const status of ['Autorizado', 'Descartado', 'Rechazado']) test(`dos actualizaciones conservan decisión ${status} y cierran pendiente duplicado`, async t => {
  const reviewed = { id: 'reviewed', overtime_hours: 0.2, status, resolution_notes: 'Decisión original' };
  const alerts = [reviewed, { id: 'duplicate', overtime_hours: 0.2, status: 'Pendiente' }];
  const writes = [];
  t.mock.method(prisma, '$transaction', async fn => fn({
    attendance_record: { findUnique: async () => record },
    overtime_alert: {
      findMany: async () => alerts,
      create: async () => assert.fail('No debe recrear'),
      update: async ({ where, data }) => { assert.equal(where.id, 'duplicate'); Object.assign(alerts[1], data); writes.push(data); },
    },
  }));
  const context = { employees: new Map([['e1', { id: 'e1' }]]), schedules: [{ employee_id: 'e1', is_active: true, monday_start: '09:00', monday_end: '18:00' }] };
  await syncOvertimeAlert('r1', 'reviewer', context); await syncOvertimeAlert('r1', 'reviewer', context);
  assert.equal(writes.length, 1); assert.equal(alerts[1].status, 'Descartado'); assert.equal(reviewed.status, status); assert.equal(reviewed.resolution_notes, 'Decisión original');
});

test('alertas serializan fecha y HE como los espera la pantalla', async t => {
  mockModel(t, 'overtime_alert', { findMany: async () => [{ id: 'a1', alert_date: new Date('2026-09-21'), overtime_hours: '0.20' }] });
  t.mock.method(prisma, '$queryRawUnsafe', async () => []);
  const res = response(); await filterAlerts({ body: {}, accessibleEmployeeIds: ['e1'] }, res);
  assert.equal(res.body[0].alert_date, '2026-09-21'); assert.equal(res.body[0].overtime_hours, 0.2);
});
