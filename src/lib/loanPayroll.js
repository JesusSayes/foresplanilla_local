// Integración de préstamos con la planilla mensual.
//
//   - MAX_LOAN_INSTALLMENTS: plazo máximo de cuotas de un préstamo (12 meses).
//   - buildInstallmentsByEmployee: agrupa las cuotas pendientes del período por
//     empleado, considerando únicamente préstamos activos.
//   - sumLoanDeduction: total descontado por cuotas de préstamo en una boleta.
//   - markLoanInstallmentsApplied / revertLoanInstallments: sincronizan el estado
//     de las cuotas y del préstamo cuando se generan o eliminan planillas.

import { base44 } from "@/api/base44Client";
import { safePayrollNumber, roundMoney } from "@/lib/payrollUtils";

export const MAX_LOAN_INSTALLMENTS = 12;

export const LOAN_CONCEPT_NAME = "Cuota de Préstamo";
export const LOAN_CONCEPT_CATEGORY = "Préstamos";

// Cuotas pendientes del período agrupadas por empleado (solo préstamos activos).
export const buildInstallmentsByEmployee = (installments = [], activeLoans = []) => {
  const loansById = new Map((activeLoans || []).map(l => [l.id, l]));
  const byEmployee = {};
  (installments || []).forEach(inst => {
    const loan = loansById.get(inst.loan_id);
    if (!loan) return;
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
        d.concept_category === LOAN_CONCEPT_CATEGORY
      )
      .reduce((sum, d) => sum + Math.abs(safePayrollNumber(d.calculated_amount)), 0)
  );

// Mantiene sincronizados el contador de cuotas pagadas y el estado del préstamo.
// El estado "Cancelado" es manual: nunca se sobrescribe automáticamente.
const syncLoans = async (loanIds = []) => {
  for (const loanId of [...new Set(loanIds)]) {
    const loan = await base44.entities.Loan.get(loanId);
    if (!loan || loan.is_deleted) continue;
    const loanInstallments = await base44.entities.LoanInstallment.filter({ loan_id: loanId });
    const paid = loanInstallments.filter(i => i.status === "Aplicado").length;
    const total = parseInt(loan.total_installments) || loanInstallments.length;
    const patch = { installments_paid: paid };
    if (loan.status !== "Cancelado") {
      patch.status = total > 0 && paid >= total ? "Pagado" : "Activo";
    }
    await base44.entities.Loan.update(loanId, patch);
  }
};

// Marca como "Aplicado" las cuotas de préstamo descontadas en las boletas recién
// generadas. Solo se marcan las cuotas del mismo período que la boleta.
export const markLoanInstallmentsApplied = async (payslips = []) => {
  const withLoan = (payslips || []).filter(
    p => p.id && safePayrollNumber(p.loan_deduction) > 0
  );
  if (withLoan.length === 0) return 0;

  const { month, year } = withLoan[0];
  const [pendingInstallments, activeLoansRaw] = await Promise.all([
    base44.entities.LoanInstallment.filter({ month, year, status: "Pendiente" }),
    base44.entities.Loan.filter({ status: "Activo" }),
  ]);
  // Excluir préstamos eliminados lógicamente (no vuelven a descontarse).
  const activeLoans = activeLoansRaw.filter(l => !l.is_deleted);

  const byEmployee = buildInstallmentsByEmployee(pendingInstallments, activeLoans);
  const appliedAt = new Date().toISOString();
  const updates = [];
  const touchedLoans = [];

  withLoan.forEach(payslip => {
    (byEmployee[payslip.employee_id] || []).forEach(inst => {
      updates.push({
        id: inst.id,
        status: "Aplicado",
        payslip_id: payslip.id,
        applied_date: appliedAt,
      });
      touchedLoans.push(inst.loan_id);
    });
  });

  if (updates.length === 0) return 0;

  await base44.entities.LoanInstallment.bulkUpdate(updates);
  await syncLoans(touchedLoans);
  return updates.length;
};

// Devuelve a "Pendiente" las cuotas aplicadas en las boletas indicadas, para que
// vuelvan a descontarse si la planilla se regenera.
export const revertLoanInstallments = async (payslipIds = []) => {
  const ids = (payslipIds || []).filter(Boolean);
  if (ids.length === 0) return 0;

  const applied = await base44.entities.LoanInstallment.filter({
    payslip_id: { $in: ids },
    status: "Aplicado",
  });
  if (applied.length === 0) return 0;

  await base44.entities.LoanInstallment.bulkUpdate(
    applied.map(i => ({
      id: i.id,
      status: "Pendiente",
      payslip_id: "",
      applied_date: "",
    }))
  );
  await syncLoans(applied.map(i => i.loan_id));
  return applied.length;
};