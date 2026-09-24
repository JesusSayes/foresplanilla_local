/**
 * Sincronización de alertas de Horas Extras (HE) no autorizadas.
 *
 * Detecta DOS tipos de tiempo adicional fuera del horario programado:
 * - "Salida posterior": la última salida válida es posterior a scheduled_end.
 *   Se almacena con overtime_hours POSITIVO.
 * - "Ingreso anticipado": la primera entrada válida es anterior a scheduled_start.
 *   Se almacena con overtime_hours NEGATIVO.
 *
 * Usa getAdditionalMinutes y getPreShiftMinutes (de attendanceMetrics) para
 * detectar el tiempo fuera del horario, considerando TODOS los segmentos
 * de marcación, incluidos los que cruzan medianoche.
 *
 * Convención de signo para distinguir tipos sin agregar campos:
 *   overtime_hours > 0  →  Salida posterior
 *   overtime_hours < 0  →  Ingreso anticipado
 *
 * Reglas:
 * - No modifica overtime_authorized (no autoriza HE automáticamente).
 * - Preserva decisiones previas de aprobación/descarte (solo actúa sobre
 *   alertas con status "Pendiente").
 * - Evita alertas duplicadas por registro + tipo (signo de overtime_hours).
 * - Si una corrección elimina el exceso, descarta la alerta pendiente.
 * - No genera alertas si el empleado no tiene jornada programada (hasSchedule=false).
 * - No genera alertas durante el renderizado (solo se invoca desde manejadores).
 */

import { getAdditionalMinutes, getPreShiftMinutes } from "@/lib/attendanceMetrics";
import { todayLima } from "@/lib/dateUtils";
import { entitiesAPI } from "@/api/entitiesClient";

const EPSILON = 0.01; // ~36 segundos de tolerancia

/**
 * Sincroniza las alertas de HE pendientes para un registro de asistencia.
 * Genera o actualiza hasta dos alertas: ingreso anticipado (negativa) y
 * salida posterior (positiva).
 *
 * @param {Object} record - Registro de asistencia actualizado.
 * @param {Array} pendingAlerts - Lista mutable de alertas pendientes.
 * @param {Object} currentUser - Usuario actual (para resolved_by).
 * @param {boolean} hasSchedule - Si el empleado tiene jornada programada.
 * @returns {Object} { preShift: string|null, postShift: string|null }
 *   donde cada valor es "created" | "updated" | "discarded" | null.
 */
export const syncOvertimeAlert = async (record, pendingAlerts, currentUser, hasSchedule = true) => {
  if (!record || !record.scheduled_end || !record.scheduled_start || !hasSchedule) {
    return { preShift: null, postShift: null };
  }

  const postShiftMin = getAdditionalMinutes(record);
  const preShiftMin = getPreShiftMinutes(record);
  const postShiftHrs = postShiftMin / 60;
  const preShiftHrs = preShiftMin / 60;
  const isAuthorized = record.overtime_authorized === true;

  const result = { preShift: null, postShift: null };
  const history = await entitiesAPI.OvertimeAlert.filter({ attendance_record_id: record.id });
  for (const alert of history) {
    if (alert.status === "Pendiente" && !pendingAlerts.some(a => a.id === alert.id)) pendingAlerts.push(alert);
  }
  const resolved = (pre) => history.some(a =>
    (Number(a.overtime_hours || 0) < 0) === pre &&
    ["Autorizado", "Aprobado", "Descartado"].includes(a.status)
  );

  // ── Salida posterior (overtime_hours POSITIVO) ──────────────────────
  const existingPost = pendingAlerts.find(
    (a) => a.attendance_record_id === record.id && a.status === "Pendiente" && (a.overtime_hours || 0) > 0
  );

  if (postShiftHrs > EPSILON && !isAuthorized) {
    if (!existingPost && !resolved(false)) {
      const created = await entitiesAPI.OvertimeAlert.create({
        employee_id: record.employee_id,
        attendance_record_id: record.id,
        alert_date: record.date,
        overtime_hours: postShiftHrs,
        status: "Pendiente",
      });
      if (created) {
        pendingAlerts.push({
          id: created.id,
          attendance_record_id: record.id,
          status: "Pendiente",
          overtime_hours: postShiftHrs,
        });
      }
      result.postShift = "created";
    } else if (existingPost && Math.abs((existingPost.overtime_hours || 0) - postShiftHrs) > EPSILON) {
      await entitiesAPI.OvertimeAlert.update(existingPost.id, {
        overtime_hours: postShiftHrs,
      });
      existingPost.overtime_hours = postShiftHrs;
      result.postShift = "updated";
    }
  } else if (postShiftHrs <= EPSILON && existingPost) {
    await entitiesAPI.OvertimeAlert.update(existingPost.id, {
      status: "Descartado",
      resolved_by: currentUser?.email || "",
      resolution_date: todayLima(),
      resolution_notes: "Exceso de salida eliminado por corrección o recálculo",
    });
    const idx = pendingAlerts.indexOf(existingPost);
    if (idx >= 0) pendingAlerts.splice(idx, 1);
    result.postShift = "discarded";
  }

  // ── Ingreso anticipado (overtime_hours NEGATIVO) ────────────────────
  const existingPre = pendingAlerts.find(
    (a) => a.attendance_record_id === record.id && a.status === "Pendiente" && (a.overtime_hours || 0) < 0
  );

  if (preShiftHrs > EPSILON) {
    if (!existingPre && !resolved(true)) {
      const created = await entitiesAPI.OvertimeAlert.create({
        employee_id: record.employee_id,
        attendance_record_id: record.id,
        alert_date: record.date,
        overtime_hours: -preShiftHrs,
        status: "Pendiente",
      });
      if (created) {
        pendingAlerts.push({
          id: created.id,
          attendance_record_id: record.id,
          status: "Pendiente",
          overtime_hours: -preShiftHrs,
        });
      }
      result.preShift = "created";
    } else if (existingPre && Math.abs(Math.abs(existingPre.overtime_hours || 0) - preShiftHrs) > EPSILON) {
      await entitiesAPI.OvertimeAlert.update(existingPre.id, {
        overtime_hours: -preShiftHrs,
      });
      existingPre.overtime_hours = -preShiftHrs;
      result.preShift = "updated";
    }
  } else if (preShiftHrs <= EPSILON && existingPre) {
    await entitiesAPI.OvertimeAlert.update(existingPre.id, {
      status: "Descartado",
      resolved_by: currentUser?.email || "",
      resolution_date: todayLima(),
      resolution_notes: "Ingreso anticipado eliminado por corrección o recálculo",
    });
    const idx = pendingAlerts.indexOf(existingPre);
    if (idx >= 0) pendingAlerts.splice(idx, 1);
    result.preShift = "discarded";
  }

  return result;
};

/**
 * Sincroniza alertas de HE para una lista de registros.
 * Filtra previamente para procesar solo registros con tiempo adicional
 * (pre o post) o con alertas pendientes existentes.
 *
 * @param {Array} records - Registros de asistencia actualizados.
 * @param {Array} pendingAlerts - Lista mutable de alertas pendientes.
 * @param {Object} currentUser - Usuario actual.
 * @param {Function|null} hasScheduleFn - Función (record) => boolean que
 *   indica si el empleado tiene jornada programada para el registro.
 */
export const syncOvertimeAlertsBatch = async (records, pendingAlerts, currentUser, hasScheduleFn = null) => {
  const alertRecordIds = new Set(pendingAlerts.map((a) => a.attendance_record_id));
  const toSync = records.filter((r) => {
    if (!r || !r.scheduled_end || !r.scheduled_start) return false;
    const postMin = getAdditionalMinutes(r);
    const preMin = getPreShiftMinutes(r);
    return postMin > 0 || preMin > 0 || alertRecordIds.has(r.id);
  });
  for (const record of toSync) {
    const hasSchedule = hasScheduleFn ? hasScheduleFn(record) : true;
    await syncOvertimeAlert(record, pendingAlerts, currentUser, hasSchedule);
  }
};