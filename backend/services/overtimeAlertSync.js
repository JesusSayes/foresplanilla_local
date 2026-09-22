import prisma from '../config/prisma.js';
import { getAdditionalMinutes } from '../utils/attendanceMetrics.js';
import { generate24HexId } from '../utils/idGenerator.js';

// La aprobación ya verificó el alcance del empleado. Sincronizar aquí permite
// aprobar ediciones sin conceder permisos generales de edición de asistencia.
export const syncOvertimeAlert = async (recordId, email) => prisma.$transaction(async tx => {
  const record = await tx.attendance_record.findUnique({ where: { id: recordId } });
  if (!record?.scheduled_end) return;
  const alerts = await tx.overtime_alert.findMany({ where: { attendance_record_id: recordId } });
  const pending = alerts.filter(alert => alert.status === 'Pendiente');
  const hours = getAdditionalMinutes(record) / 60;
  const now = new Date();

  if (hours <= 0.01) {
    for (const alert of pending) {
      await tx.overtime_alert.update({ where: { id: alert.id }, data: {
        status: 'Descartado', updated_date: now,
        resolved_by: email || '', resolution_date: now,
        resolution_notes: 'Exceso eliminado por corrección o recálculo',
      } });
    }
  } else if (!record.overtime_authorized) {
    if (pending.length) {
      for (const alert of pending) {
        await tx.overtime_alert.update({ where: { id: alert.id }, data: {
          overtime_hours: hours, updated_date: now,
        } });
      }
    } else if (!alerts.some(alert => ['Autorizado', 'Aprobado', 'Descartado'].includes(alert.status))) {
      await tx.overtime_alert.create({ data: {
        id: generate24HexId(), employee_id: record.employee_id,
        attendance_record_id: recordId, alert_date: record.date,
        overtime_hours: hours, status: 'Pendiente',
        created_date: now, updated_date: now, created_by: email || 'system',
      } });
    }
  }
}, { isolationLevel: 'Serializable' });
