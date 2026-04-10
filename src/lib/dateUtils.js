/**
 * Utilidades de fecha para zona horaria de Lima, Perú (America/Lima, UTC-5)
 * Todas las fechas del sistema se manejan en esta zona horaria.
 */

const LIMA_TZ = "America/Lima";

/**
 * Retorna la fecha actual en Lima como string "yyyy-MM-dd"
 */
export function todayLima() {
  return new Date().toLocaleDateString("en-CA", { timeZone: LIMA_TZ });
}

/**
 * Retorna la hora actual en Lima como string "HH:mm"
 */
export function nowTimeLima() {
  return new Date().toLocaleTimeString("es-PE", { timeZone: LIMA_TZ, hour: "2-digit", minute: "2-digit", hour12: false });
}

/**
 * Retorna un objeto Date ajustado al mediodía de Lima para evitar
 * desplazamientos de día al parsear strings "yyyy-MM-dd".
 * Usar siempre en lugar de new Date("yyyy-MM-dd") para mostrar fechas.
 */
export function parseDateLima(dateStr) {
  if (!dateStr) return null;
  // "2024-03-01" → "2024-03-01T12:00:00-05:00" (mediodía Lima)
  return new Date(`${dateStr}T12:00:00-05:00`);
}

/**
 * Formatea un string de fecha "yyyy-MM-dd" en el formato deseado usando Lima TZ.
 * @param {string} dateStr - Fecha en formato "yyyy-MM-dd"
 * @param {object} options - Opciones de Intl.DateTimeFormat
 */
export function formatDateLima(dateStr, options = { day: "2-digit", month: "short", year: "numeric" }) {
  if (!dateStr) return "";
  const date = parseDateLima(dateStr);
  return date.toLocaleDateString("es-PE", { timeZone: LIMA_TZ, ...options });
}

/**
 * Formatea un Date object o ISO string con hora en Lima TZ.
 */
export function formatDateTimeLima(dateOrStr, options = { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }) {
  if (!dateOrStr) return "";
  const date = typeof dateOrStr === "string" ? new Date(dateOrStr) : dateOrStr;
  return date.toLocaleString("es-PE", { timeZone: LIMA_TZ, ...options });
}

/**
 * Convierte un objeto Date (por ej. del Calendar picker) a string "yyyy-MM-dd" en Lima.
 * Usar al guardar fechas desde date pickers.
 */
export function dateToStringLima(date) {
  if (!date) return "";
  return date.toLocaleDateString("en-CA", { timeZone: LIMA_TZ });
}

/**
 * Retorna un objeto Date inicializado al día de hoy en Lima (a medianoche Lima).
 * Usar como valor inicial de date pickers.
 */
export function todayDateLima() {
  const todayStr = todayLima();
  return parseDateLima(todayStr);
}

/**
 * Compara dos strings de fecha "yyyy-MM-dd".
 * Retorna true si dateStr1 <= dateStr2
 */
export function isDateBefore(dateStr1, dateStr2) {
  return dateStr1 <= dateStr2;
}