// Registro de solicitudes de compensación de tardanzas y HE.
//
// Una solicitud de compensación se guarda COMPLETA o no se guarda: los incidentes se
// crean en una sola operación (bulkCreate) y, si el marcado de los registros de
// asistencia falla, se revierte lo aplicado y se eliminan los incidentes creados, de
// modo que ninguna fecha quede registrada a medias.
//
// El código de solicitud (codigo_solicitud) es la clave de idempotencia: un reintento
// del mismo intento limpia lo que haya quedado antes de volver a crear, por lo que
// nunca se duplican solicitudes.
import { base44 } from "@/api/base44Client";

// Payload de los incidentes: una fila por fecha seleccionada (tardanza y/o HE).
export const buildCompensationIncidents = ({
  selectedList,
  employeeId,
  codigoSolicitud,
  reason,
  authorizer,
}) =>
  selectedList.map((item) => ({
    employee_id: employeeId,
    attendance_record_id: item.recordId,
    incident_date: item.date,
    incident_type: "Compensación de Tardanza",
    justification: reason,
    late_minutes_to_adjust: item.lateMinutes || 0,
    hours_to_adjust: (item.overtimeMinutes || 0) / 60,
    full_day_justification: false,
    justified_time_start: item.record?.clock_in || null,
    justified_time_end: item.record?.clock_out || null,
    authorizer_id: authorizer.id,
    authorizer_name: `${authorizer.first_name} ${authorizer.last_name}`,
    codigo_solicitud: codigoSolicitud,
    status: "Pendiente",
  }));

// Marca los registros de asistencia como "Compensación" y devuelve los cambios
// aplicados (estado y notas previos) para poder revertirlos si el guardado falla.
export const markRecordsAsCompensated = async (selectedList, { withNotes = true } = {}) => {
  const applied = [];
  for (const item of selectedList) {
    if (!item.recordId) continue;
    const previous = {
      status: item.record?.status || "Completo",
      notes: item.record?.notes || "",
    };
    const changes = { status: "Compensación" };
    if (withNotes) {
      changes.notes =
        (previous.notes ? previous.notes + " | " : "") +
        `Compensación solicitada: ${item.lateMinutes || 0} min tardanza, ${
          item.overtimeMinutes || 0
        } min HE`;
    }
    await base44.entities.AttendanceRecord.update(item.recordId, changes);
    applied.push({ recordId: item.recordId, previous });
  }
  return applied;
};

// Devuelve los registros a su estado y notas previos.
export const revertCompensatedRecords = async (applied = []) => {
  for (const { recordId, previous } of applied) {
    try {
      await base44.entities.AttendanceRecord.update(recordId, {
        status: previous.status,
        notes: previous.notes,
      });
    } catch {
      // La reversión no debe ocultar el error original del guardado.
    }
  }
};

// Elimina las solicitudes de un código (limpieza de un intento previo o deshacer un
// intento fallido). `ignoreErrors` se usa al deshacer: el error original manda.
export const deleteCompensationsByCode = async (codigoSolicitud, { ignoreErrors = false } = {}) => {
  try {
    await base44.entities.AttendanceIncident.deleteMany({
      codigo_solicitud: codigoSolicitud,
    });
  } catch (error) {
    if (!ignoreErrors) throw error;
  }
};

// Reemplaza solicitudes anteriores: las borra por código en una sola operación (o por
// id, como respaldo de registros antiguos sin código). Cada solicitud usa un código
// propio, por lo que nunca alcanza a otro trabajador.
export const deleteCompensations = async ({ codes = [], ids = [] } = {}) => {
  const withCode = codes.filter(Boolean);
  if (withCode.length > 0) {
    await base44.entities.AttendanceIncident.deleteMany({
      codigo_solicitud: { $in: withCode },
    });
  }
  for (const id of ids.filter(Boolean)) {
    await base44.entities.AttendanceIncident.delete(id);
  }
};

// Reconstruye las solicitudes previas (misma información) cuando una edición falla,
// para no perder la solicitud que se estaba editando.
export const restoreCompensations = async (comps = []) => {
  if (comps.length === 0) return;
  await base44.entities.AttendanceIncident.bulkCreate(
    comps.map((c) => ({
      employee_id: c.employee_id,
      attendance_record_id: c.attendance_record_id || null,
      incident_date: c.incident_date,
      incident_type: c.incident_type,
      justification: c.justification,
      late_minutes_to_adjust: c.late_minutes_to_adjust || 0,
      hours_to_adjust: c.hours_to_adjust || 0,
      full_day_justification: c.full_day_justification ?? false,
      justified_time_start: c.justified_time_start || null,
      justified_time_end: c.justified_time_end || null,
      authorizer_id: c.authorizer_id || null,
      authorizer_name: c.authorizer_name || null,
      codigo_solicitud: c.codigo_solicitud || null,
      status: c.status,
      reviewed_by: c.reviewed_by || null,
      review_date: c.review_date || null,
      review_comments: c.review_comments || null,
    }))
  );
};