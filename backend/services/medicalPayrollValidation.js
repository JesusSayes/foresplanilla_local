const conflict = message => Object.assign(new Error(message), { status: 409 });
const isClosed = payslip => ['Aprobada', 'Pagada'].includes(payslip?.status) || !!payslip?.digital_signature_url;

// Se aplica también al guardar por API: una advertencia en la pantalla no basta.
export async function validateMedicalPayroll(db, payslips, { replace = false } = {}) {
  const seen = new Set();
  for (const payslip of payslips) {
    const snapshot = payslip.calculation_summary?.medical_subsidy;
    if (!snapshot) continue;
    const key = `${payslip.employee_id}|${payslip.year}|${payslip.month}`;
    if (seen.has(key)) throw conflict('No se puede liquidar dos veces el subsidio de un empleado en el mismo lote');
    seen.add(key);
    if (snapshot.version !== 2 || snapshot.validation?.blocked !== false || snapshot.validation?.status !== 'ok' ||
        (snapshot.subsidized_days > 0 && snapshot.base?.pending) || !Array.isArray(snapshot.days)) {
      throw conflict('El descanso médico requiere revisión antes de guardar la boleta');
    }
    const month = `${payslip.year}-${String(payslip.month).padStart(2, '0')}`;
    if (snapshot.days.some(day => !day.date?.startsWith(`${month}-`)) ||
        new Set(snapshot.days.map(day => day.date)).size !== snapshot.days.length ||
        snapshot.days.some(day => !['20', '21'].includes(day.plame_code))) {
      throw conflict('Las fechas del descanso médico no corresponden al mes de planilla');
    }
    const amount = Number(snapshot.subsidy_amount);
    const items = payslip.calculation_summary?.breakdown?.incomes?.items || [];
    const subsidyItems = items.filter(item => item.concept_code === '0916');
    const paid = subsidyItems.reduce((sum, item) => sum + Number(item.amount), 0);
    if (!Number.isFinite(amount) || amount < 0 || !Number.isFinite(paid) ||
        Math.abs(paid - amount) > 0.01 || subsidyItems.length > 1 ||
        Number(payslip.subsidized_days) !== snapshot.days.filter(day => day.plame_code === '21').length) {
      throw conflict('El importe o los días subsidiados no coinciden con el detalle de la boleta');
    }
    const existing = await db.payslip.findMany({ where: {
      employee_id: payslip.employee_id, year: payslip.year, month: payslip.month,
    } });
    for (const previous of existing) {
      if (previous.id === payslip.id) {
        if (isClosed(previous) && JSON.stringify(previous.calculation_summary?.medical_subsidy) !== JSON.stringify(snapshot)) {
          throw conflict('No se puede recalcular el descanso médico de una boleta cerrada o firmada');
        }
        continue;
      }
      if (previous.payroll_type === 'Quincenal') continue;
      if (replace && previous.payroll_type === payslip.payroll_type && !isClosed(previous)) continue;
      if (previous.payroll_type === payslip.payroll_type || previous.calculation_summary?.medical_subsidy) {
        throw conflict('Ya existe una liquidación médica o una boleta cerrada para este período; requiere rectificación');
      }
    }
  }
}
