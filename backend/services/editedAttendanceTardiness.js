import { calcularMetricas, getScheduleForDate } from '../utils/attendanceMetrics.js';
import { toDateString } from '../utils/employmentDate.js';
import { isVacationAttendance } from './vacationAttendance.js';

// Una edición explícita de marcaciones debe actualizar su tardanza derivada,
// incluso si el registro Justificado protege las métricas frente a sincronizaciones.
export async function editedAttendanceTardiness(db, existing, changes) {
  if (!Object.keys(changes).some(field => /^clock_(in|out)(_[234])?$/.test(field))) return {};
  const record = { ...existing, ...changes };
  if (isVacationAttendance(record)) return { is_late: false, late_minutes: 0 };
  const date = toDateString(record.date);
  const [employee, schedules, incidents] = await Promise.all([
    db.employee.findUnique({ where: { id: record.employee_id } }),
    db.work_schedule.findMany({ where: { is_active: true } }),
    db.attendance_incident.findMany({ where: {
      employee_id: record.employee_id, incident_date: new Date(`${date}T00:00:00.000Z`), status: 'Aprobada',
    } }),
  ]);
  let schedule = getScheduleForDate(record.employee_id, employee?.department_name, schedules, date);
  if (!schedule && record.scheduled_start && record.scheduled_end) {
    const day = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][new Date(`${date}T00:00:00Z`).getUTCDay()];
    schedule = { [`${day}_start`]: record.scheduled_start, [`${day}_end`]: record.scheduled_end };
  }
  if (schedule?.exempt_from_clocking) return { is_late: false, late_minutes: 0 };
  const { is_late, late_minutes } = calcularMetricas(record, schedule, date, false, incidents);
  return { is_late, late_minutes };
}
