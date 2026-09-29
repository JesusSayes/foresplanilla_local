import prisma from '../config/prisma.js';
import { getAdditionalMinutes, getPreShiftMinutes, getScheduleForDate } from '../utils/attendanceMetrics.js';
import { generate24HexId } from '../utils/idGenerator.js';

// La aprobación ya verificó el alcance del empleado. Sincronizar aquí permite
// aprobar ediciones sin conceder permisos generales de edición de asistencia.
export const syncOvertimeAlert = async (recordId, email, context = {}) => prisma.$transaction(async tx => {
  let record = await tx.attendance_record.findUnique({ where: { id: recordId } });
  if (!record || ['Vacaciones', 'Permiso sin goce'].includes(record.status)) return;
  const employee = context.employees?.get(record.employee_id) || await tx.employee.findUnique({ where: { id: record.employee_id } });
  const schedules = context.schedules || await tx.work_schedule.findMany({ where: { is_active: true } });
  const dateStr = record.date.toISOString().slice(0, 10);
  const schedule = getScheduleForDate(record.employee_id, employee?.department_name, schedules, dateStr);
  const day = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][record.date.getUTCDay()];
  if (!schedule?.[`${day}_start`] || !schedule?.[`${day}_end`]) return;
  record = { ...record, scheduled_start: schedule[`${day}_start`], scheduled_end: schedule[`${day}_end`] };
  const alerts = await tx.overtime_alert.findMany({ where: { attendance_record_id: recordId } });
  const types = [
    { pre: false, hours: getAdditionalMinutes(record) / 60 },
    { pre: true, hours: getPreShiftMinutes(record) / 60 },
  ];
  const now = new Date();

  for (const { pre, hours } of types) {
    const matching = alerts.filter(alert => (Number(alert.overtime_hours || 0) < 0) === pre);
    const pending = matching.filter(alert => alert.status === 'Pendiente');
    const signedHours = pre ? -hours : hours;
    const reviewed = matching.some(alert => ['Autorizado', 'Aprobado', 'Aprobada', 'Descartado', 'Rechazado', 'Rechazada'].includes(alert.status));
    if (hours <= 0.01 || reviewed || record.overtime_authorized === true || schedule.overtime_authorized === true) {
      for (const alert of pending) {
        await tx.overtime_alert.update({ where: { id: alert.id }, data: {
          status: 'Descartado', updated_date: now,
          resolved_by: email || '', resolution_date: now,
          resolution_notes: reviewed ? 'Pendiente duplicado de una alerta ya revisada' : 'Exceso eliminado o ya autorizado',
        } });
      }
    } else if (pre || !record.overtime_authorized) {
      if (pending.length) {
        for (const alert of pending) {
          await tx.overtime_alert.update({ where: { id: alert.id }, data: {
            overtime_hours: signedHours, updated_date: now,
          } });
        }
      } else if (!matching.some(alert => ['Autorizado', 'Aprobado', 'Descartado'].includes(alert.status))) {
        await tx.overtime_alert.create({ data: {
          id: generate24HexId(), employee_id: record.employee_id,
          attendance_record_id: recordId, alert_date: record.date,
          overtime_hours: signedHours, status: 'Pendiente',
          created_date: now, updated_date: now, created_by: email || 'system',
        } });
      }
    }
  }
}, { isolationLevel: 'Serializable' });
