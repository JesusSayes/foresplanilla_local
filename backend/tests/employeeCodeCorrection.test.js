import test from 'node:test';
import assert from 'node:assert/strict';
import pool from '../config/database.js';
import { createEmployee, updateEmployee } from '../controllers/employeeController.js';
import { correctEmployeeCodes } from '../controllers/employeeCodeController.js';
const response = () => ({ statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } });
const request = () => ({ body: [{ id: 'b', old_code: 'FP0001', employee_code: 'FP0002' }], accessibleEmployeeIds: ['b'], user: { email: 'rrhh@test' } });
const rows = [{ id: 'a', employee_code: 'FP0001' }, { id: 'b', employee_code: 'FP0001' }];
function mockDatabase(t, { failure = false } = {}) {
  const calls = [];
  let released = false;
  t.mock.method(pool, 'connect', async () => ({
    query: async (sql, values) => {
      calls.push({ sql, values });
      if (failure && sql.startsWith('INSERT')) throw new Error('Historial no disponible');
      return { rows: sql.startsWith('SELECT') ? rows : [] };
    },
    release: () => { released = true; },
  }));
  return { calls, released: () => released };
}
test('corrige código e historial en la misma transacción con usuario autenticado', async t => {
  const db = mockDatabase(t); const res = response();
  await correctEmployeeCodes(request(), res);
  assert.equal(res.statusCode, 200); assert.equal(res.body.corrected, 1);
  assert.ok(db.calls.some(c => c.sql.startsWith('LOCK TABLE')));
  assert.deepEqual(db.calls.find(c => c.sql.startsWith('UPDATE')).values, ['FP0002', 'b']);
  assert.equal(db.calls.find(c => c.sql.startsWith('INSERT')).values.at(-1), 'rrhh@test');
  assert.equal(db.calls.at(-1).sql, 'COMMIT'); assert.ok(db.released());
});
test('empleado fuera de alcance no accede a la base', async t => {
  t.mock.method(pool, 'connect', () => assert.fail('No debe conectar'));
  const req = request(); req.accessibleEmployeeIds = ['a']; const res = response();
  await correctEmployeeCodes(req, res); assert.equal(res.statusCode, 403);
});
for (const changes of [{ old_code: 'FP0000' }, { employee_code: ' fp0001 ' }, { id: 'inexistente' }]) {
  test(`rechaza corrección obsoleta o código ocupado: ${JSON.stringify(changes)}`, async t => {
    const db = mockDatabase(t); const req = request(); Object.assign(req.body[0], changes); req.accessibleEmployeeIds = null;
    const res = response(); await correctEmployeeCodes(req, res);
    assert.equal(res.statusCode, 409); assert.equal(db.calls.at(-1).sql, 'ROLLBACK');
    assert.ok(!db.calls.some(c => c.sql.startsWith('UPDATE')));
  });
}
test('error al guardar historial revierte la corrección', async t => {
  const db = mockDatabase(t, { failure: true }); const res = response();
  await correctEmployeeCodes(request(), res); assert.equal(res.statusCode, 500);
  assert.equal(db.calls.at(-1).sql, 'ROLLBACK'); assert.ok(db.released());
});


for (const [name, handler] of [['crear', createEmployee], ['editar', updateEmployee]]) {
  for (const body of [{ employee_code: ' fp0001 ' }, { document_type: 'dni', document_number: '1234 5678' }]) {
    test(`${name}: rechaza identidad duplicada normalizada`, async t => {
      const calls = [];
      t.mock.method(pool, 'connect', async () => ({ release() {}, query: async sql => {
        calls.push(sql);
        if (sql.startsWith('SELECT *')) return { rows: [{ id: 'b', employee_code: 'FP0009', document_type: 'DNI', document_number: '87654321' }] };
        if (sql.startsWith('SELECT')) return { rows: [{ id: 'a', employee_code: 'FP0001', document_type: 'DNI', document_number: '12345678' }] };
        return { rows: [] };
      } }));
      const req = request(); req.body = body; req.params = { id: 'b' }; const res = response();
      await handler(req, res); assert.equal(res.statusCode, 409);
      assert.equal(calls.at(-1), 'ROLLBACK');
      assert.ok(!calls.some(sql => /INSERT|UPDATE employee/.test(sql)));
    });
  }
}
