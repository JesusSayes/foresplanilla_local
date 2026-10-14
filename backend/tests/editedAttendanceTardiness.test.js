import test from 'node:test';
import assert from 'node:assert/strict';
import prisma from '../config/prisma.js';
import { editedAttendanceTardiness } from '../services/editedAttendanceTardiness.js';
import { approve } from '../controllers/attendance/editRequestController.js';
import { update } from '../controllers/attendance/recordController.js';
import { getProtectedFields, protectValue } from '../utils/manualAttendanceProtection.js';

const record = { id: 'r1', employee_id: 'e1', date: new Date('2026-08-25'), status: 'Justificado', clock_in: '12:45', clock_out: '17:41', scheduled_start: '07:00', scheduled_end: '17:36', is_late: true, late_minutes: 345, manually_protected_fields: ['worked_hours'], worked_hours: 4.85 };
const context = (schedule = {}, incidents = []) => ({
  employee: { findUnique: async () => ({ id: 'e1' }) },
  work_schedule: { findMany: async () => [{ employee_id: 'e1', is_active: true, tuesday_start: '07:00', tuesday_end: '17:36', ...schedule }] },
  attendance_incident: { findMany: async () => incidents },
});
const response = () => ({ statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; } });
const mockModel = (t, name, value) => {
  const previous = prisma[name]; prisma[name] = value;
  t.after(() => { prisma[name] = previous; });
};

for (const [name, changes, schedule, incidents, minutes] of [
  ['corrige Justificado', { clock_in: '07:00' }, {}, [], 0],
  ['mantiene tardanza real', { clock_in: '07:30' }, {}, [], 30],
  ['respeta tolerancia configurada', { clock_in: '07:15' }, { tolerance_minutes: 20 }, [], 0],
  ['respeta justificación aprobada', { clock_in: '08:00' }, {}, [{ justified_time_start: '07:00', justified_time_end: '08:00' }], 0],
  ['considera otros segmentos', { clock_in_2: '07:00', clock_out_2: '08:00' }, {}, [], 0],
  ['turno nocturno', { clock_in: '22:20', clock_out: '06:00', scheduled_start: '22:00', scheduled_end: '06:00' }, { tuesday_start: '22:00', tuesday_end: '06:00' }, [], 20],
]) test(name, async () => {
  assert.deepEqual(await editedAttendanceTardiness(context(schedule, incidents), record, changes), { is_late: minutes > 0, late_minutes: minutes });
});

test('no recalcula cambios ajenos a marcaciones y conserva vacaciones', async () => {
  assert.deepEqual(await editedAttendanceTardiness({}, record, { notes: 'Nota' }), {});
  assert.deepEqual(await editedAttendanceTardiness({}, { ...record, status: 'Vacaciones' }, { clock_in: '07:00' }), { is_late: false, late_minutes: 0 });
});

test('edición directa guarda marcación y tardanza juntas sin cambiar otras métricas', async t => {
  for (const [name, model] of Object.entries(context())) mockModel(t, name, model);
  mockModel(t, 'holiday', { findMany: async () => [] });
  let saved;
  mockModel(t, 'attendance_record', {
    findUnique: async () => record,
    update: async ({ data }) => { saved = { ...record, ...data }; return saved; },
  });
  const res = response();
  await update({ params: { id: 'r1' }, accessibleEmployeeIds: ['e1'], body: { clock_in: '07:00' } }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(saved.is_late, false);
  assert.equal(saved.late_minutes, 0);
  assert.equal(saved.worked_hours, record.worked_hours);
  assert.ok(saved.manually_protected_fields.includes('worked_hours'));
});

test('aprobación persiste tardanza antes del recálculo posterior y mantiene protecciones', async t => {
  let saved;
  const tx = {
    ...context(),
    attendance_record: {
      findUnique: async () => record,
      update: async ({ data }) => { saved = { ...record, ...data }; return saved; },
    },
    attendance_edit_request: {
      findUnique: async () => ({ id: 'edit1', employee_id: 'e1', attendance_record_id: 'r1', status: 'Pendiente', requested_values: { clock_in: '07:00' } }),
      update: async ({ data }) => ({ ...data, attendance_date: record.date, attendance_record_id: 'r1' }),
    },
  };
  t.mock.method(prisma, '$transaction', async fn => fn(tx));
  mockModel(t, 'attendance_logs', { findMany: async () => { throw new Error('Recálculo posterior no disponible'); } });
  t.mock.method(console, 'error', () => {});
  const req = { params: { id: 'edit1' }, body: {}, accessibleEmployeeIds: ['e1'], access: { employee: { id: 'reviewer' } } };
  const res = response(); await approve(req, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.status, 'Aprobada');
  assert.ok(res.body.warning);
  assert.equal(saved.clock_in, '07:00');
  assert.equal(saved.is_late, false);
  assert.equal(saved.late_minutes, 0);
  const fields = getProtectedFields(saved);
  assert.equal(protectValue(fields, 'late_minutes', saved.late_minutes, 345), 0);
  assert.equal(protectValue(fields, 'worked_hours', saved.worked_hours, 9.6), 4.85);
  saved = null;
  const denied = response(); await approve({ ...req, accessibleEmployeeIds: ['other'] }, denied);
  assert.equal(denied.statusCode, 403);
  assert.equal(saved, null);
});
