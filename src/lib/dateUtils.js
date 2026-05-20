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
 * Tolerante a: string "yyyy-MM-dd", ISO datetime, Date object, timestamp numérico.
 */
export function parseDateLima(input) {
  if (!input) return null;

  // Ya es un Date válido
  if (input instanceof Date) {
    if (isNaN(input.getTime())) return null;
    // react-day-picker entrega medianoche UTC, usar propiedades UTC para evitar desfase en zonas negativas
    const y = input.getUTCFullYear();
    const m = String(input.getUTCMonth() + 1).padStart(2, "0");
    const d = String(input.getUTCDate()).padStart(2, "0");
    return new Date(`${y}-${m}-${d}T12:00:00Z`);
  }

  // Timestamp numérico
  if (typeof input === "number") {
    const d = new Date(input);
    if (isNaN(d.getTime())) return null;
    const y = d.getUTCFullYear();
    const mo = String(d.getUTCMonth() + 1).padStart(2, "0");
    const day = String(d.getUTCDate()).padStart(2, "0");
    return new Date(`${y}-${mo}-${day}T12:00:00Z`);
  }

  const str = String(input).trim();

  // Formato "yyyy-MM-dd" exacto → fijarlo al mediodía UTC directamente (fecha fija, sin TZ shift)
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    return new Date(`${str}T12:00:00Z`);
  }

  // ISO datetime u otro string con hora → parsear y extraer la parte de fecha en UTC
  const d = new Date(str);
  if (isNaN(d.getTime())) return null;
  const y = d.getUTCFullYear();
  const mo = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return new Date(`${y}-${mo}-${day}T12:00:00Z`);
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
 * Convierte un objeto Date (del Calendar picker) a string "yyyy-MM-dd".
 * react-day-picker construye el Date como medianoche UTC (ej: 2026-05-20T00:00:00Z),
 * por lo que se usan las propiedades UTC (.getUTCFullYear etc.) para evitar
 * que una zona horaria negativa (UTC-5) adelante el día al día anterior.
 */
export function dateToStringLima(date) {
  if (!date) return "";
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
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