import { generate24HexId } from '../utils/idGenerator.js';

const fail = (message, status = 409) => Object.assign(new Error(message), { status });
const iso = value => value instanceof Date ? value.toISOString().slice(0, 10) : String(value || '').slice(0, 10);
const dayAfter = value => new Date(Date.parse(`${value}T00:00:00Z`) + 86400000).toISOString().slice(0, 10);
const dayBefore = value => new Date(Date.parse(`${value}T00:00:00Z`) - 86400000).toISOString().slice(0, 10);
export function renewalDates(contract, today, months, effectiveDate) {
  if (!Number.isInteger(months) || months < 1 || months > 120) throw fail('La duración debe estar entre 1 y 120 meses', 400);
  const start = iso(contract.start_date), end = iso(contract.end_date);
  if (!start || start > today) throw fail('El contrato todavía no ha iniciado');
  const indefinite = contract.contract_type === 'Indeterminado';
  if (!indefinite && !end) throw fail('El contrato a plazo fijo no tiene vencimiento');
  const startDate = [today, effectiveDate, indefinite ? today : dayAfter(end)].sort().at(-1);
  if (indefinite && startDate <= start) throw fail('Revise manualmente el contrato que inicia en la fecha del ajuste');
  if (indefinite) return { start_date: startDate, end_date: null, previous_end_date: end && end < startDate ? end : dayBefore(startDate) };
  const date = new Date(`${startDate}T00:00:00Z`);
  const target = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1));
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(date.getUTCDate(), last));
  return { start_date: startDate, end_date: iso(target), previous_end_date: end };
}

// El llamador abre la transacción y sincroniza el sueldo según el contrato efectivo.
export async function renewWithRmv(client, { contractId, body, user, canAccess }) {
  const { rows: contracts } = await client.query('SELECT * FROM contract WHERE id = $1 FOR UPDATE', [contractId]);
  const contract = contracts[0];
  if (!contract) throw fail('Contrato no encontrado', 404);
  if (!canAccess(contract.employee_id)) throw fail('Acceso denegado al empleado', 403);
  if (contract.status !== 'Vigente') throw fail('El contrato ya fue renovado o dejó de estar vigente. Actualice la lista.');
  if (!['Indeterminado', 'Plazo Fijo'].includes(contract.contract_type)) throw fail('Tipo de contrato no compatible');
  const { rows: employees } = await client.query('SELECT * FROM employee WHERE id = $1 FOR UPDATE', [contract.employee_id]);
  const employee = employees[0];
  const { rows: dates } = await client.query("SELECT to_char((NOW() AT TIME ZONE 'America/Lima')::date, 'YYYY-MM-DD') AS today");
  const today = dates[0].today;
  if (!employee || employee.status === 'Cesado' || (employee.termination_date && iso(employee.termination_date) <= today)) throw fail('El trabajador está cesado o no existe');
  const { rows: rmvs } = await client.query('SELECT * FROM rmv WHERE is_active = TRUE AND amount > 0 ORDER BY effective_date DESC NULLS LAST, id DESC LIMIT 1 FOR SHARE');
  const rmv = rmvs[0];
  if (!rmv || !rmv.effective_date || iso(rmv.effective_date) > today) throw fail('No existe una RMV activa aplicable hoy');
  if (body.rmv_id !== rmv.id || Number(body.rmv_amount) !== Number(rmv.amount)) throw fail('La RMV cambió. Actualice la vista previa.');
  const salary = Number(employee.base_salary);
  if (employee.base_salary == null || !Number.isFinite(salary) || salary >= Number(rmv.amount) || Number(contract.salary) >= Number(rmv.amount)) throw fail('La remuneración ya alcanza la RMV o no está registrada');
  if (Number(body.base_salary) !== salary) throw fail('El sueldo cambió. Actualice la vista previa.');
  let months = 12;
  if (body.rule_id) {
    const { rows } = await client.query('SELECT * FROM contract_renewal_rule WHERE id = $1 FOR SHARE', [body.rule_id]);
    const rule = rows[0];
    if (!rule || !rule.is_active || rule.rule_type !== 'below_rmv') throw fail('La regla RMV no está activa');
    if (rule.contract_types?.length && !rule.contract_types.includes(contract.contract_type)) throw fail('La regla no aplica al tipo de contrato');
    months = rule.renewal_months;
  }
  const datesForContract = renewalDates(contract, today, months, iso(rmv.effective_date));
  const { rows: overlapping } = await client.query(
    `SELECT id FROM contract WHERE employee_id = $1 AND id <> $2
      AND status IN ('Vigente', 'Renovado')
      AND (end_date IS NULL OR end_date >= $3::date)
      AND ($4::date IS NULL OR start_date <= $4::date)`,
    [employee.id, contract.id, datesForContract.start_date, datesForContract.end_date]
  );
  if (overlapping.length) throw fail('Existe otro contrato que se superpone con la renovación');
  const data = {};
  for (const key of ['employee_id', 'contract_type', 'template_id', 'position', 'department', 'work_location', 'work_schedule', 'weekly_hours', 'functions', 'benefits', 'renewable', 'activity_cost', 'food_cost', 'transport_cost', 'area_trabajo', 'unidad_trabajo']) data[key] = contract[key] ?? null;
  Object.assign(data, {
    id: generate24HexId(), contract_number: `${contract.contract_number || employee.employee_code || 'CTR'}-REN-${today.replaceAll('-', '')}`,
    start_date: datesForContract.start_date, end_date: datesForContract.end_date,
    salary: Number(rmv.amount), trial_period_days: 0, status: 'Vigente',
    signed_date: null, is_digitally_signed: false,
    created_date: new Date(), updated_date: new Date(),
    created_by_id: user?.userId || user?.id, created_by: user?.email,
    notes: `[RENOVACIÓN POR RMV ${rmv.id}] Contrato anterior: ${contract.id}. Sueldo ${salary} → ${rmv.amount}. Aprobado por: ${user?.email || user?.id || user?.userId}.`,
  });
  const fields = Object.keys(data);
  const { rows } = await client.query(`INSERT INTO contract (${fields.join(', ')}) VALUES (${fields.map((_, i) => `$${i + 1}`).join(', ')}) RETURNING *`, Object.values(data));
  await client.query("UPDATE contract SET status = 'Renovado', end_date = $2::date, updated_date = NOW() WHERE id = $1", [contract.id, datesForContract.previous_end_date]);
  return { newContract: rows[0], rmvAmount: Number(rmv.amount) };
}
