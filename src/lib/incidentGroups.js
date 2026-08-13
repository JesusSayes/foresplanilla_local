// Helpers para agrupar incidentes por código de solicitud (aprobar/rechazar por periodo).

// Agrupa una lista de AttendanceIncident por codigo_solicitud.
// Los incidentes sin código forman grupos unitarios (uno por incidente) para no alterar datos históricos.
export function groupIncidentsBySolicitud(incidents) {
  const map = new Map();
  for (const inc of incidents) {
    const key = inc.codigo_solicitud || `__nogroup__${inc.id}`;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(inc);
  }
  return [...map.values()].map((incs) => {
    const sorted = [...incs].sort((a, b) =>
      String(a.incident_date).localeCompare(String(b.incident_date))
    );
    return {
      codigo: sorted[0].codigo_solicitud || null,
      incidents: sorted,
    };
  });
}

// Resumen de estados de un grupo de incidentes.
export function groupStatusSummary(incidents) {
  const pending = incidents.filter((i) => i.status === "Pendiente").length;
  const approved = incidents.filter((i) => i.status === "Aprobada").length;
  const rejected = incidents.filter((i) => i.status === "Rechazada").length;
  return { pending, approved, rejected, total: incidents.length };
}

// Estado representativo de un grupo para filtros.
// "Pendiente" si tiene algún pendiente, "Aprobada" si todas aprobadas,
// "Rechazada" si todas rechazadas, "Mixta" en otros casos.
export function groupStatus(group) {
  const { pending, approved, rejected, total } = groupStatusSummary(group.incidents);
  if (pending > 0) return "Pendiente";
  if (approved === total) return "Aprobada";
  if (rejected === total) return "Rechazada";
  return "Mixta";
}

// Rango de fechas legible de un grupo.
export function groupDateRange(group, formatFn) {
  const dates = group.incidents.map((i) => i.incident_date).sort();
  if (dates.length === 1) return formatFn(dates[0]);
  return `${formatFn(dates[0])} - ${formatFn(dates[dates.length - 1])}`;
}