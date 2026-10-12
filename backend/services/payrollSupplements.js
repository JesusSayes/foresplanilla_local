import { readFileSync } from 'node:fs';

export const schemas = JSON.parse(readFileSync(new URL('../config/payrollSupplementSchemas.json', import.meta.url), 'utf8'));
export const badRequest = message => Object.assign(new Error(message), { status: 400 });

function validateValue(value, spec, field) {
  if (value === null) throw badRequest(`Valor inválido: ${field}`);
  const type = spec.type;
  if ((type === 'string' && typeof value !== 'string') ||
      (type === 'boolean' && typeof value !== 'boolean') ||
      (type === 'number' && (typeof value !== 'number' || !Number.isFinite(value) || value < 0)) ||
      (type === 'integer' && (!Number.isInteger(value) || value < 0)) ||
      (type === 'object' && (typeof value !== 'object' || Array.isArray(value))) ||
      (type === 'array' && !Array.isArray(value))) throw badRequest(`Valor inválido: ${field}`);
  if (spec.enum && !spec.enum.includes(value)) throw badRequest(`Valor inválido: ${field}`);
  if (spec.format && value && !Number.isFinite(Date.parse(value))) throw badRequest(`Fecha inválida: ${field}`);
  if (type === 'array' && spec.items) value.forEach(item => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) throw badRequest(`Valor inválido: ${field}`);
    for (const required of spec.items.required || []) if (item[required] == null) throw badRequest(`Falta ${required}`);
    for (const [key, val] of Object.entries(item)) {
      if (!spec.items.properties[key]) throw badRequest(`Campo inválido: ${key}`);
      validateValue(val, spec.items.properties[key], key);
    }
  });
}

export function validateSupplement(name, body, creating = false) {
  const schema = schemas[name];
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw badRequest('Se requiere un objeto');
  const data = { ...body };
  for (const [field, value] of Object.entries(data)) {
    if (!Object.hasOwn(schema.properties, field)) throw badRequest(`Campo no permitido: ${field}`);
    validateValue(value, schema.properties[field], field);
  }
  if (creating) for (const [field, spec] of Object.entries(schema.properties)) {
    if (data[field] === undefined && 'default' in spec) data[field] = spec.default;
  }
  for (const field of schema.required || []) {
    if ((creating || field in data) && (data[field] == null || data[field] === '')) throw badRequest(`Falta ${field}`);
  }
  for (const field of ['month', 'payment_period_month']) if (field in data && (!Number.isInteger(data[field]) || data[field] < 1 || data[field] > 12)) throw badRequest('Mes inválido');
  for (const field of ['year', 'payment_period_year', 'gratification_year']) if (field in data && (!Number.isInteger(data[field]) || data[field] < 1900 || data[field] > 9999)) throw badRequest('Año inválido');
  for (const field of ['amount', 'days_sold', 'uit_amount']) if (field in data && !(data[field] > 0)) throw badRequest(`${field} debe ser mayor a cero`);
  for (const field of ['overtime_minutes_25', 'overtime_minutes_35']) if (field in data && data[field] >= 60) throw badRequest('Minutos fuera de rango');
  if (name === 'HorasExtrasManual' && creating) {
    if (!data.reason?.trim()) throw badRequest('El motivo es obligatorio');
    if (!['overtime_hours_25', 'overtime_minutes_25', 'overtime_hours_35', 'overtime_minutes_35'].some(field => data[field] > 0)) throw badRequest('Ingrese horas extras');
  }
  if (name === 'QuintaCategoriaConfig' && (creating || 'tax_brackets' in data)) {
    const brackets = data.tax_brackets;
    if (!brackets?.length) throw badRequest('Configure los tramos');
    let previous = 0;
    for (const bracket of brackets) {
      if (bracket.from_uit !== previous || !(bracket.to_uit > bracket.from_uit) || bracket.rate > 100) throw badRequest('Tramos inválidos o discontinuos');
      previous = bracket.to_uit;
    }
  }
  if (name === 'QuintaCategoriaCalculo' && data.calculation_mode === 'manual' && (data.manual_amount == null || !data.manual_reason?.trim())) throw badRequest('El ajuste manual requiere importe y motivo');
  return data;
}

export function serializeSupplement(name, row) {
  if (!row) return row;
  const result = { ...row };
  for (const [field, spec] of Object.entries(schemas[name].properties)) {
    if (result[field] != null && ['number', 'integer'].includes(spec.type)) result[field] = Number(result[field]);
    if (result[field] instanceof Date) result[field] = spec.format === 'date' ? result[field].toISOString().slice(0, 10) : result[field].toISOString();
  }
  return result;
}

// Se conserva el método de proyección recibido de main; los parámetros son configurables.
export function calculateQuinta({ employee_id, year, month, payroll_type = 'Mensual', remuneration, config, prior }) {
  const round = value => Math.round(value * 100) / 100;
  const income = round(remuneration * 12);
  const deduction = round(Number(config.uit_amount) * Number(config.annual_deduction_uit ?? 7));
  const base = Math.max(0, round(income - deduction));
  const bracket_details = config.tax_brackets.map(bracket => {
    const from = bracket.from_uit * Number(config.uit_amount);
    const to = bracket.to_uit * Number(config.uit_amount);
    const taxable = Math.max(0, Math.min(base, to) - from);
    return { ...bracket, from_soles: round(from), to_soles: round(to), taxable_amount: round(taxable), tax_amount: round(taxable * bracket.rate / 100) };
  });
  const tax = round(bracket_details.reduce((sum, bracket) => sum + bracket.tax_amount, 0));
  const retained = round(prior.filter(row => row.month < month).reduce((sum, row) => sum + Number(row.calculation_mode === 'manual' ? row.manual_amount ?? 0 : row.current_month_retention ?? 0), 0));
  const retention = round(Math.max(0, tax - retained) / (13 - month));
  const calculation = { employee_id, year, month, payroll_type, projected_annual_income: income, annual_deduction: deduction, projected_taxable_base: base, projected_annual_tax: tax, prior_retentions: retained, current_month_retention: retention, calculation_mode: 'auto', status: 'Pendiente', config_id: config.id };
  calculation.calculation_detail = { remuneracion_mensual: round(remuneration), ...calculation, uit_amount: Number(config.uit_amount), uit_deduction_count: Number(config.annual_deduction_uit ?? 7), bracket_details, remaining_months: 13 - month, calculation_method: 'auto_projection' };
  return calculation;
}
