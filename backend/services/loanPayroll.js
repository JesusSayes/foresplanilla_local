// Ejecutar siempre dentro de la transacción que modifica las boletas.
const money = value => Math.round(Number(value || 0) * 100);
const conflict = message => Object.assign(new Error(message), { status: 409 });

export async function syncLoanStatuses(db, loanIds) {
  for (const id of [...new Set(loanIds)]) {
    const loan = await db.loan.findUnique({ where: { id } });
    if (!loan) continue;
    const paid = await db.loaninstallment.count({ where: { loan_id: id, status: 'Aplicado' } });
    const data = { installments_paid: paid };
    if (!loan.is_deleted && loan.status !== 'Cancelado') {
      data.status = loan.total_installments > 0 && paid >= loan.total_installments ? 'Pagado' : 'Activo';
    }
    await db.loan.update({ where: { id }, data });
  }
}

export async function revertLoanInstallments(db, payslipIds) {
  if (!payslipIds.length) return;
  const installments = await db.loaninstallment.findMany({
    where: { payslip_id: { in: payslipIds }, status: 'Aplicado' },
  });
  for (const installment of installments) {
    const loan = await db.loan.findUnique({ where: { id: installment.loan_id } });
    await db.loaninstallment.update({
      where: { id: installment.id },
      data: { status: loan?.is_deleted ? 'Omitido' : 'Pendiente', payslip_id: null, applied_date: null },
    });
  }
  await syncLoanStatuses(db, installments.map(i => i.loan_id));
}

export async function applyLoanInstallments(db, payslips) {
  for (const payslip of payslips) {
    if (payslip.payroll_type !== 'Mensual' || money(payslip.loan_deduction) <= 0) continue;
    const loans = await db.loan.findMany({ where: { employee_id: payslip.employee_id, status: 'Activo', is_deleted: false } });
    const installments = await db.loaninstallment.findMany({
      where: { loan_id: { in: loans.map(l => l.id) }, month: payslip.month, year: payslip.year, status: 'Pendiente' },
    });
    // No aplicar cuotas distintas a las que respaldan el importe calculado.
    if (installments.reduce((sum, i) => sum + money(i.amount), 0) !== money(payslip.loan_deduction)) {
      throw conflict('Las cuotas de préstamo cambiaron o no coinciden con el descuento. Recalcule la planilla.');
    }
    const result = await db.loaninstallment.updateMany({
      where: { id: { in: installments.map(i => i.id) }, status: 'Pendiente' },
      data: { status: 'Aplicado', payslip_id: payslip.id, applied_date: new Date().toISOString() },
    });
    if (result.count !== installments.length) throw conflict('Otra planilla aplicó las cuotas. Recalcule la planilla.');
    await syncLoanStatuses(db, installments.map(i => i.loan_id));
  }
}
