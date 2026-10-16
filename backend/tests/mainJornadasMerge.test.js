import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { getEarlyDepartureMinutes as local } from '../utils/attendanceMetrics.js';
import { getEarlyDepartureMinutes as screen } from '../../src/lib/attendanceMetrics.js';
import { validateOvertimePaymentPolicy } from '../services/overtimePaymentPolicy.js';

const day = { scheduled_start: '09:00', scheduled_end: '18:00', clock_in: '09:00', clock_out: '17:00' };
for (const [name, record, incidents, schedule, expected] of [
  ['salida simple', day, [], {}, 60],
  ['sin salida', { ...day, clock_out: null }, [], {}, 0],
  ['último segmento incompleto', { ...day, clock_in_2: '17:30' }, [], {}, 0],
  ['nocturno', { scheduled_start: '22:00', scheduled_end: '06:00', clock_in: '22:00', clock_out: '05:00' }, [], {}, 60],
  ['nocturno con ingreso temprano', { scheduled_start: '22:00', scheduled_end: '06:00', clock_in: '21:30', clock_out: '05:00' }, [], {}, 60],
  ['justificaciones superpuestas no se duplican', { ...day, clock_out: '16:00' }, [{ justified_time_start: '16:00', justified_time_end: '17:00' }, { justified_time_start: '16:30', justified_time_end: '17:30' }], {}, 30],
  ['refrigerio', { ...day, clock_out: '12:00' }, [], { break_start: '13:00', break_duration_minutes: 60 }, 300],
  ['vacaciones', { ...day, status: 'Vacaciones' }, [], {}, 0],
  ['permiso sin goce', { ...day, status: 'Permiso sin goce' }, [], {}, 0],
  ['justificación parcial no exime todo el día', { ...day, status: 'Justificado' }, [{ justified_time_start: '09:00', justified_time_end: '10:00' }], {}, 60],
]) test(`salida anticipada: ${name}`, () => {
  assert.equal(local(record, incidents, schedule), expected);
  assert.equal(screen(record, incidents, schedule), expected);
});

test('planilla mixta respeta jornadas de pago y rechaza exceso por compensación', async () => {
  const db = { $queryRawUnsafe: async sql => {
    assert.match(sql, /overtime_destination/);
    if (sql.includes('horasextrasmanual')) return [{ overtime_hours_25: 0, overtime_minutes_25: 30 }];
    assert.match(sql, /overtime_authorized = true/);
    return [{ overtime_hours_25: 1, overtime_hours_35: 0 }];
  } };
  const slip = { employee_id: 'e1', year: 2026, month: 10, payroll_type: 'Mensual', overtime_hours_25: 1.5, overtime_pay: 30 };
  await validateOvertimePaymentPolicy(db, [slip]);
  await assert.rejects(validateOvertimePaymentPolicy(db, [{ ...slip, overtime_hours_25: 2 }]), { status: 409 });
});

test('exportación conserva apellidos compuestos y ceros del documento', () => {
  const source = readFileSync(new URL('../../src/pages/SunatExport.jsx', import.meta.url), 'utf8');
  const start = source.indexOf('function buildDerechohabientesRows(');
  const end = source.indexOf('// ─── Exportadores', start);
  const build = new Function('clean', 'fmtDate', 'tipoDoc', 'tipoDocRPAS', 'vinculoRPAS', `${source.slice(start, end)}; return buildDerechohabientesRows;`)(v => String(v || ''), v => v || '', () => '01', () => '01', () => '03');
  const [row] = build([{ employee_id: 'e1', document_number: '00123456', last_name_paterno: 'Del Río', last_name_materno: 'De la Cruz', last_name: 'Del Río De la Cruz' }], [{ id: 'e1', document_number: '00012345' }]);
  assert.equal(row['Apellido Paterno'], 'Del Río');
  assert.equal(row['Apellido Materno'], 'De la Cruz');
  assert.equal(row['Nro. Doc. Derechohab.'], '00123456');
  assert.equal(row['Nro. Doc. Titular'], '00012345');
});
