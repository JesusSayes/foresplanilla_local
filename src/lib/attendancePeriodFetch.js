import { base44 } from "@/api/base44Client";

const PAGE_SIZE = 500;
const MAX_PAGES = 40;

/** Fecha local → "YYYY-MM-DD" (sin desfase de zona horaria). */
export const toDateStr = (date) => {
  if (!date) return "";
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
};

/**
 * Registros de asistencia de un rango de fechas, COMPLETOS.
 *
 * Lee el rango por fechas y recorre todas las páginas con el cursor: una lectura
 * truncada (p. ej. los N registros más recientes) deja los meses anteriores sin
 * asistencia, y la planilla deja de ver sus faltas y tardanzas.
 *
 * El rango es inclusivo y el resultado se devuelve sin ordenar ni deduplicar:
 * el consumidor filtra por empleado y por período.
 */
export const fetchAttendanceRecordsForPeriod = async (dateFrom, dateTo) => {
  if (!dateFrom || !dateTo) return [];

  const records = [];
  let cursor = null;

  for (let page = 0; page < MAX_PAGES; page++) {
    const result = await base44.entities.AttendanceRecord.filter(
      { date: { $gte: dateFrom, $lte: dateTo } },
      { sort: "date", limit: PAGE_SIZE, ...(cursor ? { cursor } : {}) }
    );

    // Con opciones, la lectura devuelve una página { items, has_more, next_cursor };
    // sin ellas, un arreglo (respaldo defensivo).
    const items = Array.isArray(result) ? result : result?.items || [];
    records.push(...items);

    if (Array.isArray(result) || !result?.has_more || !result?.next_cursor) break;
    cursor = result.next_cursor;
  }

  return records;
};