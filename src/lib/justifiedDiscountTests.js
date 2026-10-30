/**
 * Pruebas del descuento por HORAS de justificaciones aprobadas con afectación
 * "Descuento" (caso reportado por RR. HH.: tipo "Otro" con intervalo parcial).
 *
 * Verifican: cálculo por horas (5 h 36 min = 5.6 h, NO 5.36), afectación tomada
 * del catálogo, exclusión de permisos/pendientes/rechazadas, no duplicidad con
 * falta completa ni con tardanzas, alerta de salida pendiente y regla quincenal.
 * Se ejecutan con datos ficticios; no leen ni escriben la base de datos.
 */

import {
  buildAffectationMap,
  buildJustifiedHoursDiscount,
  resolveIncidentAffectation,
  approvedIncidentMinutes,
  JUSTIFIED_DISCOUNT_NAME,
} from "@/lib/justifiedDiscounts";
import { computePrevisionalVariables } from "@/lib/previsionalBase";

const SALARY = 1500;
const PERIOD = { periodStart: "2026-08-01", periodEnd: "2026-08-31" };
const catalog = buildAffectationMap([
  { name: "Otro", affectation: "Descuento" },
  { name: "Cita Médica", affectation: "Descuento" },
  { name: "Licencia sin Goce de Haber", affectation: "Descuento" },
  { name: "Descanso Médico", affectation: "Permiso" },
  { name: "Confirmación de Asistencia (Limitación de Sistema)", affectation: "Permiso" },
]);

const incident = (overrides = {}) => ({
  employee_id: "emp1",
  incident_date: "2026-08-31",
  incident_type: "Otro",
  status: "Aprobada",
  full_day_justification: false,
  justified_time_start: "12:00",
  justified_time_end: "17:36",
  hours_to_adjust: 5.6,
  ...overrides,
});

const partialRecord = {
  employee_id: "emp1",
  date: "2026-08-31",
  clock_in: "06:56",
  clock_out: null,
  scheduled_start: "07:00",
  scheduled_end: "17:36",
};

const run = (overrides = {}, extra = {}) =>
  buildJustifiedHoursDiscount({
    employeeId: "emp1",
    baseSalary: SALARY,
    payrollType: "Mensual",
    incidents: [incident(overrides)],
    affectationMap: catalog,
    ...PERIOD,
    records: [partialRecord],
    ...extra,
  });

const round2 = (n) => Math.round(n * 100) / 100;

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

const assert = (condition, label) => {
  if (!condition) throw new Error(label);
};
const assertEqual = (actual, expected, label) => {
  if (round2(actual) !== round2(expected)) throw new Error(`${label}: esperado ${expected}, obtenido ${actual}`);
};

// 1. Caso reportado: "Otro" / Descuento, 12:00–17:36 → 5 h 36 min = 5.6 h → S/ 35.00
test("Otro con afectación Descuento descuenta 5 h 36 min = S/ 35.00", () => {
  const result = run();
  assertEqual(result.minutes, 336, "minutos aprobados");
  assertEqual(result.hours, 5.6, "horas aprobadas (no 5.36)");
  assertEqual(result.amount, 35, "importe");
  assert(result.concept, "debe generar concepto");
  assertEqual(result.concept.amount, 35, "importe del concepto");
  assert(result.concept.concept_name === JUSTIFIED_DISCOUNT_NAME, "nombre del concepto en la boleta");
  assertEqual(result.days.length, 1, "una sola aplicación");
});

// 2. Alerta de salida pendiente (entrada sin salida), sin descontar día completo
test("Entrada sin salida genera alerta y no un día completo", () => {
  const result = run();
  assertEqual(result.missingClockOut.length, 1, "alertas de salida");
  assert(result.missingClockOut[0].date === "2026-08-31", "fecha de la alerta");
  assertEqual(result.amount, 35, "solo el tiempo autorizado");
  assert(result.days[0].missingClockOut, "la jornada queda marcada como pendiente de salida");
});

// 3. Afectación Permiso: no descuenta aunque esté aprobada
test("Tipo con afectación Permiso no genera descuento", () => {
  const result = run({ incident_type: "Descanso Médico" });
  assert(!result.concept, "no debe generar concepto");
  assertEqual(result.amount, 0, "importe");
});

// 4. La afectación se toma del catálogo, no del nombre del tipo
test("Se respeta el catálogo cuando difiere del valor por defecto", () => {
  const custom = buildAffectationMap([{ name: "Otro", affectation: "Permiso" }]);
  const result = run({}, { affectationMap: custom });
  assertEqual(result.amount, 0, "importe con afectación configurada como Permiso");
  assert(resolveIncidentAffectation("Otro", custom) === "Permiso", "catálogo tiene prioridad");
  assert(resolveIncidentAffectation("Otro", new Map()) === "Descuento", "respaldo por defecto");
});

// 5. Pendiente o rechazada: no descuenta
test("Solicitudes pendientes o rechazadas no se descuentan", () => {
  assertEqual(run({ status: "Pendiente" }).amount, 0, "pendiente");
  assertEqual(run({ status: "Rechazada" }).amount, 0, "rechazada");
});

// 6. Día completo aprobado (afectación Descuento) usa las horas del día
test("Día completo aprobado descuenta las horas del día, una sola vez", () => {
  const result = run({
    full_day_justification: true,
    justified_time_start: "07:00",
    justified_time_end: "17:36",
    hours_to_adjust: 9.6,
  });
  // El día completo equivale al valor diario (sueldo / 30 = 50), no al tramo
  // 07:00–17:36 del horario.
  assertEqual(result.minutes, 480, "minutos del día completo (tope de jornada)");
  assertEqual(result.amount, 50, "importe del día completo (1500 / 30)");
});

// 7. No duplica una falta completa ya descontada
test("Una fecha ya descontada como falta no se vuelve a descontar", () => {
  const result = run({}, { alreadyDiscountedDates: new Set(["2026-08-31"]) });
  assertEqual(result.amount, 0, "importe");
  assert(!result.concept, "no debe generar concepto");
});

// 8. No duplica la licencia sin goce ya descontada
test("Licencia sin goce de día completo ya descontada no se duplica", () => {
  const result = run(
    { incident_type: "Licencia sin Goce de Haber", full_day_justification: true, hours_to_adjust: 8 },
    { alreadyDiscountedDates: new Set(["2026-08-31"]) }
  );
  assertEqual(result.amount, 0, "importe");
});

// 9. No duplica minutos ya descontados por tardanza/salida anticipada
test("Los minutos ya descontados por tardanza se restan de las horas aprobadas", () => {
  const result = run({}, { chargedMinutesByDate: new Map([["2026-08-31", 36]]) });
  assertEqual(result.minutes, 300, "minutos netos");
  assertEqual(result.amount, 31.25, "importe sin duplicar");
});

// 10. Fuera del período de cómputo: no aplica
test("Justificación fuera del período no se aplica", () => {
  const result = run({ incident_date: "2026-07-31" });
  assertEqual(result.amount, 0, "importe");
});

// 11. Múltiples fechas: cada una se calcula por separado
test("Múltiples fechas se calculan por fecha", () => {
  const result = buildJustifiedHoursDiscount({
    employeeId: "emp1",
    baseSalary: SALARY,
    payrollType: "Mensual",
    incidents: [
      incident(),
      incident({ incident_date: "2026-08-12", hours_to_adjust: 2, justified_time_start: "15:00", justified_time_end: "17:00" }),
    ],
    affectationMap: catalog,
    ...PERIOD,
    records: [partialRecord],
  });
  assertEqual(result.days.length, 2, "dos fechas");
  assertEqual(result.minutes, 456, "minutos totales (336 + 120)");
  assertEqual(result.amount, 47.5, "importe total");
});

// 12. Sin horas medibles no hay descuento
test("Justificación sin horas ni intervalo no descuenta", () => {
  assertEqual(approvedIncidentMinutes({ hours_to_adjust: 0 }), 0, "minutos");
  assertEqual(run({ hours_to_adjust: 0, justified_time_start: null, justified_time_end: null }).amount, 0, "importe");
});

// 13. Quincenal es adelanto: no aplica
test("La planilla quincenal no aplica el descuento", () => {
  assertEqual(run({}, { payrollType: "Quincenal" }).amount, 0, "importe");
});

// 14. Coherencia con neto y base previsional
test("Descuento reduce el neto y la base previsional una sola vez", () => {
  const result = run();
  const incomes = [{ concept_name: "Remuneración Básica", concept_category: "Remuneración Base", calculated_amount: SALARY }];
  const deductions = [{ ...result.concept, calculated_amount: result.amount }];
  const withoutDiscount = computePrevisionalVariables(incomes, []);
  const withDiscount = computePrevisionalVariables(incomes, deductions);
  assertEqual(deductions.reduce((s, d) => s + d.calculated_amount, 0), 35, "total descuentos");
  assertEqual(withoutDiscount.remuneracion_afecta - withDiscount.remuneracion_afecta, 35, "reducción de la base");
  assertEqual(SALARY - 35, 1465, "neto");
});

export const runJustifiedDiscountTests = () => {
  const results = tests.map(({ name, fn }) => {
    try {
      fn();
      return { name, passed: true, error: "" };
    } catch (error) {
      return { name, passed: false, error: error.message };
    }
  });
  return { results, passed: results.filter(r => r.passed).length, failed: results.filter(r => !r.passed).length };
};

export default runJustifiedDiscountTests;