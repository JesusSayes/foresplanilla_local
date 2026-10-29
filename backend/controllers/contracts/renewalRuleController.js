import pool from '../../config/database.js';
import { generate24HexId } from '../../utils/idGenerator.js';

const arrays = ['contract_types', 'notification_emails'];
const booleans = ['is_active', 'send_notification', 'auto_create_draft', 'only_renewable'];
const integers = ['days_before_expiration', 'draft_extension_months', 'renewal_months'];
const fields = ['name', 'rule_type', ...arrays, ...booleans, ...integers];
const invalid = message => Object.assign(new Error(message), { status: 400 });
export function ruleData(body) {
  const data = {};
  for (const key of fields) {
    if (body[key] === undefined) continue;
    const value = body[key];
    if (value === null && !["name", "rule_type", "renewal_months"].includes(key)) { data[key] = null; continue; }
    if (arrays.includes(key) && (!Array.isArray(value) || value.some(v => typeof v !== 'string'))) throw invalid(`Lista inválida: ${key}`);
    if (booleans.includes(key) && typeof value !== 'boolean') throw invalid(`Estado inválido: ${key}`);
    if (integers.includes(key) && (!Number.isInteger(value) || value < (key === 'days_before_expiration' ? 0 : 1))) throw invalid(`Cantidad inválida: ${key}`);
    if (key === 'renewal_months' && value > 120) throw invalid('La duración máxima es 120 meses');
    if (key === 'rule_type' && !['expiration', 'below_rmv'].includes(value)) throw invalid('Tipo de regla inválido');
    if (key === 'name' && (typeof value !== 'string' || !value.trim())) throw invalid('Nombre obligatorio');
    data[key] = arrays.includes(key) ? JSON.stringify(value) : value;
  }
  if (!Object.keys(data).length) throw invalid('No hay campos para guardar');
  return data;
}
const handler = action => async (req, res) => {
  try { await action(req, res); }
  catch (error) {
    res.status(error.status || 500).json({ error: error.status ? error.message : 'No se pudo guardar o consultar la regla. Verifique la actualización SQL de RMV.' });
  }
};
export const list = handler(async (req, res) => {
  res.json((await pool.query('SELECT * FROM contract_renewal_rule ORDER BY created_date DESC')).rows);
});
export const create = handler(async (req, res) => {
  const data = ruleData(req.body);
  if (!data.name) throw invalid('Nombre obligatorio');
  Object.assign(data, { id: generate24HexId(), created_by_id: req.user?.userId || req.user?.id, created_by: req.user?.email, created_date: new Date(), updated_date: new Date() });
  const keys = Object.keys(data);
  const result = await pool.query(`INSERT INTO contract_renewal_rule (${keys.map(k => `"${k}"`).join(', ')}) VALUES (${keys.map((_, i) => `$${i + 1}`).join(', ')}) RETURNING *`, Object.values(data));
  res.status(201).json(result.rows[0]);
});
export const update = handler(async (req, res) => {
  const data = { ...ruleData(req.body), updated_date: new Date() };
  const keys = Object.keys(data);
  const result = await pool.query(`UPDATE contract_renewal_rule SET ${keys.map((k, i) => `"${k}" = $${i + 1}`).join(', ')} WHERE id = $${keys.length + 1} RETURNING *`, [...Object.values(data), req.params.id]);
  if (!result.rows.length) return res.status(404).json({ error: 'Regla no encontrada' });
  res.json(result.rows[0]);
});
export const remove = handler(async (req, res) => {
  const result = await pool.query('DELETE FROM contract_renewal_rule WHERE id = $1 RETURNING id', [req.params.id]);
  if (!result.rows.length) return res.status(404).json({ error: 'Regla no encontrada' });
  res.json({ message: 'Regla eliminada correctamente' });
});
