import test from 'node:test';
import assert from 'node:assert/strict';
import { computeCrossDayCompensation } from '../../src/lib/attendanceMetrics.js';
import { classifyAbsenceDay, ABSENCE_KIND, recomputeLateState, resolveDiscountLateMinutes } from '../../src/lib/attendanceReconciliation.js';
import { pickContractForPeriod } from '../../src/lib/contractSelection.js';

test('ventana incluye 30 días y cruce de año; excluye 31 días', () => {
  for (const [date, expected] of [['2027-01-16', 20], ['2027-01-30', 20], ['2027-01-31', 0]]) {
    const result = computeCrossDayCompensation([{ date: '2026-12-31', lateMinutes: 20 }], [{ date, overtimeMinutes: 20 }]);
    assert.equal(result.totalCompensated, expected);
  }
});
test('septiembre toma 1700 por fechas aunque ambos contratos figuren Vigente', () => {
  const contracts = [{ start_date: '2026-06-01', end_date: '2026-08-31', salary: 1300, status: 'Vigente' }, { start_date: '2026-09-01', end_date: '2026-11-30', salary: 1700, status: 'Vigente' }];
  const result = pickContractForPeriod(contracts, '2026-09-01', '2026-09-30');
  assert.equal(result.contract.salary, 1700); assert.equal(result.hasConflict, false);
  assert.equal(pickContractForPeriod([{ ...contracts[1], status: 'Anulado' }], '2026-09-01', '2026-09-30').contract, null);
});
test('faltas distinguen jornada sin registro, marcación incompleta, descanso y cobertura', () => {
  const base = { scheduleDay: { start: '08:00', end: '17:00' } };
  assert.equal(classifyAbsenceDay(base).kind, ABSENCE_KIND.CONFIRMED);
  assert.equal(classifyAbsenceDay({ ...base, record: { clock_out: '17:00' } }).kind, ABSENCE_KIND.REVIEW);
  assert.equal(classifyAbsenceDay({ ...base, record: { clock_in: '08:00' } }).kind, ABSENCE_KIND.REVIEW);
  assert.equal(classifyAbsenceDay({ scheduleDay: {} }).kind, ABSENCE_KIND.NOT_WORKABLE);
  assert.equal(classifyAbsenceDay({}).kind, ABSENCE_KIND.REVIEW);
  assert.equal(classifyAbsenceDay({ ...base, isVacation: true }).kind, ABSENCE_KIND.COVERED);
  assert.equal(classifyAbsenceDay({ ...base, approvedIncidents: [{ incident_type: 'Compensación de Tardanza' }] }).kind, ABSENCE_KIND.CONFIRMED);
});
test('regularizar conserva la base y no duplica la compensación activa', () => {
  const record = { clock_in: '08:40', clock_out: '17:00', scheduled_start: '08:00', scheduled_end: '17:00', late_minutes: 40, is_late: true };
  const state = recomputeLateState({ record, approvedCompensationMinutes: 10, recordActiveCompensationMinutes: 15 });
  assert.equal(state.regularizedMinutes, 30); assert.equal(state.effectiveMinutes, 15);
  const again = recomputeLateState({ record: { ...record, late_minutes: 30 }, approvedCompensationMinutes: 10, recordActiveCompensationMinutes: 15 });
  assert.equal(again.isInconsistent, false); assert.equal(again.effectiveMinutes, 15);
  assert.equal(resolveDiscountLateMinutes({ storedMinutes: 30, markedMinutes: 40, appliedCompensationMinutes: 10, recordActiveCompensationMinutes: 15 }), 15);
});
