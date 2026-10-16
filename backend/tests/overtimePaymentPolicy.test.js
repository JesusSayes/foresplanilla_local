import test from 'node:test';
import assert from 'node:assert/strict';
import prisma from '../config/prisma.js';
import pool from '../config/database.js';
import { validateOvertimePaymentPolicy } from '../services/overtimePaymentPolicy.js';
import { create, bulkCreate, update, bulkUpdate } from '../controllers/payroll/payslipController.js';
import { createEmployee, updateEmployee } from '../controllers/employeeController.js';

const response = () => ({ statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } });
const record = { id: 'p1', employee_id: 'e1', year: 2026, month: 10, overtime_pay: 100, total_income: 1100, net_pay: 1000, status: 'Calculada' };
const request = body => ({ body, params: { id: 'p1' }, query: {}, accessibleEmployeeIds: ['e1', 'e2'], user: { id: 'u1', email: 'test@example.com' } });
const model = (t, name, value) => { const original = prisma[name]; prisma[name] = value; t.after(() => { prisma[name] = original; }); };
const setup = (t, mode = 'compensation_only', currentRecord = record) => {
  const writes = [];
  const db = {
    $queryRawUnsafe: async (sql, id) => {
      assert.match(sql, /FOR SHARE/);
      if (sql.includes('horasextrasmanual')) return [];
      assert.match(sql, /overtime_destination/);
      assert.match(sql, /overtime_authorized = true/);
      return mode === 'payment' || id === 'e2' ? [{ overtime_hours_25: 2, overtime_hours_35: 1 }] : [];
    },
    payslip: {
      findUnique: async () => currentRecord,
      findMany: async () => [currentRecord],
      create: async ({ data }) => { writes.push(data); return data; },
      createMany: async ({ data }) => { writes.push(...data); return { count: data.length }; },
      update: async ({ data }) => { writes.push(data); return { ...record, ...data }; },
      deleteMany: async () => { writes.push('delete'); },
    },
  };
  model(t, 'payslip', db.payslip);
  t.mock.method(prisma, '$transaction', async fn => fn(db));
  return { db, writes };
};

for (const [name, handler, body] of [
  ['crear', create, record],
  ['crear lote', bulkCreate, [{ ...record, employee_id: 'e2' }, record]],
  ['aprobar', update, { status: 'Aprobada' }],
  ['aprobar lote', bulkUpdate, [{ id: 'p1', status: 'Aprobada' }]],
]) test(`${name}: bloquea HE de compensación antes de escribir`, async t => {
  const { writes } = setup(t);
  const req = request(body); req.query.replace = 'true';
  const res = response(); await handler(req, res);
  assert.equal(res.statusCode, 409); assert.match(res.body.error || res.body.message, /solo para compensación/);
  assert.deepEqual(writes, []);
});

for (const [name, handler, body] of [
  ['crear', create, record], ['crear lote', bulkCreate, [record]],
  ['aprobar', update, { status: 'Aprobada' }], ['aprobar lote', bulkUpdate, [{ id: 'p1', status: 'Aprobada' }]],
]) test(`${name}: conserva HE para empleados con pago habilitado`, async t => {
  const { writes } = setup(t, 'payment'); const res = response();
  await handler(request(body), res); assert.ok(res.statusCode < 300); assert.equal(writes.length, 1);
});

for (const patch of [
  { overtime_hours: 1 }, { overtime_hours_25: 1 }, { overtime_hours_35: 1 },
  { calculation_summary: { breakdown: { incomes: { items: [{ concept_category: 'Horas Extras', amount: 50 }] } } } },
  { calculation_summary: JSON.stringify({ breakdown: { incomes: { items: [{ name: 'Horas Extras al 35%', amount: 50 }] } } }) },
  { calculation_summary: { breakdown: { incomes: { items: [{ formula: 'horas_extras_25 * 10', amount: 50 }] } } } },
]) test(`detecta HE aunque overtime_pay sea cero: ${JSON.stringify(patch)}`, async t => {
  const { db } = setup(t);
  await assert.rejects(validateOvertimePaymentPolicy(db, [{ employee_id: 'e1', year: 2026, month: 10, overtime_pay: 0, ...patch }]), { status: 409 });
});

test('permite corregir una boleta retirando HE sin tocar asistencias', async t => {
  const { writes } = setup(t); const res = response();
  await update(request({ overtime_pay: 0, total_income: 1000, net_pay: 900 }), res);
  assert.equal(res.statusCode, 200); assert.equal(writes[0].overtime_pay, 0);
});

test('permite boletas sin HE para compensación y mantiene otros ingresos', async t => {
  setup(t); const body = { employee_id: 'e1', overtime_pay: 0, total_income: 1500, bonuses: 200 };
  const res = response(); await create(request(body), res); assert.equal(res.statusCode, 201); assert.equal(res.body.total_income, 1500);
});

test('revalida la política al cambiar el empleado de una boleta', async t => {
  const { writes } = setup(t, 'compensation_only', { ...record, employee_id: 'e2' });
  const res = response(); await update(request({ employee_id: 'e1', status: 'Pagada' }), res);
  assert.equal(res.statusCode, 409); assert.deepEqual(writes, []);
});

test('configuración inválida se rechaza sin escrituras', async t => {
  t.mock.method(pool, 'connect', async () => ({ query: async () => assert.fail('No escribir'), release() {} }));
  for (const handler of [createEmployee, updateEmployee]) {
    for (const value of [null, '', 'administrativo', true]) {
      const res = response(); await handler(request({ overtime_payment_mode: value }), res); assert.equal(res.statusCode, 400);
    }
  }
});

test('creación de empleado persiste la política parametrizada', async t => {
  t.mock.method(pool, 'query', async (sql, params) => {
    assert.match(sql, /overtime_payment_mode/); assert.equal(params.length, 61);
    assert.equal(params[60], 'compensation_only');
    return { rows: [{ id: 'e1', overtime_payment_mode: params[60] }] };
  });
  const res = response(); await createEmployee(request({ first_name: 'Empleado', overtime_payment_mode: 'compensation_only' }), res);
  assert.equal(res.statusCode, 201); assert.equal(res.body.overtime_payment_mode, 'compensation_only');
});

test('edición de empleado guarda política y respeta su alcance', async t => {
  const writes = [];
  t.mock.method(pool, 'query', async () => ({ rows: [{ column_name: 'overtime_payment_mode' }] }));
  t.mock.method(pool, 'connect', async () => ({ release() {}, query: async (sql, params) => {
    if (sql.startsWith('SELECT * FROM employee')) return { rows: [{ id: 'e1', overtime_payment_mode: 'payment' }] };
    if (sql.includes('UPDATE employee')) { writes.push(params); return { rows: [{ id: 'e1', overtime_payment_mode: 'compensation_only' }] }; }
    return { rows: [] };
  } }));
  const req = request({ overtime_payment_mode: 'compensation_only' }); req.params.id = 'e1';
  const res = response(); await updateEmployee(req, res); assert.equal(res.statusCode, 200); assert.equal(writes[0][0], 'compensation_only');
  req.params.id = 'other'; const denied = response(); await updateEmployee(req, denied); assert.equal(denied.statusCode, 403); assert.equal(writes.length, 1);
});
