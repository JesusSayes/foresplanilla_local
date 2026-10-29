import test from 'node:test';
import assert from 'node:assert/strict';
import pool from '../config/database.js';
import router from '../routes/contracts.js';
import rulesRouter from '../routes/contracts/renewal-rules.js';
import { renewalDates, renewWithRmv } from '../services/rmvContractRenewal.js';
import { ruleData, create, update, list } from '../controllers/contracts/renewalRuleController.js';
import { findContractsBelowRmv } from '../../src/lib/rmvContractRule.js';

const contract = { id: 'old', employee_id: 'emp', contract_type: 'Plazo Fijo', status: 'Vigente', start_date: '2026-01-01', end_date: '2026-10-31', salary: 1000, activity_cost: 30, food_cost: 20, transport_cost: 10, weekly_hours: 48 };
const employee = { id: 'emp', status: 'Activo', base_salary: '1000.00', employee_code: 'E001' };
const rmv = { id: 'rmv', amount: 1230, effective_date: '2026-10-01', is_active: true };
const input = { contractId: 'old', body: { rmv_id: 'rmv', rmv_amount: 1230, base_salary: 1000 }, user: { id: 'admin', email: 'admin@example.test' }, canAccess: () => true };
const response = () => ({ statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } });
function database(overrides = {}) {
  const calls = [];
  const client = { release() {}, async query(sql, values = []) {
    calls.push({ sql, values });
    if (sql.startsWith('SELECT * FROM contract WHERE')) return { rows: [{ ...contract, ...overrides.contract }] };
    if (sql.startsWith('SELECT * FROM employee')) return { rows: [{ ...employee, ...overrides.employee }] };
    if (sql.startsWith('SELECT to_char')) return { rows: [{ today: '2026-10-28' }] };
    if (sql.startsWith('SELECT * FROM rmv')) return { rows: [{ ...rmv, ...overrides.rmv }] };
    if (sql.startsWith('SELECT * FROM contract_renewal_rule')) return { rows: [{ id: 'rule', is_active: true, rule_type: 'below_rmv', renewal_months: 6, contract_types: [], ...overrides.rule }] };
    if (sql.startsWith('SELECT id FROM contract')) return { rows: overrides.overlap ? [{ id: 'other' }] : [] };
    if (sql.startsWith('INSERT INTO contract')) {
      if (overrides.failInsert) throw new Error('insert failed');
      const fields = sql.match(/\((.*?)\)/)[1].split(', ');
      return { rows: [Object.fromEntries(fields.map((key, i) => [key, values[i]]))] };
    }
    return { rows: [] };
  } };
  return { client, calls };
}
test('fechas: vencidos desde hoy, futuros tras vencimiento e indeterminados sin fin', () => {
  assert.equal(renewalDates(contract, '2026-10-28', 12, '2026-10-01').start_date, '2026-11-01');
  assert.equal(renewalDates({ ...contract, end_date: '2026-09-30' }, '2026-10-28', 12, '2026-10-01').start_date, '2026-10-28');
  assert.deepEqual(renewalDates({ ...contract, contract_type: 'Indeterminado', end_date: null }, '2026-10-28', 12, '2026-10-01'), { start_date: '2026-10-28', end_date: null, previous_end_date: '2026-10-27' });
  assert.equal(renewalDates({ ...contract, end_date: '2027-01-30' }, '2026-10-28', 1, '2026-10-01').end_date, '2027-02-28');
});
test('renovación conserva costos, registra aprobación autenticada y no falsifica firma', async () => {
  const db = database();
  const result = await renewWithRmv(db.client, input);
  assert.equal(result.newContract.salary, 1230);
  assert.equal(result.newContract.start_date, '2026-11-01');
  assert.equal(result.newContract.activity_cost, 30);
  assert.equal(result.newContract.food_cost, 20);
  assert.equal(result.newContract.transport_cost, 10);
  assert.equal(result.newContract.trial_period_days, 0);
  assert.equal(result.newContract.signed_date, null);
  assert.match(result.newContract.notes, /admin@example.test/);
  assert.ok(db.calls.some(c => c.sql.includes("status = 'Renovado'")));
});
test('regla local define meses; el cliente no puede imponer su duración', async () => {
  const db = database();
  const result = await renewWithRmv(db.client, { ...input, body: { ...input.body, rule_id: 'rule', months: 99 } });
  assert.equal(result.newContract.end_date, '2027-05-01');
});
for (const [name, overrides, options] of [
  ['sin permiso de empleado', {}, { canAccess: () => false }],
  ['renovación repetida', { contract: { status: 'Renovado' } }],
  ['cesado', { employee: { status: 'Cesado' } }],
  ['RMV futura', { rmv: { effective_date: '2027-01-01' } }],
  ['RMV cambió', { rmv: { amount: 1300 } }],
  ['sueldo cambió', { employee: { base_salary: 1100 } }],
  ['contrato ya supera RMV', { contract: { salary: 1500 } }],
  ['superposición', { overlap: true }],
  ['contrato futuro', { contract: { start_date: '2027-01-01' } }],
]) {
  test(`rechaza ${name} antes de escribir`, async () => {
    const db = database(overrides);
    await assert.rejects(renewWithRmv(db.client, { ...input, ...options }));
    assert.ok(!db.calls.some(c => /^(INSERT|UPDATE)/.test(c.sql)));
  });
}
test('ruta protegida: commit con sincronización local y rollback ante fallo', async t => {
  const route = router.stack.find(layer => layer.route?.path === '/:id/renew-rmv').route;
  assert.equal(route.stack.length, 3); // permiso, alcance del empleado, handler
  const handler = route.stack.at(-1).handle;
  for (const failInsert of [false, true]) {
    const db = database({ failInsert });
    const mock = t.mock.method(pool, 'connect', async () => db.client);
    const res = response();
    await handler({ params: { id: 'old' }, body: input.body, user: input.user, accessibleEmployeeIds: null }, res);
    assert.equal(res.statusCode, failInsert ? 500 : 201);
    assert.equal(db.calls.at(-1).sql, failInsert ? 'ROLLBACK' : 'COMMIT');
    assert.equal(db.calls.some(c => c.sql.startsWith('UPDATE employee')), !failInsert);
    mock.mock.restore();
  }
});
test('reglas guardan campos nuevos y JSON mediante SQL parametrizado, sin modificar Prisma', async t => {
  const calls = [];
  t.mock.method(pool, 'query', async (sql, values) => { calls.push({ sql, values }); return { rows: [{ id: 'rule', rule_type: 'below_rmv', renewal_months: 6 }] }; });
  const req = { body: { name: 'RMV', rule_type: 'below_rmv', renewal_months: 6, contract_types: ['Plazo Fijo'], id: 'forged' }, user: { id: 'admin' }, params: { id: 'rule' } };
  assert.equal((await (async () => { const res = response(); await create(req, res); return res; })()).statusCode, 201);
  assert.ok(calls[0].values.includes('["Plazo Fijo"]'));
  assert.ok(!calls[0].values.includes('forged'));
  await update(req, response());
  await list(req, response());
  assert.ok(calls[1].sql.includes('"rule_type" ='));
  assert.ok(rulesRouter.stack.length >= 5);
  assert.deepEqual(ruleData({ contract_types: null, is_active: null }), { contract_types: null, is_active: null });
  assert.throws(() => ruleData({ renewal_months: 121 }));
  assert.throws(() => ruleData({ renewal_months: -1 }));
  assert.throws(() => ruleData({ rule_type: 'unknown' }));
});
test('vista previa excluye cesados, otras modalidades y contratos sobre RMV', () => {
  const args = { contracts: [contract], employees: [employee], activeRmv: rmv };
  assert.equal(findContractsBelowRmv(args).length, 1);
  assert.equal(findContractsBelowRmv({ ...args, rule: { is_active: false } }).length, 0);
  assert.equal(findContractsBelowRmv({ ...args, employees: [{ ...employee, status: 'Cesado' }] }).length, 0);
  assert.equal(findContractsBelowRmv({ ...args, contracts: [{ ...contract, salary: 1500 }] }).length, 0);
});
