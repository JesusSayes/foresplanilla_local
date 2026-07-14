import { query } from '../config/database.js';
import { generate24HexId } from '../utils/idGenerator.js';

const TABLE = 'notification_recipient';
const FIELDS = ['email', 'recipient_name', 'notification_type', 'is_active', 'added_by', 'notes'];
const TYPES = new Set([
  'contract_expiring',
  'incident_pending',
  'vacation_pending',
  'payslip_ready',
  'attendance_alert',
  'system',
]);

const cleanData = (data = {}) => Object.fromEntries(
  FIELDS
    .filter(field => Object.prototype.hasOwnProperty.call(data, field))
    .map(field => [field, typeof data[field] === 'string' ? data[field].trim() : data[field]])
);

const validate = data => {
  if (data.email !== undefined && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) return 'Correo electrónico inválido';
  if (data.notification_type !== undefined && !TYPES.has(data.notification_type)) return 'Tipo de notificación inválido';
  return null;
};

export const getAll = async (req, res) => {
  try {
    const result = await query(`SELECT * FROM ${TABLE} ORDER BY created_date DESC`);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const filter = async (req, res) => {
  try {
    const conditions = [];
    const params = [];
    Object.entries(req.body || {}).forEach(([field, value]) => {
      if ((FIELDS.includes(field) || field === 'id') && value !== undefined && value !== null && value !== '') {
        params.push(value);
        conditions.push(`${field} = $${params.length}`);
      }
    });
    const where = conditions.length ? ` WHERE ${conditions.join(' AND ')}` : '';
    const result = await query(`SELECT * FROM ${TABLE}${where} ORDER BY created_date DESC`, params);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const getById = async (req, res) => {
  try {
    const result = await query(`SELECT * FROM ${TABLE} WHERE id = $1`, [req.params.id]);
    if (!result.rows[0]) return res.status(404).json({ error: 'Destinatario no encontrado' });
    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const create = async (req, res) => {
  try {
    const data = cleanData(req.body);
    data.email = data.email?.toLowerCase();
    data.notification_type ||= 'contract_expiring';
    data.is_active ??= true;
    data.added_by = req.user?.email || data.added_by || 'system';
    const validationError = validate(data);
    if (!data.email) return res.status(400).json({ error: 'El correo es obligatorio' });
    if (validationError) return res.status(400).json({ error: validationError });

    const duplicate = await query(
      `SELECT id FROM ${TABLE} WHERE LOWER(email) = LOWER($1) AND notification_type = $2 LIMIT 1`,
      [data.email, data.notification_type]
    );
    if (duplicate.rows.length > 0) return res.status(409).json({ error: 'El destinatario ya está registrado' });

    const fields = Object.keys(data);
    const placeholders = fields.map((_, index) => `$${index + 1}`).join(', ');
    const result = await query(
      `INSERT INTO ${TABLE} (${fields.join(', ')}, id, created_date, updated_date, created_by)
       VALUES (${placeholders}, $${fields.length + 1}, $${fields.length + 2}, $${fields.length + 3}, $${fields.length + 4})
       RETURNING *`,
      [...Object.values(data), generate24HexId(), new Date(), new Date(), req.user?.email || 'system']
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const update = async (req, res) => {
  try {
    const data = cleanData(req.body);
    if (data.email) data.email = data.email.toLowerCase();
    const validationError = validate(data);
    if (validationError) return res.status(400).json({ error: validationError });
    const fields = Object.keys(data);
    if (fields.length === 0) return res.status(400).json({ error: 'No hay campos para actualizar' });

    const setClause = fields.map((field, index) => `${field} = $${index + 1}`).join(', ');
    const result = await query(
      `UPDATE ${TABLE} SET ${setClause}, updated_date = $${fields.length + 1} WHERE id = $${fields.length + 2} RETURNING *`,
      [...Object.values(data), new Date(), req.params.id]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Destinatario no encontrado' });
    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const remove = async (req, res) => {
  try {
    const result = await query(`DELETE FROM ${TABLE} WHERE id = $1 RETURNING id`, [req.params.id]);
    if (!result.rows[0]) return res.status(404).json({ error: 'Destinatario no encontrado' });
    res.status(204).send();
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export default { getAll, filter, getById, create, update, delete: remove };
