import test from 'node:test';
import assert from 'node:assert/strict';
import { createScheduleDayResolver } from '../../src/lib/workScheduleResolver.js';
import { buildPayrollAbsenceDays } from '../../src/lib/scheduledAbsence.js';
import { pickContractForPeriod } from '../../src/lib/contractSelection.js';
import { applyContractSalaryToBaseConcepts } from '../../src/lib/baseSalaryConcept.js';

const employee = { id: 'e', department_name: 'Campo', hire_date: '2020-01-01' };
const period = { employees: [employee], periodStart: '2025-01-06', periodEnd: '2025-01-06', records: [{ employee_id: 'e', date: '2025-01-06' }] };

test('descanso individual y exoneración no heredan jornada del departamento', () => {
  const resolve = createScheduleDayResolver({ getEmployee: () => employee, workSchedules: [
    { employee_id: 'e', effective_from: '2025-01-06T00:00:00.000Z' },
    { department_name: 'Campo', monday_start: '08:00', monday_end: '17:00' },
  ] });
  assert.equal(resolve('e', '2025-01-06').start, null);
  assert.equal(buildPayrollAbsenceDays({ ...period, getScheduleDay: resolve }).size, 0);
  assert.equal(buildPayrollAbsenceDays({ ...period, getScheduleDay: () => ({ start: '08:00', end: '17:00', exempt_from_clocking: true }) }).size, 0);
});

test('sin horario y marcación incompleta quedan por revisar; falta programada sí descuenta', () => {
  assert.equal(buildPayrollAbsenceDays({ ...period, getScheduleDay: () => null }).get('e').absenceDays.length, 0);
  const getScheduleDay = () => ({ start: '08:00', end: '17:00' });
  assert.equal(buildPayrollAbsenceDays({ ...period, getScheduleDay }).get('e').absenceDays.length, 1);
  assert.equal(buildPayrollAbsenceDays({ ...period, getScheduleDay, records: [{ ...period.records[0], clock_in: '08:00' }] }).get('e').reviewDays.length, 1);
  assert.equal(buildPayrollAbsenceDays({ ...period, getScheduleDay, isHoliday: () => true }).size, 0);
  assert.equal(buildPayrollAbsenceDays({ ...period, getScheduleDay, approvedIncidentsByKey: new Map([['e|2025-01-06', [{ incident_type: 'Licencia por Maternidad' }]]]) }).size, 0);
});

test('contrato histórico no queda oculto por renovación vigente futura', () => {
  const historical = { start_date: '2025-01-01', end_date: '2025-06-30', status: 'Vencido', salary: 1500 };
  const future = { start_date: '2025-07-01', status: 'Vigente', salary: 2000 };
  const result = pickContractForPeriod([historical, future], '2025-01-01', '2025-01-31');
  assert.equal(result.contract, historical);
  assert.equal(result.missingApprovedContract, true);
});

test('sueldo contractual actualiza solo concepto base fijo', () => {
  const dynamic = { concept_code: '00101', is_dynamic: true, formula: 'base_salary' };
  const bonus = { concept_code: 'BONO', amount: 100 };
  assert.deepEqual(applyContractSalaryToBaseConcepts([{ concept_code: '00101', amount: 1200 }, dynamic, bonus], 1500), [{ concept_code: '00101', amount: 1500 }, dynamic, bonus]);
});
