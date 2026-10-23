import { entitiesAPI } from "@/api/entitiesClient";

/** Fecha local → "YYYY-MM-DD" (sin desfase de zona horaria). */
export const toDateStr = (date) => {
  if (!date) return "";
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
};

/** El backend local devuelve el rango completo, sin paginación ni truncamiento. */
export const fetchAttendanceRecordsForPeriod = async (dateFrom, dateTo) => {
  if (!dateFrom || !dateTo) return [];
  return entitiesAPI.AttendanceRecord.filter(
    { date: { $gte: dateFrom, $lte: dateTo } }, "date"
  );
};
