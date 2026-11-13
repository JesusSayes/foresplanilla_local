// Exención de la Prima de Seguro AFP (concepto 0606) por edad.
//
// Regla de RR. HH.: si el trabajador cumple 65 años en CUALQUIER día del mes del
// periodo de planilla (incluso si cumple el último día del mes), la prima de seguro
// no se descuenta en ese periodo: el monto del concepto 0606 es S/ 0.00.
//
// Se aplica a todas las AFP y solo a la prima de seguro: el aporte obligatorio AFP
// (0608), la comisión AFP (0601) y los demás conceptos no cambian.
//
// La fecha de nacimiento se trata como fecha calendario estricta (YYYY-MM-DD), sin
// conversiones de zona horaria que puedan desplazar el día o el mes.

export const AFP_INSURANCE_EXEMPTION_AGE = 65;

/**
 * Extrae { year, month, day } de una fecha calendario.
 * Acepta "YYYY-MM-DD", ISO con hora ("YYYY-MM-DDTHH:mm:ss") o Date.
 * Devuelve null si no se puede interpretar.
 */
export function parseCalendarDate(value) {
  if (!value) return null;
  if (typeof value === "string") {
    const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!match) return null;
    return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
  }
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return { year: date.getFullYear(), month: date.getMonth() + 1, day: date.getDate() };
}

/**
 * True si el trabajador cumple la edad de exención (65 años por defecto) dentro del
 * mes y año del periodo de planilla.
 *
 * Casos:
 *   - Cumple 65 en un mes anterior  → false (no aplica la exención en este periodo).
 *   - Cumple 65 en el mes del periodo (cualquier día) → true.
 *   - Cumple 65 en un mes posterior → false.
 */
export function turnsAgeInPayrollPeriod(birthDate, month, year, age = AFP_INSURANCE_EXEMPTION_AGE) {
  const birth = parseCalendarDate(birthDate);
  const periodMonth = Number(month);
  const periodYear = Number(year);
  if (!birth) return false;
  if (!Number.isInteger(periodMonth) || !Number.isInteger(periodYear)) return false;
  return birth.year + age === periodYear && birth.month === periodMonth;
}

/** True si la prima de seguro AFP (0606) debe quedar en S/ 0.00 en el periodo. */
export const isAfpInsuranceExemptByAge = (birthDate, month, year) =>
  turnsAgeInPayrollPeriod(birthDate, month, year, AFP_INSURANCE_EXEMPTION_AGE);