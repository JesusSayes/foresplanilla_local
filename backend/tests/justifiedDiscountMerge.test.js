import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';

const bundle = buildSync({
  stdin: { contents: `
    export { runJustifiedDiscountTests } from './src/lib/justifiedDiscountTests.js';
    export { runEmployeeCodeTests } from './src/lib/employeeCodeTests.js';
    export { buildJustifiedHoursDiscount, buildAffectationMap } from './src/lib/justifiedDiscounts.js';
    export { PayrollCalculator } from './src/components/payroll/PayrollCalculator.jsx';
  `, resolveDir: new URL('../../', import.meta.url).pathname },
  bundle: true, write: false, format: 'esm', platform: 'node',
  alias: { '@': new URL('../../src', import.meta.url).pathname },
});
const m = await import('data:text/javascript;base64,' + Buffer.from(bundle.outputFiles[0].text).toString('base64'));

test('pruebas de main: códigos y horas justificadas', () => {
  for (const run of [m.runEmployeeCodeTests, m.runJustifiedDiscountTests]) {
    const result = run(); assert.equal(result.failed, 0, JSON.stringify(result.results.filter(r => !r.passed)));
  }
});
test('incidente repetido conserva 336 minutos, una alerta y una deducción pensionable', async () => {
  const incident = { id: 'i1', employee_id: 'e1', incident_date: '2026-09-18', incident_type: 'Otro', status: 'Aprobada', hours_to_adjust: '5.60' };
  const discount = m.buildJustifiedHoursDiscount({
    employeeId: 'e1', baseSalary: 1500, incidents: [incident, incident],
    affectationMap: m.buildAffectationMap([{ name: 'Otro', affectation: 'Descuento' }]),
    periodStart: '2026-08-25', periodEnd: '2026-09-26',
    records: [{ employee_id: 'e1', date: '2026-09-18', clock_in: '06:56' }],
  });
  assert.equal(discount.minutes, 336); assert.equal(discount.amount, 35);
  assert.equal(discount.missingClockOut.length, 1);
  const result = await new m.PayrollCalculator({ pension_system: 'ONP', base_salary: 1500 }, 9, 2026, 'Mensual')
    .calculatePayroll([{ concept_type: 'Ingreso', concept_name: 'Remuneración Básica', amount: 1500 }, discount.concept], { worked_days: 30 }, 1130);
  assert.equal(result.context.remuneracion_afecta, 1465);
  assert.equal(result.totals.netPay, 1274.55);
  assert.equal(result.summary.breakdown.deductions.items.filter(i => i.name === discount.concept.concept_name).length, 1);
});
