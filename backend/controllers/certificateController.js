import crypto from 'crypto';
import { query } from '../config/database.js';
import { canAccessEmployee } from '../middleware/authorization.js';

const MUTABLE_FIELDS = new Set([
  'employee_id',
  'certificate_type',
  'issue_date',
  'description',
  'pdf_url',
  'requested_by_employee',
  'status',
]);

const FILTER_FIELDS = new Set([
  'id',
  'employee_id',
  'certificate_type',
  'status',
  'requested_by_employee',
]);

const SORT_FIELDS = new Set(['created_date', 'updated_date', 'issue_date', 'certificate_type', 'status']);

const generateId = () => crypto.randomBytes(12).toString('hex');

const buildOrderBy = (sort = '-created_date') => {
  const desc = sort.startsWith('-');
  const field = sort.replace('-', '');
  return SORT_FIELDS.has(field) ? `${field} ${desc ? 'DESC' : 'ASC'}` : 'created_date DESC';
};

const addEmployeeScope = (conditions, values, req) => {
  if (req.accessibleEmployeeIds !== null) {
    conditions.push(`employee_id = ANY($${values.length + 1}::varchar[])`);
    values.push(req.accessibleEmployeeIds || []);
  }
};

const buildSetClause = (data, values) => {
  const fields = [];
  Object.entries(data).forEach(([key, value]) => {
    if (!MUTABLE_FIELDS.has(key)) return;
    fields.push(`${key} = $${values.length + 1}`);
    values.push(value === '' ? null : value);
  });
  return fields;
};

export const getAll = async (req, res) => {
  try {
    const { sort = '-created_date' } = req.query;
    const conditions = [];
    const values = [];
    addEmployeeScope(conditions, values, req);

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const result = await query(
      `SELECT * FROM certificate ${where} ORDER BY ${buildOrderBy(sort)}`,
      values
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching certificates:', error);
    res.status(500).json({ error: error.message });
  }
};

export const filter = async (req, res) => {
  try {
    const { sort = '-created_date' } = req.query;
    const filters = req.body || {};
    const conditions = [];
    const values = [];

    Object.entries(filters).forEach(([key, value]) => {
      if (!FILTER_FIELDS.has(key) || value === undefined || value === null) return;
      conditions.push(`${key} = $${values.length + 1}`);
      values.push(value);
    });
    addEmployeeScope(conditions, values, req);

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const result = await query(
      `SELECT * FROM certificate ${where} ORDER BY ${buildOrderBy(sort)}`,
      values
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Error filtering certificates:', error);
    res.status(500).json({ error: error.message });
  }
};

export const getById = async (req, res) => {
  try {
    const result = await query('SELECT * FROM certificate WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Certificate not found' });
    if (!canAccessEmployee(req, result.rows[0].employee_id)) {
      return res.status(403).json({ error: 'Acceso denegado al empleado' });
    }
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error fetching certificate:', error);
    res.status(500).json({ error: error.message });
  }
};

export const create = async (req, res) => {
  try {
    const data = req.body || {};
    if (!canAccessEmployee(req, data.employee_id)) {
      return res.status(403).json({ error: 'Acceso denegado al empleado' });
    }

    const now = new Date();
    const result = await query(
      `INSERT INTO certificate
       (id, employee_id, certificate_type, issue_date, description, pdf_url, requested_by_employee, status, created_date, updated_date, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING *`,
      [
        data.id || generateId(),
        data.employee_id,
        data.certificate_type,
        data.issue_date || null,
        data.description || null,
        data.pdf_url || null,
        data.requested_by_employee ?? false,
        data.status || 'Solicitado',
        now,
        now,
        req.user?.email || null,
      ]
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error creating certificate:', error);
    res.status(500).json({ error: error.message });
  }
};

export const update = async (req, res) => {
  try {
    const current = await query('SELECT * FROM certificate WHERE id = $1', [req.params.id]);
    if (current.rows.length === 0) return res.status(404).json({ error: 'Certificate not found' });
    if (!canAccessEmployee(req, current.rows[0].employee_id)) {
      return res.status(403).json({ error: 'Acceso denegado al empleado' });
    }
    if (req.body?.employee_id && !canAccessEmployee(req, req.body.employee_id)) {
      return res.status(403).json({ error: 'Acceso denegado al empleado' });
    }

    const values = [];
    const fields = buildSetClause(req.body || {}, values);
    fields.push(`updated_date = $${values.length + 1}`);
    values.push(new Date());
    values.push(req.params.id);

    const result = await query(
      `UPDATE certificate SET ${fields.join(', ')} WHERE id = $${values.length} RETURNING *`,
      values
    );
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating certificate:', error);
    res.status(500).json({ error: error.message });
  }
};

export const remove = async (req, res) => {
  try {
    const current = await query('SELECT employee_id FROM certificate WHERE id = $1', [req.params.id]);
    if (current.rows.length === 0) return res.status(404).json({ error: 'Certificate not found' });
    if (!canAccessEmployee(req, current.rows[0].employee_id)) {
      return res.status(403).json({ error: 'Acceso denegado al empleado' });
    }

    await query('DELETE FROM certificate WHERE id = $1', [req.params.id]);
    res.status(204).send();
  } catch (error) {
    console.error('Error deleting certificate:', error);
    res.status(500).json({ error: error.message });
  }
};

export default {
  getAll,
  getById,
  create,
  update,
  delete: remove,
  filter,
};
