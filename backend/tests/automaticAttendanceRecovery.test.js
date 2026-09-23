import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { planRecovery, applyRecovery } from '../scripts/recovery/automaticAttendanceRecovery.js';

const snapshot = { id: 'r1', date: '2026-09-23', created_date: '2026-09-23 13:24:00.000',
  updated_date: '2026-09-23 13:24:00.000', clock_in: '08:00', clock_out: '17:36', horario_vigente_id: 's1' };
function context() {
  return {
    record: { id: 'r1', employee_id: 'e1', date: new Date('2026-09-23T00:00:00Z'),
      created_date: new Date('2026-09-23T13:24:00Z'), updated_date: new Date('2026-09-23T13:24:00Z'),
      clock_in: '08:00', clock_out: '17:36', notes: 'Marcación automática - Exonerado de marcación física',
      status: 'Completo', manually_protected_fields: [], overtime_hours_25: 0, overtime_hours_35: 0 },
    employee: { id: 'e1', document_number: '12345678', department_name: 'VENTAS', attendance_method: 'MARCADOR' },
    schedules: [{ id: 's1', employee_id: 'e1', is_active: true, effective_from: new Date('2026-01-01'),
      exempt_from_clocking: false, wednesday_start: '08:00', wednesday_end: '17:36', break_duration_minutes: 60 }],
    edits: 0, incidents: 0, alerts: 0, logs: [],
  };
}
const biotime = [
  { id: 100, emp_code: '12345678', punch_time: new Date('2026-09-23T13:12:00Z') },
  { id: 101, emp_code: '12345678', punch_time: new Date('2026-09-23T22:02:00Z') },
];

test('manifiesto restringido a 39 IDs únicos y fecha del incidente', async () => {
  const snapshots = JSON.parse(await readFile(new URL('../scripts/recovery/automaticAttendance20260923.json', import.meta.url)));
  assert.equal(snapshots.length, 39);
  assert.equal(new Set(snapshots.map(s => s.id)).size, 39);
  assert.ok(snapshots.every(s => s.date === '2026-09-23'));
});

test('sin fuentes no propone cambios ni convierte el registro en ausente', () => {
  const plan = planRecovery(snapshot, context());
  assert.match(plan.reason, /Sin marcaciones/);
  assert.equal(plan.patch, undefined);
});

test('recupera horas reales, calcula tardanza e importa evidencias Biotime', () => {
  const original = context();
  const plan = planRecovery(snapshot, original, { biotime });
  assert.equal(plan.patch.clock_in, '08:12');
  assert.equal(plan.patch.clock_out, '17:02');
  assert.equal(plan.patch.late_minutes, 12);
  assert.equal(plan.patch.status, 'Completo');
  assert.equal(plan.newLogs.length, 2);
  assert.ok(plan.newLogs.every(log => log.is_used_for_calculation && !Object.hasOwn(log, '_is_within_window')));
  assert.deepEqual(original, context());
});

test('una entrada real produce incompleto; no inventa salida', () => {
  const plan = planRecovery(snapshot, context(), { biotime: biotime.slice(0, 1) });
  assert.equal(plan.patch.status, 'Incompleto');
  assert.equal(plan.patch.clock_out, null);
  assert.equal(plan.patch.is_absent, false);
});

test('combina logs locales con Biotime sin duplicar la misma marcación', () => {
  const ctx = context();
  ctx.logs = [{ id: 'local1', punch_time: biotime[0].punch_time, attendance_record_id: 'r1' }];
  const plan = planRecovery(snapshot, ctx, { biotime });
  assert.equal(plan.newLogs.length, 1);
  assert.equal(plan.patch.clock_out, '17:02');
});

test('no usa marcas de otra persona ni de otra fecha', () => {
  const plan = planRecovery(snapshot, context(), { biotime: [
    { ...biotime[0], emp_code: '87654321' },
    { ...biotime[0], punch_time: new Date('2026-09-24T13:12:00Z') },
  ] });
  assert.equal(plan.patch, undefined);
});

test('no sobrescribe cambios, protecciones, solicitudes o exoneraciones legítimas', () => {
  for (const change of [
    c => { c.record.updated_date = new Date(); },
    c => { c.record.manually_protected_fields = ['clock_in']; },
    c => { c.record.last_approved_edit_id = 'edit'; },
    c => { c.record.status = 'Vacaciones'; },
    c => { c.edits = 1; }, c => { c.incidents = 1; }, c => { c.alerts = 1; },
    c => { c.schedules[0].exempt_from_clocking = true; },
    c => { c.record.clock_in_2 = '19:00'; },
  ]) {
    const ctx = context(); change(ctx);
    assert.equal(planRecovery(snapshot, ctx, { biotime }).patch, undefined);
  }
});

test('API histórica ausente o contradictoria queda pendiente', () => {
  const ctx = context(); ctx.employee.attendance_method = 'API FORESPAMA';
  assert.equal(planRecovery(snapshot, ctx).patch, undefined);
  const external = [{ numero_documento: '12345678', fecha: '2026-09-23', hora_entrada: '08:15', hora_salida: '17:00' }];
  const plan = planRecovery(snapshot, ctx, { external });
  assert.equal(plan.patch.clock_in, '08:15');
  assert.equal(plan.newLogs.length, 0);
  assert.equal(planRecovery(snapshot, ctx, { external: [...external, { ...external[0], hora_entrada: '09:00' }] }).patch, undefined);
});

function mockDb(ctx, writes) {
  const tx = {
    attendance_record: { findUnique: async () => ctx.record, update: async args => { writes.push(args); return args.data; } },
    employee: { findUnique: async () => ctx.employee },
    work_schedule: { findMany: async () => ctx.schedules },
    attendance_edit_request: { count: async () => ctx.edits },
    attendance_incident: { count: async () => ctx.incidents },
    overtime_alert: { count: async () => ctx.alerts },
    attendance_logs: { findMany: async () => ctx.logs, createMany: async args => writes.push(args) },
  };
  return { $transaction: async fn => fn(tx) };
}

test('aplicación verifica concurrencia antes de escribir y limita la actualización al ID', async () => {
  const ctx = context();
  const plan = planRecovery(snapshot, ctx, { biotime });
  const writes = [];
  const changed = context(); changed.record.updated_date = new Date();
  await assert.rejects(applyRecovery(mockDb(changed, writes), plan), /cambiaron/);
  assert.equal(writes.length, 0);
  await applyRecovery(mockDb(context(), writes), plan);
  assert.equal(writes.length, 2);
  assert.deepEqual(writes[1].where, { id: 'r1' });
  assert.equal(writes[1].data.clock_in, '08:12');
});
