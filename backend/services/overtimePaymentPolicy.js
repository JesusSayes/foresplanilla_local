const normalize = value => String(value || '').trim().toLowerCase();

export const isValidOvertimePaymentMode = value => ['payment', 'compensation_only'].includes(value);

const hasOvertimeIncome = payslip => {
  // Estas son las HE liquidadas en la boleta, no el saldo de asistencia.
  if (['overtime_pay', 'overtime_hours', 'overtime_hours_25', 'overtime_hours_35']
    .some(field => Number(payslip[field] || 0) !== 0)) return true;
  let summary = payslip.calculation_summary;
  if (typeof summary === 'string') {
    try { summary = JSON.parse(summary); }
    catch { throw Object.assign(new Error('Resumen de cálculo inválido'), { status: 400 }); }
  }
  return (summary?.breakdown?.incomes?.items || []).some(item => {
    const name = normalize(item.name);
    const formula = normalize(item.formula);
    const isOvertime = normalize(item.concept_category) === 'horas extras' ||
      name === 'horas extras al 25%' || name === 'horas extras al 35%' ||
      formula.includes('horas_extras_25') || formula.includes('horas_extras_35');
    return isOvertime && Number(item.amount || 0) !== 0;
  });
};

// Ejecutar dentro de la misma transacción que persiste las boletas.
// La lectura SQL permite incorporar la configuración sin modificar Prisma.
export async function validateOvertimePaymentPolicy(db, payslips) {
  const ids = [...new Set(payslips.map(p => p.employee_id).filter(Boolean))].sort();
  if (!ids.length) return;
  const employees = await db.$queryRawUnsafe(
    `SELECT id, overtime_payment_mode FROM employee
      WHERE id = ANY($1::varchar[]) ORDER BY id FOR SHARE`, ids
  );
  const compensationOnly = new Set(employees
    .filter(employee => employee.overtime_payment_mode === 'compensation_only')
    .map(employee => employee.id));
  const invalid = payslips.find(p => compensationOnly.has(p.employee_id) && hasOvertimeIncome(p));
  if (invalid) {
    throw Object.assign(new Error(
      `El empleado ${invalid.employee_id} tiene horas extras solo para compensación. Recalcule la boleta sin pago de HE antes de guardarla o aprobarla.`
    ), { status: 409, code: 'OVERTIME_COMPENSATION_ONLY' });
  }
}
