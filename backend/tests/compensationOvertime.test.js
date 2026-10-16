import test from 'node:test';
import assert from 'node:assert/strict';
import prisma from '../config/prisma.js';
import { create, update } from '../controllers/attendance/incidentController.js';
import { compensationMinutes } from '../services/compensationOvertime.js';

const response = () => ({ statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; } });
const record = { id: 'r1', employee_id: 'e1', date: new Date('2026-10-15'), overtime_hours_25: 1, overtime_hours_35: 1 };
const incident = { employee_id: 'e1', attendance_record_id: 'r1', incident_date: '2026-10-15', incident_type: 'Compensación de Tardanza', status: 'Pendiente', hours_to_adjust: 1.5 };

for (const [name, reservations, hours, expected] of [
  ['consume 25 antes de 35', [], 1.5, [60, 30]],
  ['descuenta reservas nuevas', [{ overtime_minutes_25: 45, overtime_minutes_35: 0, hours_to_adjust: 0.75 }], 1, [15, 45]],
  ['descuenta reservas antiguas', [{ hours_to_adjust: 0.75 }], 1, [15, 45]],
  ['conserva minutos exactos', [], 1 / 60, [1, 0]],
]) test(name, async t => {
  t.mock.method(prisma, '$transaction', async fn => fn({
    attendance_record: { findUnique: async () => record, update: async () => ({}) },
    attendance_incident: { findMany: async () => reservations, create: async ({ data }) => {
      assert.deepEqual([data.overtime_minutes_25, data.overtime_minutes_35], expected);
      // Simular el redondeo de DECIMAL(18,2) en PostgreSQL.
      return { ...data, hours_to_adjust: Number(data.hours_to_adjust).toFixed(2) };
    } },
  }));
  const res = response();
  await create({ accessibleEmployeeIds: ['e1'], body: { ...incident, hours_to_adjust: hours } }, res);
  assert.equal(res.statusCode, 201);
  assert.equal(res.body.hours_to_adjust, (expected[0] + expected[1]) / 60);
});

test('editar recalcula el desglose sin confiar en los minutos enviados', async t => {
  const original = prisma.attendance_incident;
  prisma.attendance_incident = { findUnique: async () => ({ ...incident, id: 'i1' }) };
  t.after(() => { prisma.attendance_incident = original; });
  t.mock.method(prisma, '$transaction', async fn => fn({
    attendance_record: { findUnique: async () => record },
    attendance_incident: { findMany: async () => [], update: async ({ data }) => {
      assert.equal(data.overtime_minutes_25, 30);
      assert.equal(data.overtime_minutes_35, 0);
      return { ...incident, ...data };
    } },
  }));
  const res = response();
  await update({ accessibleEmployeeIds: ['e1'], params: { id: 'i1' }, body: { hours_to_adjust: 0.5, overtime_minutes_25: 999 } }, res);
  assert.equal(res.statusCode, 200);
});

test('usa minutos una vez y conserva históricos con defaults cero', () => {
  assert.equal(compensationMinutes({ hours_to_adjust: 0.02, overtime_minutes_25: 1 }), 1);
  assert.equal(compensationMinutes({ hours_to_adjust: 1.5, overtime_minutes_25: 60, overtime_minutes_35: 30 }), 90);
  assert.equal(compensationMinutes({ hours_to_adjust: 1.5, overtime_minutes_25: 0, overtime_minutes_35: 0 }), 90);
});

test('recalcular repetidamente descuenta una sola vez antes de alimentar planilla', async t => {
  const { default: controller } = await import('../controllers/attendance/recalcularAsistenciaController.js');
  let current = { ...record, date: new Date('2026-09-21'), scheduled_start: '09:00', scheduled_end: '18:00', clock_in: '09:00', clock_out: '21:00', overtime_authorized: true };
  const models = {
    employee: { findUnique: async () => ({ id: 'e1' }) },
    work_schedule: { findMany: async () => [{ employee_id: 'e1', is_active: true, monday_start: '09:00', monday_end: '18:00', break_duration_minutes: 60 }] },
    attendance_record: { findMany: async () => [current], update: async ({ data }) => { current = { ...current, ...data }; return current; } },
    attendance_incident: { findMany: async ({ select }) => {
      assert.equal(select.overtime_minutes_25, true);
      assert.equal(select.overtime_minutes_35, true);
      return [{ incident_date: current.date, incident_type: incident.incident_type, status: 'Aprobada', hours_to_adjust: 2.02, overtime_minutes_25: 120, overtime_minutes_35: 1 }];
    } },
    overtime_alert: { findMany: async () => [] },
    vacation_request: { findFirst: async () => null },
  };
  for (const [name, model] of Object.entries(models)) {
    const original = prisma[name]; prisma[name] = model;
    t.after(() => { prisma[name] = original; });
  }
  for (let n = 0; n < 2; n++) {
    const res = response();
    await controller.recalcularAsistencia({ user: {}, accessibleEmployeeIds: ['e1'], body: { employee_id: 'e1', date_from: '2026-09-21', date_to: '2026-09-21' } }, res);
    assert.equal(res.statusCode, 200, res.body?.error);
    assert.equal(current.overtime_hours_25, 0);
    assert.ok(Math.abs(current.overtime_hours_35 - 59 / 60) < 1e-9);
  }
});
