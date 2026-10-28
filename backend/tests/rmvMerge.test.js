import test from 'node:test';
import assert from 'node:assert/strict';
import prisma from '../config/prisma.js';
import { create, update } from '../controllers/masterData/rmvController.js';
import { normalizeRmvDate, formatRmvDate } from '../../src/lib/rmvDate.js';

const response = () => ({ statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } });
function transaction(t) {
  const calls = [];
  t.mock.method(prisma, '$transaction', async (fn, options) => {
    assert.equal(options.isolationLevel, 'Serializable');
    return fn({ rmv: Object.fromEntries(['create', 'update', 'updateMany'].map(method => [method, async args => {
      calls.push({ method, ...args });
      return args.data;
    }])) });
  });
  return calls;
}
test('RMV: fecha calendario e ISO conservan el día y null no muestra 1969', () => {
  for (const date of ['2026-10-01', '2026-10-01T00:00:00.000Z']) {
    assert.equal(normalizeRmvDate(date), '2026-10-01');
    assert.equal(formatRmvDate(date), '01/10/2026');
  }
  assert.equal(formatRmvDate(null), 'Sin fecha');
});
test('RMV: desactivar no borra la fecha omitida', async t => {
  const calls = transaction(t), res = response();
  await update({ params: { id: 'old' }, body: { is_active: false } }, res);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(calls, [{ method: 'update', where: { id: 'old' }, data: { is_active: false } }]);
});
test('RMV: nueva vigente por defecto y anterior desactivada en la misma transacción', async t => {
  const calls = transaction(t), res = response();
  await create({ body: { amount: 1230, effective_date: '2026-10-01' }, user: { id: 'user' } }, res);
  assert.equal(res.statusCode, 201);
  assert.deepEqual(calls.map(c => c.method), ['updateMany', 'create']);
  assert.deepEqual(calls[0].data, { is_active: false });
  assert.equal(calls[1].data.is_active, true);
  assert.equal(calls[1].data.effective_date.toISOString(), '2026-10-01T00:00:00.000Z');
});
test('RMV: activar una existente excluye su id de la desactivación', async t => {
  const calls = transaction(t), res = response();
  await update({ params: { id: 'old' }, body: { is_active: true, effective_date: '2025-01-01' } }, res);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(calls[0].where, { is_active: true, id: { not: 'old' } });
  assert.equal(calls[1].data.effective_date.toISOString(), '2025-01-01T00:00:00.000Z');
});
test('RMV: crear histórico explícito no desactiva la vigente', async t => {
  const calls = transaction(t), res = response();
  await create({ body: { amount: 1130, effective_date: '2025-01-01', is_active: false } }, res);
  assert.equal(res.statusCode, 201);
  assert.deepEqual(calls.map(c => c.method), ['create']);
  assert.equal(calls[0].data.is_active, false);
});
