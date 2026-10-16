import test from 'node:test';
import assert from 'node:assert/strict';
import pool from '../config/database.js';
import router from '../routes/payroll/supplements.js';
import { calculateQuinta, serializeSupplement, validateSupplement } from '../services/payrollSupplements.js';

const overtime = { employee_id: 'e1', month: 10, year: 2026, payroll_type: 'Mensual', reason: 'Regularización', overtime_hours_25: 2, overtime_minutes_25: 30 };
const request = (body = {}, overrides = {}) => ({ body, params: { id: 'r1' }, query: {}, user: { email: 'admin@test.local' }, accessibleEmployeeIds: ['e1'], ...overrides });
const route = (path, method) => router.stack.find(layer => layer.route?.path === path && layer.route.methods[method]).route.stack;
const call = async (path, method, req) => {
  const res = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; }, send() { return this; } };
  await route(path, method).at(-1).handle(req, res, error => { throw error; });
  return res;
};
const mockTransaction = (t, action) => {
  const commands = [];
  t.mock.method(pool, 'connect', async () => ({
    query: async (sql, params) => { commands.push(sql); return action(sql, params); }, release() {},
  }));
  return commands;
};

test('valida períodos, importes, minutos y campos no permitidos', () => {
  assert.equal(validateSupplement('HorasExtrasManual', overtime, true).status, 'Activo');
  for (const patch of [{ month: 0 }, { month: 13 }, { year: 1 }, { overtime_minutes_25: 60 }, { overtime_hours_25: -1 }, { overtime_hours_25: '2' }, { reason: ' ' }, { id: 'spoof' }, { reason: null }]) {
    assert.throws(() => validateSupplement('HorasExtrasManual', { ...overtime, ...patch }, true), { status: 400 });
  }
  assert.throws(() => validateSupplement('VentaVacaciones', { amount: -5 }), { status: 400 });
  assert.throws(() => validateSupplement('QuintaCategoriaCalculo', { calculation_mode: 'manual', manual_amount: 0, manual_reason: '' }), { status: 400 });
});

test('serializa NUMERIC como números para evitar concatenación de horas en React', () => {
  const row = serializeSupplement('HorasExtrasManual', { overtime_hours_25: '2.00', overtime_minutes_25: 30 });
  assert.equal(row.overtime_hours_25 + row.overtime_minutes_25 / 60, 2.5);
});

test('conserva la proyección de main y respeta retención manual cero', () => {
  const config = { id: 'cfg', uit_amount: 1000, annual_deduction_uit: 7, tax_brackets: [{ from_uit: 0, to_uit: 999, rate: 10 }] };
  const result = calculateQuinta({ employee_id: 'e1', year: 2026, month: 12, remuneration: 2000, config, prior: [{ month: 1, calculation_mode: 'manual', manual_amount: 0, current_month_retention: 500 }, { month: 2, current_month_retention: 200 }] });
  assert.equal(result.projected_annual_income, 24000);
  assert.equal(result.projected_annual_tax, 1700);
  assert.equal(result.prior_retentions, 200);
  assert.equal(result.current_month_retention, 1500);
});

test('listado aplica alcance de empleados y parametriza filtros', async t => {
  let captured;
  t.mock.method(pool, 'query', async (sql, params) => { captured = { sql, params }; return { rows: [] }; });
  const res = await call('/HorasExtrasManual/filter', 'post', request({ status: 'Activo', month: 10 }));
  assert.equal(res.statusCode, 200);
  assert.match(captured.sql, /employee_id = ANY\(\$1::text\[\]\)/);
  assert.deepEqual(captured.params, [['e1'], 'Activo', 10]);
  assert.equal((await call('/HorasExtrasManual', 'get', request({}, { query: { sort: 'id; DROP TABLE employee' } }))).statusCode, 400);
});

test('rechaza crear horas para otro empleado sin consultar la base', async t => {
  const db = t.mock.method(pool, 'connect', async () => { throw new Error('No consultar'); });
  assert.equal((await call('/HorasExtrasManual', 'post', request({ ...overtime, employee_id: 'other' }))).statusCode, 403);
  assert.equal(db.mock.callCount(), 0);
});

test('no permite crear ni revertir horas en planillas cerradas', async t => {
  const commands = mockTransaction(t, async sql => {
    if (sql.includes('public.horasextrasmanual')) return { rows: [{ ...overtime, status: 'Activo' }] };
    if (sql.includes('public.employee') || sql.includes('public.payslip')) return { rows: [{ id: 'closed' }] };
    return { rows: [] };
  });
  assert.equal((await call('/HorasExtrasManual', 'post', request(overtime))).statusCode, 400);
  assert.equal((await call('/HorasExtrasManual/:id', 'put', request({ status: 'Revertido' }))).statusCode, 400);
  assert.ok(commands.includes('ROLLBACK'));
  assert.ok(!commands.some(sql => /^(INSERT|UPDATE)/.test(sql)));
});

test('crea horas con identidad del token, nunca la del cliente', async t => {
  let inserted;
  mockTransaction(t, async (sql, params) => {
    if (sql.includes('SELECT id FROM public.employee')) return { rows: [{ id: 'e1' }] };
    if (sql.includes('FROM attendance_record')) return { rows: [{ id: 'r1', overtime_authorized: true, overtime_destination: 'pago' }] };
    if (sql.startsWith('INSERT')) { inserted = params; return { rows: [{ ...overtime, created_by: 'admin@test.local' }] }; }
    return { rows: [] };
  });
  const result = await call('/HorasExtrasManual', 'post', request({ ...overtime, attendance_date: '2026-10-15', created_by: 'spoof@test.local' }));
  assert.equal(result.statusCode, 201);
  assert.ok(inserted.includes('admin@test.local'));
  assert.ok(!inserted.includes('spoof@test.local'));
});

test('calcular quinta persiste el resultado y devuelve el contrato de la UI', async t => {
  let inserted = false;
  mockTransaction(t, async sql => {
    if (sql.includes('SELECT id FROM public.employee')) return { rows: [{ id: 'e1' }] };
    if (sql.includes('FROM public.quintacategoriaconfig')) return { rows: [{ id: 'cfg', year: 2026, uit_amount: '1000', annual_deduction_uit: '7', is_active: true, tax_brackets: [{ from_uit: 0, to_uit: 999, rate: 10 }] }] };
    if (sql.includes('SELECT base_salary')) return { rows: [{ base_salary: '2000' }] };
    if (sql.startsWith('INSERT')) { inserted = true; return { rows: [{ id: 'calc1', month: 10, current_month_retention: '566.67' }] }; }
    return { rows: [] };
  });
  const result = await call('/QuintaCategoriaCalculo/calculate', 'post', request({ employee_id: 'e1', year: 2026, month: 10 }));
  assert.equal(result.statusCode, 201);
  assert.ok(inserted);
  assert.equal(result.body.status, 'success');
  assert.equal(result.body.calculation.current_month_retention, 566.67);
});

test('permiso de solo lectura no habilita modificaciones', () => {
  const guard = route('/HorasExtrasManual', 'post')[0].handle;
  let code;
  guard({ access: { permissions: new Set(['attendance.view_all']) } }, { status(status) { code = status; return this; }, json() {} }, () => assert.fail('No debe autorizar'));
  assert.equal(code, 403);
});
