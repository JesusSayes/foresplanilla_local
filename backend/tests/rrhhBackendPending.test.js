import test from 'node:test';
import assert from 'node:assert/strict';
import prisma from '../config/prisma.js';
import pool from '../config/database.js';
import contracts from '../routes/contracts.js';
import { create, update } from '../controllers/derechohabienteController.js';
import { create as compensate, update as editCompensation } from '../controllers/attendance/incidentController.js';

const response = () => ({ statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } });
const mockModel = (t, name, value) => {
  const original = prisma[name]; prisma[name] = value;
  t.after(() => { prisma[name] = original; });
};
const fields = { employee_id: 'e1', last_name_paterno: 'Paterno', last_name_materno: 'Materno', phone: '123', email: 'test@example.com', address: 'Calle', country_code: 'PER', ubigeo: '150101', address_reference: 'Referencia', address2: 'Otra', ubigeo2: '150102', address_reference2: 'Referencia 2', city_code: '01', conception_month: '2026-01', health_center_indicator: '1', document_type_sustento: 'Acta', document_number_sustento: '1234', deregistration_date: '2026-10-15' };
for (const handler of [create, update]) test(`derechohabiente ${handler.name}: conserva campos y protege metadatos`, async t => {
  let saved;
  mockModel(t, 'derechohabiente', {
    findUnique: async () => ({ employee_id: 'e1' }),
    create: async ({ data }) => { saved = data; return data; },
    update: async ({ data }) => { saved = data; return data; },
  });
  const res = response();
  await handler({ params: { id: 'd1' }, accessibleEmployeeIds: ['e1'], body: { ...fields, created_by: 'spoof', unknown: 'ignore' } }, res);
  assert.ok(res.statusCode < 300);
  for (const [key, value] of Object.entries(fields)) assert.deepEqual(saved[key], key === 'deregistration_date' ? new Date(value) : value);
  assert.notEqual(saved.created_by, 'spoof'); assert.equal(saved.unknown, undefined);
});

test('edición parcial de derechohabiente no borra dirección ni baja', async t => {
  mockModel(t, 'derechohabiente', {
    findUnique: async () => ({ employee_id: 'e1' }),
    update: async ({ data }) => { assert.equal(data.address, undefined); assert.equal(data.deregistration_date, undefined); return data; },
  });
  const res = response(); await update({ params: { id: 'd1' }, accessibleEmployeeIds: ['e1'], body: { first_name: 'Nombre' } }, res);
  assert.equal(res.statusCode, 200);
});

for (const reserved of [[], [{ hours_to_adjust: 1, late_minutes_to_adjust: 0 }]]) test(`compensación controla reservas activas (${reserved.length})`, async t => {
  let writes = 0;
  t.mock.method(prisma, '$transaction', async (fn, options) => {
    assert.equal(options.isolationLevel, 'Serializable');
    return fn({
      attendance_record: { findUnique: async () => ({ id: 'r1', employee_id: 'e1', date: new Date('2026-10-15'), overtime_hours_25: 1, late_minutes: 0 }), update: async () => {} },
      attendance_incident: {
        findMany: async ({ where }) => { assert.equal(where.status, 'Pendiente'); return reserved; },
        create: async ({ data }) => { writes++; return data; },
      },
    });
  });
  const res = response();
  await compensate({ accessibleEmployeeIds: ['e1'], body: { employee_id: 'e1', attendance_record_id: 'r1', incident_date: '2026-10-15', incident_type: 'Compensación de Tardanza', status: 'Pendiente', hours_to_adjust: 1 } }, res);
  assert.equal(res.statusCode, reserved.length ? 400 : 201); assert.equal(writes, reserved.length ? 0 : 1);
});

test('contrato sincroniza remuneración dentro de la transacción', async t => {
  const commands = [];
  t.mock.method(pool, 'connect', async () => ({ release() {}, query: async (sql, params) => {
    commands.push(sql);
    if (sql.startsWith('INSERT')) return { rows: [{ employee_id: 'e1', status: 'Vigente', salary: 1500 }] };
    if (sql.startsWith('UPDATE employee')) {
      assert.deepEqual(params, ['e1']); assert.match(sql, /base_salary = COALESCE\(c.salary, e.base_salary\)/);
      assert.match(sql, /start_date <=/); assert.match(sql, /end_date >=/);
    }
    return { rows: [] };
  } }));
  const handler = contracts.stack.find(layer => layer.route?.path === '/' && layer.route.methods.post).route.stack.at(-1).handle;
  const res = response(); await handler({ accessibleEmployeeIds: ['e1'], body: { employee_id: 'e1', status: 'Vigente', salary: 1500 } }, res);
  assert.equal(res.statusCode, 201); assert.equal(commands[0], 'BEGIN'); assert.equal(commands.at(-1), 'COMMIT');
  assert.ok(commands.some(sql => sql.startsWith('UPDATE employee')));
});

for (const status of ['Pendiente', 'Rechazada']) test(`editar compensación ${status} comprueba saldo y excluye su propia reserva`, async t => {
  const existing = { id: 'i1', employee_id: 'e1', attendance_record_id: 'r1', incident_date: new Date('2026-10-15'), incident_type: 'Compensación de Tardanza', status, hours_to_adjust: 1 };
  mockModel(t, 'attendance_incident', { findUnique: async () => existing });
  t.mock.method(prisma, '$transaction', async fn => fn({
    attendance_record: { findUnique: async () => ({ id: 'r1', employee_id: 'e1', date: existing.incident_date, overtime_hours_25: 1 }) },
    attendance_incident: {
      findMany: async ({ where }) => { assert.deepEqual(where.id, { not: 'i1' }); return []; },
      update: async ({ data }) => ({ ...existing, ...data }),
    },
  }));
  const res = response();
  await editCompensation({ params: { id: 'i1' }, accessibleEmployeeIds: ['e1'], body: { status: 'Pendiente', hours_to_adjust: 1 } }, res);
  assert.equal(res.statusCode, 200);
});
