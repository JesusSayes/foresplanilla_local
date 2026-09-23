import { computeAttendance } from '../calcularAsistenciaDesdeLogs.js';
import { calcularMetricas, getScheduleForDate } from '../../utils/attendanceMetrics.js';
import { getProtectedFields } from '../../utils/manualAttendanceProtection.js';
import { isEmploymentDateValid } from '../../utils/employmentDate.js';
import { generate24HexId } from '../../utils/idGenerator.js';

const NOTE = 'Marcación automática - Exonerado de marcación física';
export const normalizeDocument = value => String(value ?? '').trim().replace(/\.0$/, '').replace(/\D/g, '').padStart(8, '0');
const timestamp = value => value instanceof Date ? value.getTime() : new Date(String(value).replace(' ', 'T') + 'Z').getTime();
const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const minuteKey = value => new Date(value).toISOString().slice(0, 16);

export async function readRecoveryContext(db, snapshot) {
  const record = await db.attendance_record.findUnique({ where: { id: snapshot.id } });
  if (!record) return { record: null };
  const date = new Date(`${snapshot.date}T00:00:00Z`);
  const [employee, schedules, edits, incidents, alerts, logs] = await Promise.all([
    db.employee.findUnique({ where: { id: record.employee_id } }),
    db.work_schedule.findMany({ where: { is_active: true }, orderBy: { id: 'asc' } }),
    db.attendance_edit_request.count({ where: { attendance_record_id: record.id } }),
    db.attendance_incident.count({ where: { OR: [
      { attendance_record_id: record.id }, { employee_id: record.employee_id, incident_date: date },
    ] } }),
    db.overtime_alert.count({ where: { attendance_record_id: record.id } }),
    db.attendance_logs.findMany({ where: {
      employee_id: record.employee_id,
      punch_time: { gte: new Date(`${snapshot.date}T05:00:00Z`), lt: new Date(date.getTime() + 29 * 3600000) },
    }, orderBy: [{ punch_time: 'asc' }, { id: 'asc' }] }),
  ]);
  return { record, employee, schedules, edits, incidents, alerts, logs };
}

export function recoveryEligibility(snapshot, context) {
  const { record: r, employee: e, schedules, edits, incidents, alerts } = context;
  if (!r || !e) return 'Registro o empleado inexistente';
  if (r.date.toISOString().slice(0, 10) !== snapshot.date ||
      timestamp(r.created_date) !== timestamp(snapshot.created_date) ||
      timestamp(r.updated_date) !== timestamp(snapshot.updated_date) ||
      r.clock_in !== snapshot.clock_in || r.clock_out !== snapshot.clock_out ||
      r.notes !== NOTE || r.status !== 'Completo') return 'Registro cambiado desde el CSV; revisar manualmente';
  if (getProtectedFields(r).size || r.last_approved_edit_id || r.manually_modified_at ||
      r.manually_modified_by_id || edits || incidents || alerts ||
      r.tardiness_compensation_status || r.tardiness_compensation_minutes ||
      r.overtime_authorized || Number(r.overtime_hours_25) || Number(r.overtime_hours_35)) {
    return 'Edición, incidencia, alerta, autorización o protección existente';
  }
  if ([2, 3, 4].some(n => r[`clock_in_${n}`] || r[`clock_out_${n}`])) return 'Tiene segmentos adicionales';
  if (!isEmploymentDateValid(e, snapshot.date)) return 'Fuera del período laboral';
  const schedule = getScheduleForDate(e.id, e.department_name, schedules, snapshot.date);
  if (!schedule || schedule.id !== snapshot.horario_vigente_id || schedule.exempt_from_clocking !== false) {
    return 'Horario cambiado, ausente o exonerado';
  }
  return null;
}

// No borra las horas ficticias cuando falta evidencia: informa el caso pendiente.
export function planRecovery(snapshot, context, { biotime = [], external = [] } = {}) {
  const skip = reason => ({ id: snapshot.id, reason });
  const reason = recoveryEligibility(snapshot, context);
  if (reason) return skip(reason);
  const { record, employee, schedules } = context;
  const schedule = getScheduleForDate(employee.id, employee.department_name, schedules, snapshot.date);
  const day = dayNames[new Date(`${snapshot.date}T00:00:00Z`).getUTCDay()];
  const start = schedule[`${day}_start`];
  const end = schedule[`${day}_end`];
  if (!start || !end || end <= start) return skip('Día libre o turno nocturno: revisar rango de marcaciones');
  let result;
  let source;
  let newLogs = [];
  if (employee.attendance_method === 'MARCADOR') {
    const logsByMinute = new Map(context.logs.map(log => [minuteKey(log.punch_time), { ...log }]));
    for (const punch of biotime) {
      if (normalizeDocument(punch.emp_code) !== normalizeDocument(employee.document_number)) continue;
      const time = new Date(punch.punch_time);
      if (Number.isNaN(time.getTime())) return skip('Fecha inválida en Biotime');
      if (time.toLocaleDateString('sv-SE', { timeZone: 'America/Lima' }) !== snapshot.date) continue;
      const key = minuteKey(time);
      if (!logsByMinute.has(key)) {
        const log = { id: generate24HexId(), employee_id: employee.id, punch_time: time,
          source: 'biotime', raw_payload: { biotime_id: String(punch.id) } };
        logsByMinute.set(key, log);
        newLogs.push(log);
      }
    }
    const logs = [...logsByMinute.values()].sort((a, b) => a.punch_time - b.punch_time);
    if (!logs.length) return skip('Sin marcaciones locales ni en Biotime; no se modifica');
    if (logs.some(log => log.attendance_record_id && log.attendance_record_id !== record.id)) {
      return skip('Marcaciones vinculadas a otro registro');
    }
    result = computeAttendance({ logs, record: { ...record, date: snapshot.date, scheduled_start: start, scheduled_end: end } });
    if (result.status === 'Revisar') return skip('Marcaciones fuera de la ventana; requiere revisión');
    newLogs = newLogs.map(log => ({ ...log, attendance_record_id: record.id,
      is_used_for_calculation: result.usedLogIds.includes(log.id),
      is_within_window: typeof log._is_within_window === 'boolean' ? log._is_within_window : null,
    }));
    // computeAttendance añade metadatos temporales que no son columnas de Prisma.
    newLogs = newLogs.map(({ _is_within_window, ...log }) => log);
    source = `logs locales/Biotime (${logs.length} marcaciones)`;
  } else if (employee.attendance_method === 'API FORESPAMA') {
    const candidates = external.filter(row => normalizeDocument(row.numero_documento) === normalizeDocument(employee.document_number)
      && String(row.fecha).slice(0, 10) === snapshot.date);
    if (!candidates.length) return skip('La API no devuelve la asistencia histórica; no se modifica');
    const pairs = new Map();
    for (const row of candidates) {
      const ci = row.hora_entrada?.trim().slice(0, 5) || null;
      const co = row.hora_salida?.trim().slice(0, 5) || null;
      if ([ci, co].some(t => t && !/^([01]\d|2[0-3]):[0-5]\d$/.test(t))) return skip('Horas inválidas en API');
      pairs.set(JSON.stringify([ci, co]), { clock_in: ci, clock_out: co });
    }
    if (pairs.size !== 1) return skip('La API devuelve marcaciones contradictorias; revisar');
    const pair = [...pairs.values()][0];
    if (!pair.clock_in || (pair.clock_out && pair.clock_out <= pair.clock_in)) return skip('Marcaciones API incompletas o ambiguas');
    result = { ...pair, status: pair.clock_out ? 'Completo' : 'Incompleto' };
    source = 'API FORESPAMA';
  } else return skip('Método de asistencia no compatible');

  const metrics = calcularMetricas({ ...record, clock_in: result.clock_in, clock_out: result.clock_out,
    status: result.status }, schedule, snapshot.date, schedule.overtime_authorized === true);
  return { id: record.id, snapshot, context, newLogs, source,
    patch: { ...metrics, clock_in: result.clock_in, clock_out: result.clock_out,
      status: result.status, is_absent: false,
      notes: `Recuperado desde ${source}; sustituye marcación automática incorrecta. ${result.notes || ''}`.trim() },
  };
}

export async function applyRecovery(db, plan) {
  return db.$transaction(async tx => {
    const current = await readRecoveryContext(tx, plan.snapshot);
    if (JSON.stringify(current) !== JSON.stringify(plan.context)) {
      throw new Error('Los datos cambiaron después del diagnóstico; ejecutar nuevamente');
    }
    if (plan.newLogs.length) await tx.attendance_logs.createMany({ data: plan.newLogs });
    return tx.attendance_record.update({ where: { id: plan.id }, data: { ...plan.patch, updated_date: new Date() } });
  }, { isolationLevel: 'Serializable', timeout: 15000 });
}
