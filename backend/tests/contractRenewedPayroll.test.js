import test from 'node:test';
import assert from 'node:assert/strict';
import { pickContractForPeriod } from '../../src/lib/contractSelection.js';

const historical = {
  contract_number: 'CTR-2026-186', status: 'Renovado',
  start_date: '2026-07-01', end_date: '2026-09-30', salary: 1200,
};
const future = {
  contract_number: 'CTR-2026-168', status: 'Vigente',
  start_date: '2026-10-01', end_date: '2027-03-31', salary: 1500,
};
const september = (contracts) => pickContractForPeriod(contracts, '2026-09-01', '2026-09-30');

test('renovado del período conserva sueldo histórico sin advertencia de aprobación', () => {
  const result = september([historical, future]);
  assert.equal(result.contract, historical);
  assert.equal(result.contract.salary, 1200);
  assert.equal(result.contractApproved, true);
  assert.equal(result.missingApprovedContract, false);
  assert.equal(result.hasConflict, false);
});

test('renovado fuera del período y estados no aprobados conservan advertencia', () => {
  for (const contract of [
    { ...historical, end_date: '2026-08-31' },
    { ...future, status: 'Renovado' },
    { ...historical, status: 'Vencido' },
    { ...historical, status: 'Borrador' },
    { ...historical, status: 'Anulado' },
  ]) {
    assert.equal(september([contract]).missingApprovedContract, true);
  }
});

test('se mantienen prioridad vigente y alertas por superposición', () => {
  const active = { ...historical, start_date: '2026-06-01', status: 'Vigente' };
  const result = september([historical, active]);
  assert.equal(result.contract, active);
  assert.equal(result.hasConflict, true);
  assert.deepEqual(result.overlaps, [historical]);
  assert.equal(september([historical, { ...historical }]).hasConflict, true);
});
