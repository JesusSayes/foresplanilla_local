import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { transformSync } from 'esbuild';
import * as payrollUtils from '../../src/lib/payrollUtils.js';

const source = readFileSync(new URL('../../src/lib/quintaCategoriaPayroll.js', import.meta.url), 'utf8');
const module = { exports: {} };
new Function('require', 'module', 'exports', transformSync(source, { format: 'cjs' }).code)(
  name => { assert.equal(name, '@/lib/payrollUtils'); return payrollUtils; }, module, module.exports,
);
const { applyQuintaRetentionToResult: apply, getQuintaRetention: retention } = module.exports;
const calculation = overrides => ({ employee_id: 'e1', month: 10, year: 2026, payroll_type: 'Mensual', status: 'Aprobada', calculation_mode: 'auto', current_month_retention: '70.00', ...overrides });
const result = (taxes = []) => {
  const deductions = [{ concept_name: 'AFP', calculated_amount: 100 }, ...taxes];
  const total = deductions.reduce((sum, d) => sum + Number(d.calculated_amount), 0);
  return {
    deductions, totals: { totalDeductions: total, totalIncome: 1000 },
    summary: { breakdown: { deductions: { total, count: deductions.length, items: deductions.map(d => ({ name: d.concept_name, amount: d.calculated_amount, concept_code: 'CODE', concept_id: 'concept' })) } } },
  };
};

test('incorpora retención al descuento y al detalle sin alterar otros conceptos', () => {
  const value = result();
  const quinta = apply(value, [calculation()], 'e1', 10, 2026, 'Mensual');
  assert.equal(quinta.finalIncomeTax, 70);
  assert.equal(quinta.adjustment, 70);
  assert.equal(value.summary.breakdown.deductions.total, 170);
  assert.equal(value.summary.breakdown.deductions.items[0].name, 'AFP');
  assert.equal(value.summary.breakdown.deductions.items[1].amount, 70);
  assert.equal(1000 - (value.totals.totalDeductions + quinta.adjustment), 830);
});

test('suma conceptos de quinta sin distinguir mayúsculas y reemplaza duplicados', () => {
  const value = result([{ concept_name: 'RENTA DE QUINTA', calculated_amount: 30 }, { concept_name: 'Retención 5ta', calculated_amount: 20 }]);
  const quinta = apply(value, [calculation()], 'e1', 10, 2026, 'Mensual');
  assert.equal(quinta.conceptIncomeTax, 50);
  assert.equal(quinta.adjustment, 20);
  assert.equal(value.summary.breakdown.deductions.total, 170);
  assert.equal(value.summary.breakdown.deductions.count, 2);
  assert.equal(value.summary.breakdown.deductions.items[1].concept_code, 'CODE');
  assert.equal(value.summary.breakdown.deductions.items[1].concept_id, 'concept');
});

test('retención manual cero reemplaza el concepto anterior', () => {
  const value = result([{ concept_name: 'Renta', calculated_amount: 50 }]);
  const quinta = apply(value, [calculation({ calculation_mode: 'manual', manual_amount: 0 })], 'e1', 10, 2026, 'Mensual');
  assert.equal(quinta.finalIncomeTax, 0);
  assert.equal(quinta.adjustment, -50);
  assert.equal(value.summary.breakdown.deductions.total, 100);
  assert.equal(value.summary.breakdown.deductions.items[1].amount, 0);
});

for (const overrides of [{ employee_id: 'e2' }, { month: 9 }, { year: 2025 }, { payroll_type: 'Adicional' }, { status: 'Pendiente' }, { status: 'Revertida' }]) {
  test(`no aplica cálculos ajenos al período, tipo o estado: ${JSON.stringify(overrides)}`, () => {
    const value = result([{ concept_name: 'RENTA DE QUINTA', calculated_amount: 50 }]);
    const before = structuredClone(value);
    const quinta = apply(value, [calculation(overrides)], 'e1', 10, 2026, 'Mensual');
    assert.equal(quinta.finalIncomeTax, 50);
    assert.equal(quinta.adjustment, 0);
    assert.deepEqual(value, before);
  });
}

test('quincenal no incorpora retenciones y conserva el cálculo original', () => {
  const value = result();
  assert.equal(apply(value, [calculation({ payroll_type: 'Quincenal' })], 'e1', 10, 2026, 'Quincenal').finalIncomeTax, 0);
  assert.equal(value.summary.breakdown.deductions.total, 100);
});

test('selecciona el cálculo aprobado más reciente y acepta importes decimales de PostgreSQL', () => {
  assert.deepEqual(retention([
    calculation({ created_date: '2026-10-01', current_month_retention: '40.00' }),
    calculation({ created_date: '2026-10-02', calculation_mode: 'manual', manual_amount: '72.45' }),
  ], 'e1', 10, 2026), { amount: 72.45, hasCalc: true });
});

test('contrato de main distingue cálculo cero de ausencia de retención', () => {
  assert.deepEqual(retention([], 'e1', 10, 2026), { amount: 0, hasCalc: false });
  const zero = calculation({ calculation_mode: 'manual', manual_amount: 0 });
  assert.deepEqual(retention([zero], 'e1', 10, 2026), { amount: 0, hasCalc: true });
  assert.equal(apply(result(), [zero], 'e1', 10, 2026, 'Mensual').hasQuintaCalc, true);
  assert.equal(apply(result(), [], 'e1', 10, 2026, 'Mensual').hasQuintaCalc, false);
});
