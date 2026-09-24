import prisma from '../config/prisma.js';
import { getAdditionalMinutes, getPreShiftMinutes, getScheduleForDate } from '../utils/attendanceMetrics.js';
import { generate24HexId } from '../utils/idGenerator.js';

// La aprobación ya verificó el alcance del empleado. Sincronizar aquí permite
// aprobar ediciones sin conceder permisos generales de edición de asistencia.
export const syncOvertimeAlert = async (recordId, email) => prisma.$transaction(async tx => {
  const record = await tx.attendance_record.findUnique({ where: { id: recordId } });
  if (!record?.scheduled_end || !record?.scheduled_start) return;
  const employee = await tx.employee.findUnique({ where: { id: record.employee_id } });
  const schedules = await tx.work_schedule.findMany({ where: { is_active: true } });
  const dateStr = record.date.toISOString().slice(0, 10);
  const schedule = getScheduleForDate(record.employee_id, employee?.department_name, schedules, dateStr);
  const day = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][record.date.getUTCDay()];
  if (!schedule?.[`${day}_start`] || !schedule?.[`${day}_end`]) return;
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
    if (hours <= 0.01) {
      for (const alert of pending) {
        await tx.overtime_alert.update({ where: { id: alert.id }, data: {
          status: 'Descartado', updated_date: now,
          resolved_by: email || '', resolution_date: now,
          resolution_notes: 'Exceso eliminado por corrección o recálculo',
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
