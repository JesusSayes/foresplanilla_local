/**
 * Pruebas del descuento por inasistencias y por licencia sin goce de haber.
 *
 * Verifican la cadena completa: detección (justificaciones y asistencia) →
 * conceptos de descuento → días trabajados/no laborados → neto y base previsional.
 * Se pueden ejecutar desde el navegador (igual que pensionCalcTests.js).
 */

import { classifyAbsenceDay, ABSENCE_KIND, isFullDayUnpaidLeaveRecord } from "@/lib/attendanceReconciliation";
import { buildAttendanceDiscountConcepts, ABSENCE_DISCOUNT_NAME, UNPAID_LEAVE_DISCOUNT_NAME } from "@/lib/attendanceDiscounts";
import { applyContractualBaseSalary } from "@/lib/baseSalaryConcept";
import { applyAbsenceDays } from "@/lib/payrollDays";
import { computePrevisionalVariables } from "@/lib/previsionalBase";

const SALARY = 1500;
const DAILY = SALARY / 30; // 50.00

const buildBoleta = ({ contractConcepts, absenceDays = 0, unpaidLeaveDays = 0 }) => {
  const contractualWorkedDays = 30;
  const days = applyAbsenceDays({
    baseWorkedDays: contractualWorkedDays,
    payrollType: "Mensual",
    absenceDays,
    sinGoceFullDays: unpaidLeaveDays,
  });
  const discounts = buildAttendanceDiscountConcepts({
    employeeId: "emp1",
    baseSalary: SALARY,
    absenceDays,
    unpaidLeaveDays,
    payrollType: "Mensual",
  });
  const concepts = applyContractualBaseSalary(contractConcepts, SALARY, contractualWorkedDays);
  const incomes = concepts.map(c => ({ ...c, calculated_amount: c.amount, concept_category: c.concept_category }));
  const totalIncome = incomes.reduce((s, c) => s + c.calculated_amount, 0);
  // Igual que el motor: el concepto ejecutado expone calculated_amount (positivo).
  const deductionItems = discounts.concepts.map(c => ({ ...c, calculated_amount: c.amount }));
  const totalDeductions = deductionItems.reduce((s, c) => s + c.calculated_amount, 0);
  const previsional = computePrevisionalVariables(incomes, deductionItems, 0);
  return {
    workedDays: days.workedDays,
    nonWorkedDays: days.nonWorkedDays,
    baseAmount: incomes[0].calculated_amount,
    discounts: discounts.concepts,
    absenceAmount: discounts.absenceAmount,
    unpaidLeaveAmount: discounts.unpaidLeaveAmount,
    totalIncome,
    totalDeductions,
    netPay: totalIncome - totalDeductions,
    remuneracionAfecta: previsional.remuneracion_afecta,
  };
};

const BASE_CONCEPT = {
  concept_name: "Remuneración Básica",
  concept_code: "0101",
  concept_category: "Otros",
  concept_type: "Ingreso",
  is_dynamic: true,
  calculation_formula: "(base_salary / 30) * worked_days",
};

const round2 = (n) => Math.round(n * 100) / 100;

const tests = [];
const test = (name, fn) => tests.push({ name, fn });
const assertEqual = (actual, expected, label) => {
  if (round2(actual) !== round2(expected)) {
    throw new Error(`${label}: esperado ${expected}, obtenido ${actual}`);
  }
};

// ── Detección desde Justificaciones / Asistencia ────────────────────────────
test("Licencia sin goce aprobada en Justificaciones se clasifica como no remunerada", () => {
  const state = classifyAbsenceDay({
    date: "2026-06-24",
    record: { status: "Justificado", is_absent: false },
    scheduleDay: { start: "08:00", end: "17:00" },
    approvedIncidents: [{ incident_type: "Licencia sin Goce de Haber", status: "Aprobada", full_day_justification: true }],
  });
  if (state.kind !== ABSENCE_KIND.SIN_GOCE) throw new Error(`Tipo obtenido: ${state.kind}`);
});

test("Registro con estado 'Permiso sin goce' (día completo) se clasifica como no remunerado", () => {
  const record = { status: "Permiso sin goce", notes: "Permiso sin goce (día completo)" };
  if (!isFullDayUnpaidLeaveRecord(record)) throw new Error("No reconocido como día completo");
  const state = classifyAbsenceDay({
    date: "2026-06-25",
    record,
    scheduleDay: { start: "08:00", end: "17:00" },
  });
  if (state.kind !== ABSENCE_KIND.SIN_GOCE) throw new Error(`Tipo obtenido: ${state.kind}`);
});

test("Permiso sin goce por horas no resta el día completo", () => {
  const record = { status: "Permiso sin goce", notes: "Permiso sin goce (horas): 09:00 - 12:00" };
  if (isFullDayUnpaidLeaveRecord(record)) throw new Error("Se trató como día completo");
  const state = classifyAbsenceDay({
    date: "2026-06-26",
    record,
    scheduleDay: { start: "08:00", end: "17:00" },
  });
  if (state.kind === ABSENCE_KIND.SIN_GOCE) throw new Error("Restó un día completo");
});

test("Descanso médico aprobado es ausencia remunerada (sin descuento)", () => {
  const state = classifyAbsenceDay({
    date: "2026-06-27",
    record: { status: "Justificado" },
    scheduleDay: { start: "08:00", end: "17:00" },
    approvedIncidents: [{ incident_type: "Descanso Médico", status: "Aprobada", full_day_justification: true }],
  });
  if (state.kind === ABSENCE_KIND.SIN_GOCE || state.kind === ABSENCE_KIND.CONFIRMED) {
    throw new Error(`Tipo obtenido: ${state.kind}`);
  }
});

// ── Cálculo de la boleta ────────────────────────────────────────────────────
test("Trabajador con 3 días de licencia sin goce: descuento independiente y días coherentes", () => {
  const b = buildBoleta({ contractConcepts: [{ ...BASE_CONCEPT }], unpaidLeaveDays: 3 });
  assertEqual(b.workedDays, 27, "Días trabajados");
  assertEqual(b.nonWorkedDays, 3, "Días no laborados");
  assertEqual(b.baseAmount, SALARY, "Remuneración básica");
  assertEqual(b.unpaidLeaveAmount, DAILY * 3, "Descuento licencia sin goce");
  assertEqual(b.absenceAmount, 0, "Descuento por inasistencias");
  if (!b.discounts.some(c => c.concept_name === UNPAID_LEAVE_DISCOUNT_NAME)) {
    throw new Error("Falta el concepto de licencia sin goce");
  }
  assertEqual(b.netPay, SALARY - DAILY * 3, "Neto a pagar");
  assertEqual(b.remuneracionAfecta, SALARY - DAILY * 3, "Remuneración afecta (AFP/ONP)");
});

test("Trabajador con 2 inasistencias injustificadas: descuento independiente", () => {
  const b = buildBoleta({ contractConcepts: [{ ...BASE_CONCEPT }], absenceDays: 2 });
  assertEqual(b.workedDays, 28, "Días trabajados");
  assertEqual(b.nonWorkedDays, 2, "Días no laborados");
  assertEqual(b.absenceAmount, DAILY * 2, "Descuento por inasistencias");
  if (!b.discounts.some(c => c.concept_name === ABSENCE_DISCOUNT_NAME)) {
    throw new Error("Falta el concepto de inasistencias");
  }
  assertEqual(b.netPay, SALARY - DAILY * 2, "Neto a pagar");
  assertEqual(b.remuneracionAfecta, SALARY - DAILY * 2, "Remuneración afecta (AFP/ONP)");
});

test("Trabajador sin ausencias: no presenta descuentos adicionales", () => {
  const b = buildBoleta({ contractConcepts: [{ ...BASE_CONCEPT }] });
  assertEqual(b.workedDays, 30, "Días trabajados");
  assertEqual(b.nonWorkedDays, 0, "Días no laborados");
  if (b.discounts.length !== 0) throw new Error(`Descuentos inesperados: ${b.discounts.length}`);
  assertEqual(b.netPay, SALARY, "Neto a pagar");
  assertEqual(b.remuneracionAfecta, SALARY, "Remuneración afecta (AFP/ONP)");
});

test("Ausencias justificadas remuneradas no generan descuento", () => {
  // Días subsidiados (descanso médico): no son faltas ni licencias sin goce.
  const b = buildBoleta({ contractConcepts: [{ ...BASE_CONCEPT }], absenceDays: 0, unpaidLeaveDays: 0 });
  if (b.totalDeductions !== 0) throw new Error("Se aplicó un descuento");
  assertEqual(b.baseAmount, SALARY, "Remuneración básica completa");
});

test("No se cobra dos veces el mismo día (básica sin prorrateo + concepto único)", () => {
  const b = buildBoleta({ contractConcepts: [{ ...BASE_CONCEPT }], absenceDays: 1, unpaidLeaveDays: 1 });
  assertEqual(b.workedDays, 28, "Días trabajados");
  assertEqual(b.nonWorkedDays, 2, "Días no laborados");
  assertEqual(b.totalDeductions, DAILY * 2, "Total de descuentos");
  assertEqual(b.netPay, SALARY - DAILY * 2, "Neto a pagar");
});

test("La planilla quincenal es un adelanto: no descuenta inasistencias ni licencias", () => {
  const d = buildAttendanceDiscountConcepts({
    employeeId: "emp1",
    baseSalary: SALARY,
    absenceDays: 2,
    unpaidLeaveDays: 1,
    payrollType: "Quincenal",
  });
  if (d.concepts.length !== 0) throw new Error("Aplicó descuentos en quincenal");
  const days = applyAbsenceDays({ baseWorkedDays: 15, payrollType: "Quincenal", absenceDays: 2, sinGoceFullDays: 1 });
  assertEqual(days.workedDays, 15, "Días trabajados quincenal");
  assertEqual(days.nonWorkedDays, 0, "Días no laborados quincenal");
});

export const runAttendanceDiscountTests = () => {
  const results = tests.map(({ name, fn }) => {
    try {
      fn();
      return { name, ok: true };
    } catch (error) {
      return { name, ok: false, error: error.message };
    }
  });
  const failed = results.filter(r => !r.ok);
  return { total: results.length, passed: results.length - failed.length, failed: failed.length, results };
};