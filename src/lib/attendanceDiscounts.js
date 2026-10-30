// Descuentos por asistencia como CONCEPTOS INDEPENDIENTES de la boleta.
//
//   Descuento por Inasistencias          = valor diario × días de falta injustificada
//   Descuento por Licencia sin Goce      = valor diario × días de licencia sin goce
//
// El valor diario es (sueldo del contrato / 30), la convención peruana de cómputo
// mensual. La remuneración básica se paga por los días contractuales del período
// (ver src/lib/baseSalaryConcept.js), de modo que estos conceptos descuentan una
// sola vez el día no remunerado: no hay prorrateo simultáneo de la básica.
//
// La planilla quincenal es un adelanto: no aplica descuentos.

import { roundMoney, safePayrollNumber } from "@/lib/payrollUtils";

export const ABSENCE_DISCOUNT_NAME = "Descuento por Inasistencias";
export const UNPAID_LEAVE_DISCOUNT_NAME = "Descuento por Licencia sin Goce de Haber";

// Código PLAME interno del descuento por inasistencias (concepto ya existente).
export const ABSENCE_DISCOUNT_CODE = "0705";

const buildDeductionConcept = ({ employeeId, name, code, amount }) => ({
  employee_id: employeeId,
  concept_type: "Descuento",
  concept_category: "Descuentos Varios",
  concept_name: name,
  concept_code: code || "",
  is_dynamic: false,
  is_recurring: false,
  amount,
  applies_to_payroll_types: ["Mensual", "Adicional", "SNP"],
});

/**
 * Construye los conceptos de descuento por inasistencias y licencia sin goce.
 * Devuelve también los importes para los campos dedicados de la boleta.
 */
export const buildAttendanceDiscountConcepts = ({
  employeeId,
  baseSalary,
  absenceDays = 0,
  unpaidLeaveDays = 0,
  payrollType = "Mensual",
}) => {
  const empty = { concepts: [], absenceAmount: 0, unpaidLeaveAmount: 0, dailyRate: 0 };
  if (payrollType === "Quincenal") return empty;

  const salary = safePayrollNumber(baseSalary);
  if (salary <= 0) return empty;

  const dailyRate = salary / 30;
  const absDays = Math.max(0, Math.floor(Number(absenceDays) || 0));
  const leaveDays = Math.max(0, Math.floor(Number(unpaidLeaveDays) || 0));
  const absenceAmount = roundMoney(dailyRate * absDays);
  const unpaidLeaveAmount = roundMoney(dailyRate * leaveDays);

  const concepts = [];
  if (absenceAmount > 0) {
    concepts.push(buildDeductionConcept({
      employeeId,
      name: ABSENCE_DISCOUNT_NAME,
      code: ABSENCE_DISCOUNT_CODE,
      amount: absenceAmount,
    }));
  }
  if (unpaidLeaveAmount > 0) {
    concepts.push(buildDeductionConcept({
      employeeId,
      name: UNPAID_LEAVE_DISCOUNT_NAME,
      code: "",
      amount: unpaidLeaveAmount,
    }));
  }

  return { concepts, absenceAmount, unpaidLeaveAmount, dailyRate };
};