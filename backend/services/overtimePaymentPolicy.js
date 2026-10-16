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

// Validar por jornada; la antigua configuración del empleado ya no decide el pago.
export async function validateOvertimePaymentPolicy(db, payslips) {
  for (const payslip of payslips) {
    if (!hasOvertimeIncome(payslip)) continue;
    const year = Number(payslip.year), month = Number(payslip.month);
    const date = value => value instanceof Date ? value.toISOString().slice(0, 10) : String(value || '').slice(0, 10);
    const from = date(payslip.attendance_period_start) || `${year}-${String(month).padStart(2, '0')}-01`;
    const to = date(payslip.attendance_period_end) || `${year}-${String(month).padStart(2, '0')}-${new Date(year, month, 0).getDate()}`;
    if (!payslip.employee_id || !Number.isInteger(year) || year < 1900 || !Number.isInteger(month) || month < 1 || month > 12 || !/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
      throw Object.assign(new Error('La boleta con HE requiere empleado y período válidos'), { status: 400 });
    }
    const records = await db.$queryRawUnsafe(
      `SELECT overtime_hours_25, overtime_hours_35 FROM attendance_record
        WHERE employee_id = $1 AND date BETWEEN $2::date AND $3::date
          AND COALESCE(overtime_destination, 'pago') = 'pago' AND overtime_authorized = true
          AND COALESCE(status, '') <> 'Vacaciones' FOR SHARE`, payslip.employee_id, from, to);
    const manual = await db.$queryRawUnsafe(
      `SELECT m.overtime_hours_25, m.overtime_minutes_25, m.overtime_hours_35, m.overtime_minutes_35
         FROM horasextrasmanual m
        WHERE m.employee_id = $1 AND m.month = $2 AND m.year = $3 AND m.payroll_type = $4
          AND m.status = 'Activo' AND COALESCE(m.overtime_destination, 'pago') = 'pago'
          AND (m.attendance_record_id IS NULL OR EXISTS (
            SELECT 1 FROM attendance_record a WHERE a.id = m.attendance_record_id
              AND a.employee_id = m.employee_id AND COALESCE(a.overtime_destination, 'pago') = 'pago'
              AND a.overtime_authorized = true AND COALESCE(a.status, '') <> 'Vacaciones'))
        FOR SHARE OF m`, payslip.employee_id, month, year, payslip.payroll_type || 'Mensual');
    const allowed = rate => [...records, ...manual].reduce((sum, r) => sum + Number(r[`overtime_hours_${rate}`] || 0) + Number(r[`overtime_minutes_${rate}`] || 0) / 60, 0);
    const h25 = allowed(25), h35 = allowed(35);
    if (Number(payslip.overtime_hours_25 || 0) > h25 + 0.011 ||
        Number(payslip.overtime_hours_35 || 0) > h35 + 0.011 ||
        Number(payslip.overtime_hours || 0) > h25 + h35 + 0.011 || h25 + h35 === 0) {
      throw Object.assign(new Error('Las HE de la boleta exceden las jornadas autorizadas para pago; excluya las destinadas solo para compensación y recalcule.'), { status: 409, code: 'OVERTIME_COMPENSATION_ONLY' });
    }
  }
}
