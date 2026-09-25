import { getScheduleForDate } from '../utils/attendanceMetrics.js';
import { toDateString } from '../utils/employmentDate.js';

const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
export const isVacationAttendance = record => record.status === 'Vacaciones' ||
  (record.status === 'Justificado' && /^Vacaciones aprobadas/.test(record.notes || ''));

export function vacationAttendanceData(record, employee, schedules, holidays) {
  const date = toDateString(record.date);
  const schedule = getScheduleForDate(record.employee_id, employee?.department_name, schedules, date);
  const day = days[new Date(`${date}T00:00:00Z`).getUTCDay()];
  const nonWorking = day === 'saturday' || day === 'sunday' || holidays.some(h => toDateString(h.date) === date) ||
    !schedule?.[`${day}_start`]?.trim() || !schedule?.[`${day}_end`]?.trim();
  return {
    status: 'Vacaciones', is_late: false, late_minutes: 0, is_absent: false,
    overtime_hours_25: 0, overtime_hours_35: 0, worked_hours: 0, regular_hours: 0,
    ...(nonWorking ? { scheduled_start: '', scheduled_end: '' } : {}),
  };
}

export async function loadVacationContext(db, employeeId) {
  const [employee, schedules, holidays] = await Promise.all([
    db.employee.findUnique({ where: { id: employeeId } }),
    db.work_schedule.findMany({ where: { is_active: true } }),
    db.holiday.findMany(),
  ]);
  return { employee, schedules, holidays };
}

export async function normalizeVacationAttendance(db, record) {
  if (!isVacationAttendance(record)) return {};
  const { employee, schedules, holidays } = await loadVacationContext(db, record.employee_id);
  return vacationAttendanceData(record, employee, schedules, holidays);
}

// Equivalente local de la automatización de VacationRequest de main.
export async function syncVacationAttendance(db, vacation) {
  if (!['Aprobada', 'Aprobado'].includes(vacation.status) || vacation.request_type !== 'Vacaciones') return;
  const records = await db.attendance_record.findMany({ where: {
    employee_id: vacation.employee_id,
    date: { gte: vacation.start_date, lte: vacation.end_date },
  } });
  if (!records.length) return;
  const { employee, schedules, holidays } = await loadVacationContext(db, vacation.employee_id);
  for (const record of records) {
    await db.attendance_record.update({ where: { id: record.id }, data: {
      ...vacationAttendanceData(record, employee, schedules, holidays), updated_date: new Date(),
    } });
  }
}
