import test from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import pool from '../config/database.js';
import prisma from '../config/prisma.js';
import controller from '../controllers/reportConfigurationController.js';
import router from '../routes/reportConfigurations.js';

const request = (overrides = {}) => ({
  body: {}, params: { id: 'report-1' }, query: {},
  user: { userId: 'user-1', email: 'owner@example.test' },
  access: { permissions: new Set(['reports.view']) },
  ...overrides,
});

const call = async (handler, req) => {
  const res = {
    statusCode: 200,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
    send() { return this; },
  };
  await handler(req, res);
  return res;
};

test('crea reportes de contratos con JSON y propietario del token', async t => {
  let captured;
  t.mock.method(pool, 'query', async (sql, params) => {
    captured = { sql, params };
    return { rows: [{ id: 'new-report', report_type: 'contracts' }] };
  });
  const res = await call(controller.create, request({
    access: { permissions: new Set(['system.admin']) },
    body: {
      report_name: ' Contratos vigentes ', report_type: 'contracts',
      filters: { status: { operator: 'equals', value: 'Vigente' } },
      columns: ['employee_id', 'end_date'], sort_order: 'asc',
    },
  }));
  assert.equal(res.statusCode, 201);
  assert.match(captured.sql, /INSERT INTO public.reportconfiguration/);
  assert.match(captured.sql, /"created_by_id", "created_by"/);
  assert.equal(captured.params[0], 'Contratos vigentes');
  assert.deepEqual(JSON.parse(captured.params[2]), { status: { operator: 'equals', value: 'Vigente' } });
  assert.deepEqual(JSON.parse(captured.params[3]), ['employee_id', 'end_date']);
  assert.deepEqual(captured.params.slice(-2), ['user-1', 'owner@example.test']);
});

test('rechaza creación sin permiso, suplantación y campos inválidos sin consultar SQL', async t => {
  const db = t.mock.method(pool, 'query', async () => { throw new Error('No debe consultar'); });
  assert.equal((await call(controller.create, request({
    body: { report_name: 'Reporte', report_type: 'employees' },
  }))).statusCode, 403);
  const admin = { permissions: new Set(['system.admin']) };
  for (const body of [
    {}, [], null, { report_name: '', report_type: 'employees' },
    { report_name: 'Reporte', report_type: 'unknown' },
    { report_name: 'Reporte', report_type: 'payroll', created_by_id: 'other' },
    { report_name: 'Reporte', report_type: 'payroll', created_by: 'other@example.test' },
  ]) {
    assert.equal((await call(controller.create, request({ body, access: admin }))).statusCode, 400);
  }
  for (const body of [
    {}, { id: 'other' }, { updated_date: '2026-01-01' }, { is_favorite: 'false' },
    { filters: [] }, { columns: [1] }, { sort_order: 'DROP TABLE users' },
    { description: null },
  ]) {
    assert.equal((await call(controller.update, request({ body }))).statusCode, 400);
  }
  assert.equal(db.mock.callCount(), 0);
});

test('listado y filtro aplican propietario aunque is_shared sea true', async t => {
  const calls = [];
  t.mock.method(pool, 'query', async (sql, params) => {
    calls.push({ sql, params });
    return { rows: [] };
  });
  await call(controller.getAll, request());
  await call(controller.filter, request({ body: { is_shared: true, report_type: 'contracts' } }));
  for (const { sql, params } of calls) {
    assert.match(sql, /WHERE \(created_by_id = \$1 OR \(created_by_id IS NULL AND created_by = \$2\)\)/);
    assert.deepEqual(params.slice(0, 2), ['user-1', 'owner@example.test']);
    assert.match(sql, /ORDER BY "created_date" DESC NULLS LAST, id ASC/);
  }
  assert.match(calls[1].sql, /AND "is_shared" = \$3 AND "report_type" = \$4/);
  assert.deepEqual(calls[1].params.slice(2), [true, 'contracts']);
});

test('consultar, editar y eliminar otro propietario devuelve 404 con alcance atómico', async t => {
  const calls = [];
  t.mock.method(pool, 'query', async (sql, params) => {
    calls.push({ sql, params });
    return { rows: [] };
  });
  for (const handler of [controller.getById, controller.update, controller.delete]) {
    const res = await call(handler, request({ body: { is_favorite: true } }));
    assert.equal(res.statusCode, 404);
  }
  assert.equal(calls.length, 3);
  for (const { sql, params } of calls) {
    assert.match(sql, /WHERE id = \$\d+ AND \(created_by_id = \$\d+ OR \(created_by_id IS NULL AND created_by = \$\d+\)\)/);
    assert.deepEqual(params.slice(-2), ['user-1', 'owner@example.test']);
  }
  assert.match(calls[1].sql, /^UPDATE/);
  assert.match(calls[2].sql, /^DELETE/);
});

test('permite favoritos parciales, lectura y eliminación de registros accesibles', async t => {
  t.mock.method(pool, 'query', async () => ({ rows: [{ id: 'report-1', is_favorite: false }] }));
  assert.equal((await call(controller.getById, request())).statusCode, 200);
  const updated = await call(controller.update, request({ body: { is_favorite: false } }));
  assert.equal(updated.statusCode, 200);
  assert.equal(updated.body.is_favorite, false);
  assert.equal((await call(controller.delete, request())).statusCode, 204);
});

test('administrador consulta todos; acepta orden permitido y valores parametrizados', async t => {
  let captured;
  t.mock.method(pool, 'query', async (sql, params) => {
    captured = { sql, params };
    return { rows: [] };
  });
  const value = "'; DROP TABLE users; --";
  await call(controller.filter, request({
    access: { permissions: new Set(['system.admin']) },
    body: { report_name: value }, query: { sort: 'report_name' },
  }));
  assert.match(captured.sql, /WHERE TRUE AND "report_name" = \$1/);
  assert.match(captured.sql, /ORDER BY "report_name" ASC/);
  assert.ok(!captured.sql.includes(value));
  assert.deepEqual(captured.params, [value]);
});

test('rechaza inyección por orden o filtro antes de consultar', async t => {
  const db = t.mock.method(pool, 'query', async () => ({ rows: [] }));
  for (const sort of ['created_date; DROP TABLE users', ['id'], { field: 'id' }]) {
    assert.equal((await call(controller.getAll, request({ query: { sort } }))).statusCode, 400);
  }
  assert.equal((await call(controller.filter, request({ body: { created_by_id: 'other' } }))).statusCode, 400);
  assert.equal((await call(controller.filter, request({ body: { is_favorite: 'true' } }))).statusCode, 400);
  assert.equal(db.mock.callCount(), 0);
});

test('soporta tokens con id y registros históricos sin ID de propietario', async t => {
  let values;
  t.mock.method(pool, 'query', async (sql, params) => {
    assert.match(sql, /created_by_id IS NULL AND created_by =/);
    values = params;
    return { rows: [] };
  });
  await call(controller.getAll, request({ user: { id: 'registration-id', email: 'legacy@example.test' } }));
  assert.deepEqual(values, ['registration-id', 'legacy@example.test']);
});

test('las rutas requieren autenticación, reports.view y administración para crear', async t => {
  const originalEmployee = prisma.employee.findFirst;
  const originalRoles = prisma.user_role.findMany;
  const originalSecret = process.env.JWT_SECRET;
  t.after(() => {
    prisma.employee.findFirst = originalEmployee;
    prisma.user_role.findMany = originalRoles;
    if (originalSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = originalSecret;
  });
  let role = 'empleado';
  prisma.employee.findFirst = async () => ({ id: 'employee-1', role });
  prisma.user_role.findMany = async () => [];
  process.env.JWT_SECRET = 'report-configuration-test-secret';
  const token = jwt.sign({ userId: 'user-1', email: 'owner@example.test' }, process.env.JWT_SECRET);
  const db = t.mock.method(pool, 'query', async () => ({ rows: [] }));

  const dispatch = (method, url, authenticated) => new Promise((resolve, reject) => {
    const req = {
      method, url, body: { report_name: 'Reporte', report_type: 'employees' },
      headers: authenticated ? { authorization: 'Bearer ' + token } : {},
    };
    const res = {
      statusCode: 200,
      status(code) { this.statusCode = code; return this; },
      json(body) { resolve({ status: this.statusCode, body }); },
    };
    router.handle(req, res, error => reject(error || new Error('Ruta no resuelta')));
  });
  for (const [method, url] of [['GET', '/'], ['POST', '/filter'], ['GET', '/r'], ['POST', '/'], ['PUT', '/r'], ['DELETE', '/r']]) {
    assert.equal((await dispatch(method, url, false)).status, 401);
    assert.equal((await dispatch(method, url, true)).status, 403);
  }
  assert.equal(db.mock.callCount(), 0);
  role = 'hr_readonly';
  assert.equal((await dispatch('GET', '/', true)).status, 200);
  assert.equal((await dispatch('POST', '/', true)).status, 403);
  role = 'admin';
  assert.equal((await dispatch('POST', '/', true)).status, 201);
});
