import { query } from '../config/database.js';
import { canAccessEmployee, hasPermission } from '../middleware/authorization.js';
import { generate24HexId } from '../utils/idGenerator.js';

const TABLE = 'afp_change_history';
const FIELDS = [
  'employee_id',
  'change_date',
  'previous_pension_system',
  'new_pension_system',
  'previous_afp_id',
  'previous_afp_name',
  'new_afp_id',
  'new_afp_name',
  'previous_commission_type',
  'new_commission_type',
  'previous_cuspp',
  'new_cuspp',
  'change_type',
  'change_reason',
  'changed_by',
  'notes',
];
const SORT_FIELDS = new Set([...FIELDS, 'id', 'created_date', 'updated_date', 'created_by']);

const cleanData = (data = {}) => Object.fromEntries(
  FIELDS
    .filter(field => Object.prototype.hasOwnProperty.call(data, field))
    .map(field => [field, data[field] === '' ? null : data[field]])
);

const orderBy = (sort = '-change_date') => {
  const descending = sort.startsWith('-');
  const requested = descending ? sort.slice(1) : sort;
  const field = SORT_FIELDS.has(requested) ? requested : 'change_date';
  return `${field} ${descending ? 'DESC' : 'ASC'}`;
};

const appendEmployeeScope = (req, conditions, params) => {
  if (req.accessibleEmployeeIds === null) return;
  params.push(req.accessibleEmployeeIds || []);
  conditions.push(`employee_id = ANY($${params.length}::varchar[])`);
};

export const getAll = async (req, res) => {
  try {
    const conditions = [];
    const params = [];
    appendEmployeeScope(req, conditions, params);
    const where = conditions.length ? ` WHERE ${conditions.join(' AND ')}` : '';
    const result = await query(`SELECT * FROM ${TABLE}${where} ORDER BY ${orderBy(req.query.sort)}`, params);
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
    appendEmployeeScope(req, conditions, params);
    const where = conditions.length ? ` WHERE ${conditions.join(' AND ')}` : '';
    const result = await query(`SELECT * FROM ${TABLE}${where} ORDER BY ${orderBy(req.query.sort)}`, params);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const getById = async (req, res) => {
  try {
    const result = await query(`SELECT * FROM ${TABLE} WHERE id = $1`, [req.params.id]);
    const row = result.rows[0];
    if (!row) return res.status(404).json({ error: 'Historial AFP no encontrado' });
    if (!canAccessEmployee(req, row.employee_id)) return res.status(403).json({ error: 'Acceso denegado al empleado' });
    res.json(row);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const create = async (req, res) => {
  try {
    const data = cleanData(req.body);
    if (!data.employee_id || !data.change_date || !data.change_type) {
      return res.status(400).json({ error: 'employee_id, change_date y change_type son obligatorios' });
    }
    if (!canAccessEmployee(req, data.employee_id)) return res.status(403).json({ error: 'Acceso denegado al empleado' });

    const fields = Object.keys(data);
    const values = Object.values(data);
    const placeholders = fields.map((_, index) => `$${index + 1}`).join(', ');
    const result = await query(
      `INSERT INTO ${TABLE} (${fields.join(', ')}, id, created_date, updated_date, created_by)
       VALUES (${placeholders}, $${fields.length + 1}, $${fields.length + 2}, $${fields.length + 3}, $${fields.length + 4})
       RETURNING *`,
      [...values, generate24HexId(), new Date(), new Date(), req.user?.email || 'system']
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const update = async (req, res) => {
  try {
    const current = await query(`SELECT * FROM ${TABLE} WHERE id = $1`, [req.params.id]);
    if (!current.rows[0]) return res.status(404).json({ error: 'Historial AFP no encontrado' });
    if (!canAccessEmployee(req, current.rows[0].employee_id)) return res.status(403).json({ error: 'Acceso denegado al empleado' });

    const data = cleanData(req.body);
    delete data.employee_id;
    const fields = Object.keys(data);
    if (fields.length === 0) return res.status(400).json({ error: 'No hay campos para actualizar' });
    const setClause = fields.map((field, index) => `${field} = $${index + 1}`).join(', ');
    const result = await query(
      `UPDATE ${TABLE} SET ${setClause}, updated_date = $${fields.length + 1} WHERE id = $${fields.length + 2} RETURNING *`,
      [...Object.values(data), new Date(), req.params.id]
    );
    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const remove = async (req, res) => {
  try {
    const current = await query(`SELECT * FROM ${TABLE} WHERE id = $1`, [req.params.id]);
    if (!current.rows[0]) return res.status(404).json({ error: 'Historial AFP no encontrado' });
    if (!canAccessEmployee(req, current.rows[0].employee_id) || !hasPermission(req.access, 'employees.delete')) {
      return res.status(403).json({ error: 'Permiso insuficiente' });
    }
    await query(`DELETE FROM ${TABLE} WHERE id = $1`, [req.params.id]);
    res.status(204).send();
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export default { getAll, filter, getById, create, update, delete: remove };
