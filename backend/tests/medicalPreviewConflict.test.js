import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { collectMedicalRestDates } from '../../src/lib/medicalSubsidy.js';
import { computeEmployeeMedicalSubsidy } from '../../src/lib/medicalSubsidyPayroll.js';

const source = readFileSync(new URL('../../src/pages/PayrollManagement.jsx', import.meta.url), 'utf8');
const start = source.indexOf('      const medicalDates =');
const end = source.indexOf('      const medical =', start);
const getConflicts = new Function('employeeMedicalIncidents', 'empAttendance', 'unpaidLeaveDates',
  'absenceDaysToDiscount', 'isCoveredByApprovedVacation', 'emp', 'normDate', 'collectMedicalRestDates',
  source.slice(start, end) + '\nreturn medicalConflictDates;');
const incident = { id: 'medical', employee_id: 'e1', incident_date: '2026-10-12',
  incident_type: 'Descanso Médico', status: 'Aprobada', full_day_justification: true };
const record = { date: '2026-10-12', clock_in: '07:00', clock_out: '17:36' };
const conflicts = (rows, { unpaid = [], absent = [], vacation = false } = {}) => getConflicts(
  rows, [record], unpaid, absent, () => vacation, { id: 'e1' },
  value => String(value || '').slice(0, 10), collectMedicalRestDates,
);

test('descanso aprobado de día completo con marcaciones permite calcular el día médico', () => {
  const dates = conflicts([incident]);
  assert.deepEqual(dates, []);
  const result = computeEmployeeMedicalSubsidy({ employeeId: 'e1', medicalRestIncidents: [incident],
    conflictDates: dates, periodStart: '2026-10-01', periodEnd: '2026-10-31',
    payrollType: 'Mensual', contractualWorkedDays: 30, workedDays: 30 });
  assert.equal(result.snapshot.validation.blocked, false);
  assert.equal(result.employerDays, 1);
  assert.equal(result.attendedDays, 29);
});

test('no exime marcaciones por descansos pendientes, por horas o de otra fecha', () => {
  for (const patch of [
    { status: 'Pendiente' },
    { full_day_justification: false, justified_time_start: '10:00', justified_time_end: '11:00' },
    { incident_date: '2026-10-13' },
  ]) assert.deepEqual(conflicts([{ ...incident, ...patch }]), ['2026-10-12']);
});

test('conserva conflictos de vacaciones, faltas y licencias sin goce', () => {
  for (const options of [{ vacation: true }, { unpaid: ['2026-10-12'] }, { absent: [{ date: '2026-10-12' }] }]) {
    assert.deepEqual(conflicts([incident], options), ['2026-10-12']);
  }
});
