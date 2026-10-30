// Descuento por HORAS de justificaciones aprobadas cuya afectación es "Descuento".
//
// La afectación NO se deduce del nombre del tipo: se consulta el catálogo
// IncidentType (affectation: "Permiso" | "Descuento"). Si el tipo no está
// registrado en el catálogo se usa la afectación por defecto documentada.
//
//   importe = (sueldo del contrato / 30 / 8) × (minutos aprobados / 60)
//
// Ejemplo: 1500 / 30 / 8 = 6.25 por hora; 5 h 36 min = 336 min = 5.6 h → S/ 35.00.
//
// Se descuenta UNA sola vez:
//   - se omiten las fechas ya descontadas como falta completa o licencia sin goce;
//   - de cada fecha se restan los minutos ya descontados por tardanza y salida
//     anticipada, para no cobrar dos veces el mismo tiempo.
//
// La planilla quincenal es un adelanto: no aplica estos descuentos.

import { roundMoney, safePayrollNumber } from "@/lib/payrollUtils";
import { getSegmentClockTimes } from "@/lib/attendanceMetrics";

export const JUSTIFIED_DISCOUNT_NAME = "Descuento por Horas Justificadas";

// Tope por fecha: la jornada convencional de 8 horas equivale al valor diario
// (sueldo / 30), de modo que un día completo justificado no descuenta más que
// el día y la misma unidad sirve para las horas parciales.
export const MAX_DAY_MINUTES = 8 * 60;

/** Afectación por defecto del catálogo, usada solo si el tipo no está registrado. */
export const DEFAULT_AFFECTATION_BY_TYPE = {
  "Cita Médica": "Descuento",
  "Licencia sin Goce de Haber": "Descuento",
  "Otro": "Descuento",
  "Confirmación de Asistencia (Limitación de Sistema)": "Permiso",
  "Descanso Médico": "Permiso",
  "Feriado": "Permiso",
  "Licencia con Goce de Haber": "Permiso",
  "Licencia por Fallecimiento": "Permiso",
  "Licencia por Maternidad": "Permiso",
  "Licencia por Paternidad": "Permiso",
  "Maternidad": "Permiso",
  "Paternidad": "Permiso",
};

export const AFFECTATION_DISCOUNT = "Descuento";

/** Catálogo IncidentType → Map<nombre, afectación>. */
export const buildAffectationMap = (incidentTypes = []) => {
  const map = new Map();
  (incidentTypes || []).forEach((type) => {
    if (type?.name) map.set(type.name, type.affectation);
  });
  return map;
};

/** Afectación configurada del tipo; "" si no hay configuración conocida. */
export const resolveIncidentAffectation = (typeName, affectationMap) => {
  if (affectationMap?.has(typeName)) return affectationMap.get(typeName) || "";
  return DEFAULT_AFFECTATION_BY_TYPE[typeName] || "";
};

/** "HH:mm" → minutos (null si no es una hora válida). */
export const timeToMinutes = (value) => {
  const match = /^(\d{1,2}):(\d{2})/.exec(String(value || "").trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  return hours * 60 + minutes;
};

/**
 * Minutos aprobados de una justificación: usa las horas guardadas al aprobar
 * (día completo u horas exactas) y, como respaldo, el intervalo aprobado.
 */
export const approvedIncidentMinutes = (incident) => {
  const stored = safePayrollNumber(incident?.hours_to_adjust);
  if (stored > 0) return Math.round(stored * 60);
  const start = timeToMinutes(incident?.justified_time_start);
  const end = timeToMinutes(incident?.justified_time_end);
  if (start === null || end === null || end <= start) return 0;
  return end - start;
};

/**
 * Construye el concepto de descuento por horas justificadas de un trabajador.
 *
 * alreadyDiscountedDates: fechas (YYYY-MM-DD) ya descontadas como falta completa o
 *   licencia sin goce, para no duplicarlas.
 * chargedMinutesByDate: minutos ya descontados ese día (tardanza + salida
 *   anticipada), que se restan de las horas aprobadas.
 * records: registros de asistencia del período, para detectar la entrada sin salida.
 */
export const buildJustifiedHoursDiscount = ({
  employeeId,
  baseSalary,
  payrollType = "Mensual",
  incidents = [],
  affectationMap,
  periodStart,
  periodEnd,
  alreadyDiscountedDates = new Set(),
  records = [],
  chargedMinutesByDate = new Map(),
}) => {
  const empty = { concept: null, amount: 0, minutes: 0, hours: 0, days: [], missingClockOut: [] };
  if (payrollType === "Quincenal") return empty;

  const salary = safePayrollNumber(baseSalary);
  if (salary <= 0) return empty;

  // Minutos aprobados por fecha (una justificación por fecha; si hay varias, se suman).
  const minutesByDate = new Map();
  const seen = new Set();
  for (const incident of incidents || []) {
    if (incident?.employee_id !== employeeId) continue;
    if (incident.status !== "Aprobada") continue;
    if (resolveIncidentAffectation(incident.incident_type, affectationMap) !== AFFECTATION_DISCOUNT) continue;

    const date = String(incident.incident_date || "").slice(0, 10);
    if (!date) continue;
    if (periodStart && date < periodStart) continue;
    if (periodEnd && date > periodEnd) continue;
    if (alreadyDiscountedDates.has(date)) continue;

    const minutes = approvedIncidentMinutes(incident);
    if (minutes <= 0) continue;

    const key = incident.id || `${date}|${incident.incident_type}|${incident.justified_time_start}|${incident.justified_time_end}|${minutes}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const entry = minutesByDate.get(date) || { date, minutes: 0, types: [] };
    entry.minutes += minutes;
    if (!entry.types.includes(incident.incident_type)) entry.types.push(incident.incident_type);
    minutesByDate.set(date, entry);
  }

  const hourlyRate = roundMoney(salary / 30) / 8;
  const recordsByDate = new Map(
    (records || []).map((record) => [String(record?.date || "").slice(0, 10), record])
  );

  const days = [];
  const missingClockOut = [];
  let totalMinutes = 0;

  for (const entry of [...minutesByDate.values()].sort((a, b) => a.date.localeCompare(b.date))) {
    const alreadyCharged = Math.max(0, safePayrollNumber(chargedMinutesByDate.get(entry.date)));
    const approved = Math.min(entry.minutes, MAX_DAY_MINUTES);
    const minutes = Math.max(0, approved - alreadyCharged);
    if (minutes <= 0) continue;

    const record = recordsByDate.get(entry.date) || null;
    const { firstClockIn, lastClockOut } = getSegmentClockTimes(record);
    // Entrada registrada sin salida: la jornada no se descuenta como falta completa,
    // pero la marcación debe regularizarse.
    const missingExit = !!(firstClockIn && !lastClockOut);

    totalMinutes += minutes;
    days.push({
      date: entry.date,
      minutes,
      hours: roundMoney(minutes / 60),
      types: entry.types,
      missingClockOut: missingExit,
    });
    if (missingExit) missingClockOut.push({ date: entry.date, types: entry.types });
  }

  if (totalMinutes <= 0) return { ...empty, missingClockOut };

  const amount = roundMoney(hourlyRate * (totalMinutes / 60));

  return {
    concept: {
      employee_id: employeeId,
      concept_type: "Descuento",
      concept_category: "Descuentos Varios",
      concept_name: JUSTIFIED_DISCOUNT_NAME,
      concept_code: "",
      is_dynamic: false,
      is_recurring: false,
      amount,
      applies_to_payroll_types: ["Mensual", "Adicional", "SNP"],
    },
    amount,
    minutes: totalMinutes,
    hours: roundMoney(totalMinutes / 60),
    days,
    missingClockOut,
  };
};