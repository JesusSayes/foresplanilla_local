/**
 * Sincronización de alertas de Horas Extras (HE) no autorizadas.
 *
 * Usa getAdditionalMinutes (de attendanceMetrics) para detectar tiempo
 * adicional post-jornada pendiente de autorización, considerando TODOS
 * los segmentos de marcación, incluidos los que cruzan medianoche.
 *
 * NO usa las HE pagables (overtime_hours_25/35) para detectar excesos:
 * pueden estar en cero precisamente porque falta autorización.
 *
 * Reglas:
 * - No modifica overtime_authorized (no autoriza HE automáticamente).
 * - Preserva decisiones previas de aprobación/descarte (solo actúa sobre
 *   alertas con status "Pendiente").
 * - Evita alertas duplicadas por registro.
 * - Si una corrección elimina el exceso, descarta la alerta pendiente.
 * - No genera escrituras durante el renderizado (solo se invoca desde
 *   manejadores de eventos: guardar edición, aprobar solicitud, recálculo).
 */

import { getAdditionalMinutes } from "@/lib/attendanceMetrics";
import { todayLima } from "@/lib/dateUtils";
import { base44 } from "@/api/base44Client";

const EPSILON = 0.01; // ~36 segundos de tolerancia

/**
 * Sincroniza la alerta de HE pendiente para un registro de asistencia.
 *
 * @param {Object} record - Registro de asistencia actualizado (post-recalc).
 * @param {Array} pendingAlerts - Lista mutable de alertas pendientes. Se
 *   actualiza in-place para evitar duplicados en procesamiento por lotes.
 * @param {Object} currentUser - Usuario actual (para resolved_by).
 * @returns {string|null} "created" | "updated" | "discarded" | null
 */
export const syncOvertimeAlert = async (record, pendingAlerts, currentUser) => {
  if (!record || !record.scheduled_end) return null;

  const additionalMin = getAdditionalMinutes(record);
  const additionalHrs = additionalMin / 60;
  const isAuthorized = record.overtime_authorized === true;

  const existingAlert = pendingAlerts.find(
    (a) => a.attendance_record_id === record.id && a.status === "Pendiente"
  );

  if (additionalHrs > EPSILON && !isAuthorized) {
    if (!existingAlert) {
      const created = await base44.entities.OvertimeAlert.create({
        employee_id: record.employee_id,
        attendance_record_id: record.id,
        alert_date: record.date,
        overtime_hours: additionalHrs,
        status: "Pendiente",
      });
      if (created) {
        pendingAlerts.push({
          id: created.id,
          attendance_record_id: record.id,
          status: "Pendiente",
          overtime_hours: additionalHrs,
        });
      }
      return "created";
    } else if (Math.abs((existingAlert.overtime_hours || 0) - additionalHrs) > EPSILON) {
      await base44.entities.OvertimeAlert.update(existingAlert.id, {
        overtime_hours: additionalHrs,
      });
      existingAlert.overtime_hours = additionalHrs;
      return "updated";
    }
    return null;
  } else if (additionalHrs <= EPSILON && existingAlert) {
    await base44.entities.OvertimeAlert.update(existingAlert.id, {
      status: "Descartado",
      resolved_by: currentUser?.email || "",
      resolution_date: todayLima(),
      resolution_notes: "Exceso eliminado por corrección o recálculo",
    });
    const idx = pendingAlerts.indexOf(existingAlert);
    if (idx >= 0) pendingAlerts.splice(idx, 1);
    return "discarded";
  }
  return null;
};

/**
 * Sincroniza alertas de HE para una lista de registros.
 * Filtra previamente para procesar solo registros con tiempo adicional
 * o con alertas pendientes existentes (evita escrituras innecesarias).
 *
 * @param {Array} records - Registros de asistencia actualizados.
 * @param {Array} pendingAlerts - Lista mutable de alertas pendientes.
 * @param {Object} currentUser - Usuario actual.
 */
export const syncOvertimeAlertsBatch = async (records, pendingAlerts, currentUser) => {
  const alertRecordIds = new Set(pendingAlerts.map((a) => a.attendance_record_id));
  const toSync = records.filter((r) => {
    if (!r || !r.scheduled_end) return false;
    const addMin = getAdditionalMinutes(r);
    return addMin > 0 || alertRecordIds.has(r.id);
  });
  for (const record of toSync) {
    await syncOvertimeAlert(record, pendingAlerts, currentUser);
  }
};