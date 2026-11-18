import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import { addDays, buildMedicalSubsidySnapshot, buildComputableMonths, computeHistoricalAverage, continuousSubsidyEnd } from '../../src/lib/medicalSubsidy.js';
import { computeEmployeeMedicalSubsidy } from '../../src/lib/medicalSubsidyPayroll.js';
import { essaludBase } from '../../src/lib/essaludContribution.js';
import { splitMedicalFields, withMedicalFields, saveMedicalFields } from '../services/medicalIncidentFields.js';
import { validateMedicalPayroll } from '../services/medicalPayrollValidation.js';

const bundle = buildSync({
  stdin: { contents: `export { PayrollCalculator } from './src/components/payroll/PayrollCalculator.jsx';`, resolveDir: new URL('../../', import.meta.url).pathname },
  bundle: true, write: false, format: 'esm', platform: 'node', alias: { '@': new URL('../../src', import.meta.url).pathname },
});
const { PayrollCalculator } = await import('data:text/javascript;base64,' + Buffer.from(bundle.outputFiles[0].text).toString('base64'));
const incidents = (start, count, patch = {}) => Array.from({ length: count }, (_, index) => ({
  id: `${start}-${index}`, employee_id: 'e1', incident_date: addDays(start, index),
  incident_type: 'Descanso Médico', status: 'Aprobada', full_day_justification: true,
  subsidy_daily_base: 100, subsidy_daily_base_reason: 'Base validada de doce meses', ...patch,
}));
const snapshot = (rows, extra = {}) => buildMedicalSubsidySnapshot({ incidents: rows, periodStart: '2026-04-01', periodEnd: '2026-04-30', ...extra });

for (const [count, employer, subsidized, amount] of [[20, 20, 0, 0], [21, 20, 1, 100], [30, 20, 10, 1000]]) {
  test(`umbral anual con ${count} días: ${employer} empleador y ${subsidized} subsidiados`, () => {
    const result = snapshot(incidents('2026-04-01', count));
    assert.deepEqual([result.employer_days, result.subsidized_days, result.subsidy_amount], [employer, subsidized, amount]);
    assert.equal(result.validation.blocked, false);
  });
}
test('acumula descansos discontinuos y no usa la base de un episodio anterior', () => {
  const result = snapshot([...incidents('2026-02-01', 18, { subsidy_daily_base: 50 }), ...incidents('2026-04-01', 7)]);
  assert.deepEqual([result.prior_accumulated_days, result.employer_days, result.subsidized_days, result.subsidy_amount], [18, 2, 5, 500]);
  assert.equal(result.contingency_start, '2026-04-01');
});
test('dos contingencias del mes conservan bases distintas', () => {
  const result = snapshot([...incidents('2026-02-01', 20), ...incidents('2026-04-01', 3), ...incidents('2026-04-15', 2, { subsidy_daily_base: 80 })]);
  assert.equal(result.contingencies.length, 2);
  assert.equal(result.subsidized_days, 5);
  assert.equal(result.subsidy_amount, 460);
});
test('no cuenta pendientes, rechazados, citas por horas ni documentos repetidos', () => {
  const rows = incidents('2026-04-01', 10);
  const result = snapshot([...rows, ...rows, ...incidents('2026-04-11', 2, { status: 'Pendiente' }),
    ...incidents('2026-04-13', 2, { status: 'Rechazada' }),
    ...incidents('2026-04-15', 2, { full_day_justification: false, justified_time_start: '09:00', justified_time_end: '10:00' })]);
  assert.equal(result.employer_days, 10);
});
test('conflicto de fechas bloquea el resultado sin correr el día 21', () => {
  const result = snapshot(incidents('2026-04-01', 22), { conflictDates: ['2026-04-01'] });
  assert.equal(result.subsidized_days, 2);
  assert.equal(result.validation.blocked, true);
});
test('base faltante o sin sustento bloquea; CITT pendiente no crea una falta', () => {
  const missing = snapshot(incidents('2026-04-01', 30, { subsidy_daily_base: null }));
  assert.equal(missing.subsidy_amount, null);
  assert.equal(missing.validation.blocked, true);
  assert.equal(snapshot(incidents('2026-04-01', 30, { subsidy_daily_base_reason: '' })).validation.blocked, true);
  const valid = snapshot(incidents('2026-04-01', 30));
  assert.equal(valid.validation.citt_pending, true);
  assert.equal(valid.validation.blocked, false);
});
test('continuidad entre años queda pendiente y el límite usa meses calendario', () => {
  const result = snapshot(incidents('2025-12-01', 60), { periodStart: '2026-01-01', periodEnd: '2026-01-31' });
  assert.equal(result.validation.blocked, true);
  assert.equal(continuousSubsidyEnd('2026-01-01'), '2026-12-11');
});
test('historial incompleto no se interpreta como afiliación corta y no redondea prematuramente', () => {
  const slip = { employee_id: 'e1', year: 2026, month: 3, payroll_type: 'Mensual', status: 'Pagada',
    calculation_summary: { breakdown: { incomes: { items: [{ concept_code: '0121', name: 'Remuneración Básica', amount: 1000 }] } } } };
  assert.equal(computeHistoricalAverage(buildComputableMonths([slip], '2026-04-01')).pending, true);
  const average = computeHistoricalAverage(buildComputableMonths([slip], '2026-04-01', 12, '2026-03-01'));
  assert.equal(average.pending, false);
  assert.ok(Math.abs(average.average_daily * 30 - 1000) < 1e-9);
  assert.equal(computeHistoricalAverage(buildComputableMonths([{ ...slip, calculation_summary: null, total_income: 1000 }], '2026-04-01', 12, '2026-03-01')).pending, true);
});
test('meses completos de 28, 29 y 31 días no dejan sueldo residual ni mínimo EsSalud', () => {
  for (const [year, month, days] of [[2026, 2, 28], [2028, 2, 29], [2026, 3, 31]]) {
    const first = `${year}-${String(month).padStart(2, '0')}-01`;
    const result = computeEmployeeMedicalSubsidy({ employeeId: 'e1', payrollType: 'Mensual', contractualWorkedDays: 30, workedDays: 30,
      periodStart: first, periodEnd: addDays(first, days - 1), medicalRestIncidents: [...incidents(`${year}-01-01`, 20), ...incidents(first, days)] });
    assert.equal(result.remunerationDays, 0);
    assert.equal(result.attendedDays, 0);
    assert.equal(result.snapshot.subsidy_amount, days * 100);
    assert.equal(essaludBase(0, 1200, { subsidizedDays: days, monthDays: days }), 0);
  }
});
test('sin descanso y adelanto quincenal conservan los días y conceptos', () => {
  for (const payrollType of ['Mensual', 'Quincenal']) {
    const result = computeEmployeeMedicalSubsidy({ employeeId: 'e1', payrollType, contractualWorkedDays: 30, workedDays: 28,
      periodStart: '2026-04-01', periodEnd: '2026-04-30', medicalRestIncidents: payrollType === 'Quincenal' ? incidents('2026-04-01', 30) : [] });
    assert.deepEqual([result.snapshot, result.remunerationDays, result.attendedDays], [null, 30, 28]);
  }
});
test('cálculo de boleta: ONP excluye 0916 y AFP lo incluye una vez', async () => {
  const medical = snapshot(incidents('2026-04-01', 30));
  const concepts = [
    { concept_name: 'Remuneración Básica', concept_type: 'Ingreso', concept_category: 'Remuneración Base', amount: 2000 },
    { concept_name: 'Subsidio por incapacidad temporal', concept_code: '0916', concept_type: 'Ingreso', concept_category: 'Otros', amount: 1000 },
    { concept_name: 'ESSALUD', concept_type: 'Aportación', is_dynamic: true, calculation_formula: 'base_salary * 0.09' },
  ];
  for (const [pension_system, pension, net] of [['ONP', 260, 2740], ['AFP', 360, 2640]]) {
    const result = await new PayrollCalculator({ pension_system, afp_id: 'afp', afp_commission_type: 'Flujo' }, 4, 2026)
      .calculatePayroll(concepts, {}, 1130, { medical_subsidy: medical,
        afp: { name: 'Prueba', obligatory_contribution_percentage: 10, insurance_percentage: 1, commission_percentage: 1 } });
    assert.equal(result.totals.totalDeductions, pension);
    assert.equal(result.totals.netPay, net);
    assert.equal(result.totals.totalContributions, 180);
    assert.equal(result.summary.medical_subsidy.subsidy_amount, 1000);
  }
});

const admin = { permissions: new Set(['system.admin']) };
test('API valida permisos, números y sustento; separa los campos que Prisma no conoce', () => {
  const body = { incident_type: 'Descanso Médico', citt_number: 'CITT-1', citt_status: 'Validado', subsidy_daily_base: 100, subsidy_daily_base_reason: 'Certificación' };
  const { data, medical } = splitMedicalFields(body, admin);
  assert.deepEqual(data, { incident_type: 'Descanso Médico' });
  assert.equal(medical.subsidy_daily_base, 100);
  assert.throws(() => splitMedicalFields(body, {}), { status: 403 });
  for (const patch of [{ subsidy_daily_base: -1 }, { subsidy_daily_base: '100' }, { subsidy_daily_base: Infinity }, { subsidy_daily_base_reason: '' }, { citt_number: '' }]) {
    assert.throws(() => splitMedicalFields({ ...body, ...patch }, admin), { status: 400 });
  }
  assert.doesNotThrow(() => splitMedicalFields({ ...body, citt_status: 'Pendiente', subsidy_daily_base: null, subsidy_daily_base_reason: '' }, {}));
});
test('lectura local convierte NUMERIC y escritura parametriza sin enviar campos nuevos a Prisma', async () => {
  const db = { $queryRawUnsafe: async (sql, ids) => {
    assert.deepEqual(ids, ['i1']); assert.match(sql, /ANY\(\$1::text\[\]\)/);
    return [{ id: 'i1', subsidy_daily_base: '100.125000' }];
  }, $executeRawUnsafe: async (sql, id, value) => {
    assert.equal(id, 'i1'); assert.equal(value, "CITT'; DROP TABLE x; --");
    assert.ok(!sql.includes('DROP TABLE'));
  } };
  const [row] = await withMedicalFields(db, [{ id: 'i1', incident_type: 'Descanso Médico' }]);
  assert.equal(row.subsidy_daily_base, 100.125);
  await saveMedicalFields(db, row, { citt_number: "CITT'; DROP TABLE x; --" });
  await assert.rejects(saveMedicalFields({ $executeRawUnsafe: async () => { throw { code: '42703' }; } }, row, { citt_number: '1' }), { status: 503 });
});
test('API impide guardar pendientes, duplicar subsidios o reemplazar boletas médicas cerradas', async () => {
  const med = snapshot(incidents('2026-04-01', 30));
  const slip = { id: 'new', employee_id: 'e1', year: 2026, month: 4, payroll_type: 'Mensual', subsidized_days: 10,
    calculation_summary: { medical_subsidy: med, breakdown: { incomes: { items: [{ concept_code: '0916', amount: 1000 }] } } } };
  const db = { payslip: { findMany: async () => [] } };
  await validateMedicalPayroll(db, [slip]);
  await assert.rejects(validateMedicalPayroll(db, [slip, slip]), { status: 409 });
  await assert.rejects(validateMedicalPayroll(db, [{ ...slip, subsidized_days: 11 }]), { status: 409 });
  const pending = structuredClone(slip); pending.calculation_summary.medical_subsidy.validation.blocked = true;
  await assert.rejects(validateMedicalPayroll(db, [pending]), { status: 409 });
  db.payslip.findMany = async () => [{ ...slip, id: 'old', status: 'Pagada' }];
  await assert.rejects(validateMedicalPayroll(db, [slip], { replace: true }), { status: 409 });
  db.payslip.findMany = async () => [{ ...slip, id: 'old', status: 'Calculada' }];
  await validateMedicalPayroll(db, [slip], { replace: true });
});
