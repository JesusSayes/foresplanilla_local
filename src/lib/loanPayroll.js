// Integración de préstamos con la planilla mensual.
//
//   - MAX_LOAN_INSTALLMENTS: plazo máximo de cuotas de un préstamo (12 meses).
//   - buildInstallmentsByEmployee: agrupa las cuotas pendientes del período por
//     empleado, considerando únicamente préstamos activos.
//   - sumLoanDeduction: total descontado por cuotas de préstamo en una boleta.
// Los estados de cuotas se sincronizan en la transacción del backend local.

import { safePayrollNumber, roundMoney } from "@/lib/payrollUtils";

export const MAX_LOAN_INSTALLMENTS = 12;

export const LOAN_CONCEPT_NAME = "Cuota de Préstamo";
export const LOAN_CONCEPT_CATEGORY = "Préstamos";

// Cuotas pendientes del período agrupadas por empleado (solo préstamos activos).
export const buildInstallmentsByEmployee = (installments = [], activeLoans = [], payrollType = "Mensual") => {
  if (payrollType !== "Mensual") return {};
  const loansById = new Map((activeLoans || []).map(l => [l.id, l]));
  const byEmployee = {};
  (installments || []).forEach(inst => {
    const loan = loansById.get(inst.loan_id);
    if (!loan || loan.is_deleted || !["Activo", "Pagado"].includes(loan.status)) return;
    if (!["Pendiente", "Aplicado"].includes(inst.status)) return;
    if (!byEmployee[loan.employee_id]) byEmployee[loan.employee_id] = [];
    byEmployee[loan.employee_id].push(inst);
  });
  return byEmployee;
};

// Total descontado por cuotas de préstamo dentro de los descuentos calculados.
export const sumLoanDeduction = (deductions = []) =>
  roundMoney(
    (deductions || [])
      .filter(d =>
        d.system_logic_type === "loan_installment" ||
        String(d.calculation_formula || "").trim().toLowerCase() === "loan_installment" ||
        d.concept_category === LOAN_CONCEPT_CATEGORY
      )
      .reduce((sum, d) => sum + Math.abs(safePayrollNumber(d.calculated_amount)), 0)
  );
