import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { transformSync } from 'esbuild';
import { prepareLoanData, serializeLoanData } from '../utils/loanData.js';

function loadSource(path) {
  const source = readFileSync(new URL(`../../src/${path}`, import.meta.url), 'utf8');
  const module = { exports: {} };
  new Function('require', 'module', 'exports', transformSync(source, { format: 'cjs' }).code)(
    name => {
      assert.ok(name.startsWith('@/'));
      return loadSource(`${name.slice(2)}.js`);
    }, module, module.exports,
  );
  return module.exports;
}
const { PayrollCalculator } = loadSource('components/payroll/PayrollCalculator.jsx');
const income = (concept_name, amount, extra = {}) => ({ concept_name, amount, concept_type: 'Ingreso', ...extra });
const concepts = [
  income('Remuneración Básica', 1000), income('Remuneración Vacacional', 200),
  income('Asignación Familiar', 113), income('Horas Extras al 25%', 100),
  income('Movilidad', 500),
  { concept_name: 'Permiso', concept_type: 'Descuento', amount: -50 },
];
const calculate = (additional = [], type = 'Mensual', employee = {}) =>
  new PayrollCalculator({ pension_system: 'ONP', ...employee }, 10, 2026, type)
    .calculatePayroll([...concepts, ...additional], {}, 1130);

test('base de main incluye vacaciones, horas extras y asistencia, excluye movilidad', async () => {
  const result = await calculate();
  assert.equal(result.context.remuneracion_afecta, 1363);
  assert.equal(result.deductions.find(c => c.concept_name === 'ONP').calculated_amount, 177.19);
  assert.deepEqual(result.errors, []);
});
for (const logic of [{ system_logic_type: 'pension_contribution' }, { is_dynamic: true, calculation_formula: 'pension_contribution' }]) {
  test(`pensión centralizada sin duplicados: ${JSON.stringify(logic)}`, async () => {
    const result = await calculate([
      { concept_name: 'Aporte', concept_type: 'Descuento', concept_category: 'AFP/ONP', ...logic },
      { concept_name: 'ONP', concept_type: 'Descuento', amount: 999 },
    ]);
    assert.equal(result.deductions.filter(c => c.concept_category === 'AFP/ONP').length, 1);
    assert.equal(result.deductions.at(-1).calculated_amount, 177.19);
    assert.deepEqual(result.errors, []);
  });
}
test('fórmula manual recibe base derivada y reemplaza el cálculo automático', async () => {
  const result = await calculate([{ concept_name: 'Pensión manual', concept_type: 'Descuento', concept_category: 'AFP/ONP', is_dynamic: true, calculation_formula: 'remuneracion_afecta * 0.13' }]);
  assert.equal(result.deductions.at(-1).calculated_amount, 177.19);
  assert.equal(result.deductions.filter(c => c.concept_category === 'AFP/ONP').length, 1);
  assert.deepEqual(result.errors, []);
});
test('quincenal y empleado sin pensión no generan aportes automáticos', async () => {
  for (const result of [await calculate([], 'Quincenal'), await calculate([], 'Mensual', { pension_system: 'Ninguno' })]) {
    assert.equal(result.deductions.filter(c => c.concept_category === 'AFP/ONP').length, 0);
  }
});
test('préstamos locales generan identificadores, convierten fechas y excluyen cuotas temporales', () => {
  const result = prepareLoanData({ amount: 100.25, start_date: '2026-11-01', installment_amounts: [50, 50.25] }, true);
  assert.ok(result.id);
  assert.ok(result.created_date instanceof Date);
  assert.equal(result.start_date.toISOString(), '2026-11-01T00:00:00.000Z');
  assert.equal(result.amount, 100.25);
  assert.equal('installment_amounts' in result, false);
  assert.equal('id' in prepareLoanData({ amount: 10 }), false);
});
test('respuesta conserva números decimales y fechas sin zona horaria', () => {
  assert.deepEqual(serializeLoanData([{ amount: '33.34', monthly_amount: '33.33', start_date: new Date('2026-11-01') }]),
    [{ amount: 33.34, monthly_amount: 33.33, start_date: '2026-11-01' }]);
});


test('cuota de préstamo decimal reduce el neto y no altera la base previsional', async () => {
  const calculator = new PayrollCalculator({ pension_system: 'Ninguno' }, 10, 2026);
  const result = await calculator.calculatePayroll([
    income('Remuneración Básica', 1000),
    { concept_name: 'Cuota', concept_type: 'Descuento', system_logic_type: 'loan_installment' },
  ], {}, 1130, { loan_installments: [{ amount: '33.34' }] });
  assert.equal(result.totals.totalDeductions, 33.34);
  assert.equal(result.totals.netPay, 966.66);
  assert.equal(result.context.remuneracion_afecta, 1000);
});

for (const manual of [false, true]) {
  test(`asistencia externa reduce base ONP sin duplicar el neto (manual=${manual})`, async () => {
    const items = [income('Remuneración Básica', 1000)];
    if (manual) items.push({ concept_name: 'ONP configurada', concept_type: 'Descuento', concept_category: 'AFP/ONP', is_dynamic: true, calculation_formula: 'remuneracion_afecta * 0.13' });
    items.push({ concept_name: 'ESSALUD configurado', concept_type: 'Aportación', is_dynamic: true, calculation_formula: 'remuneracion_afecta * 0.09' });
    const result = await new PayrollCalculator({ pension_system: 'ONP' }, 10, 2026)
      .calculatePayroll(items, {}, 1130, { attendance_discount_amount: 20 });
    assert.equal(result.context.descuentos_asistencia, 20);
    assert.equal(result.context.remuneracion_afecta, 980);
    assert.equal(result.totals.totalDeductions, 127.40);
    assert.equal(result.totals.totalContributions, 88.20);
    assert.equal(result.totals.netPay - 20, 852.60);
    assert.equal(result.deductions.length, 1);
    assert.deepEqual(result.errors, []);
  });
}

test('AFP usa porcentajes configurados sobre la base con asistencia externa', async () => {
  const result = await new PayrollCalculator({ pension_system: 'AFP', afp_commission_type: 'Flujo' }, 10, 2026)
    .calculatePayroll([income('Remuneración Básica', 1000)], {}, 1130, {
      attendance_discount_amount: 50,
      afp: { name: 'Prueba', obligatory_contribution_percentage: 10, insurance_percentage: 1, commission_percentage: 2 },
    });
  assert.equal(result.context.remuneracion_afecta, 950);
  assert.deepEqual(result.deductions.map(c => c.calculated_amount), [95, 9.5, 19]);
  assert.equal(result.totals.netPay - 50, 826.5);
});

test('descuentos externos y permisos ejecutados se acumulan sin mutar los conceptos', async () => {
  const items = [income('Remuneración Básica', 1000), { concept_name: 'Permiso', concept_type: 'Descuento', amount: 10 }];
  const original = structuredClone(items);
  const result = await new PayrollCalculator({ pension_system: 'ONP' }, 10, 2026)
    .calculatePayroll(items, {}, 1130, { attendance_discount_amount: 20 + 30 + 40 });
  assert.equal(result.context.descuentos_asistencia, 100);
  assert.equal(result.context.remuneracion_afecta, 900);
  assert.equal(result.totals.totalDeductions, 127);
  assert.deepEqual(items, original);
});

test('sin descuentos externos mantiene compatibilidad y quincenal sin descuentos', async () => {
  for (const type of ['Mensual', 'Quincenal']) {
    const run = extra => new PayrollCalculator({ pension_system: 'ONP' }, 10, 2026, type)
      .calculatePayroll([income('Remuneración Básica', 1000)], {}, 1130, extra);
    const legacy = await run({});
    const zero = await run({ attendance_discount_amount: 0 });
    assert.deepEqual(legacy.totals, zero.totals);
    assert.equal(zero.context.remuneracion_afecta, 1000);
    if (type === 'Quincenal') assert.equal(zero.totals.totalDeductions, 0);
  }
});
