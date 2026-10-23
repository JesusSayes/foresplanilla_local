import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { computeMarkedLateMinutes, resolveDiscountLateMinutes } from '../../src/lib/attendanceReconciliation.js';

const source = readFileSync(new URL('../../src/pages/PayrollManagement.jsx', import.meta.url), 'utf8');
const start = source.indexOf('      const markedLateMinutes =');
const end = source.indexOf('      // La tolerancia ya está aplicada', start);
const effective = new Function('computeMarkedLateMinutes', 'resolveDiscountLateMinutes', 'enableTardinessCompensation',
 'scheduleDayFor', 'normDate', 'compensationIncidents', 'emp',
 source.slice(start, end) + '\nreturn effectiveLateMinutes;')(
 computeMarkedLateMinutes, resolveDiscountLateMinutes, true, () => null, v => String(v || '').slice(0, 10), [], { id: 'e1' });

test('planilla elimina tardanza residual tras corregir entrada y conserva datos sin marcación', () => {
  const record = { is_late: true, late_minutes: 30, scheduled_start: '08:00', scheduled_end: '17:00', clock_in: '08:00', clock_out: '17:00' };
  assert.equal(effective(record), 0);
  assert.equal(effective({ ...record, clock_in: null }), 30);
  assert.equal(effective({ ...record, clock_in: '08:20' }), 20);
});

test('planilla resta compensación activa una sola vez y no resta pendientes', () => {
  const record = { is_late: true, late_minutes: 40, scheduled_start: '08:00', scheduled_end: '17:00', clock_in: '08:40', clock_out: '17:00', tardiness_compensation_minutes: 15 };
  assert.equal(effective({ ...record, tardiness_compensation_status: 'Activa' }), 25);
  assert.equal(effective({ ...record, tardiness_compensation_status: 'Pendiente' }), 40);
});
