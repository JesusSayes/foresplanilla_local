// Payload para el guardado transaccional en el backend local.
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
