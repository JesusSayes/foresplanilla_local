import { query } from '../config/database.js';
import { generate24HexId } from '../utils/idGenerator.js';
import { buildFilterQuery, buildSortQuery } from '../utils/queryBuilder.js';

const TABLE = 'historial_remunerativo';
const WRITABLE_FIELDS = [
  'employee_id',
  'year',
  'month',
  'period_label',
  'base_salary',
  'family_allowance',
  'other_regular_income',
  'total_remuneration',
  'worked_days',
  'source',
  'notes',
];

const cleanData = (data = {}) => {
  const cleaned = {};
  for (const field of WRITABLE_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(data, field)) {
      cleaned[field] = data[field] === '' ? null : data[field];
    }
  }
  return cleaned;
};

export const getAll = async (req, res) => {
  try {
    const { sort = '-year' } = req.query;
    const sql = buildSortQuery(`SELECT * FROM ${TABLE}`, sort);
    const result = await query(sql);
    res.json(result.rows);
  } catch (error) {
    console.error('Error listing historial remunerativo:', error);
    res.status(500).json({ error: error.message });
  }
};

export const filter = async (req, res) => {
  try {
    const { sort = '-year' } = req.query;
    const { query: sql, params } = buildFilterQuery(`SELECT * FROM ${TABLE}`, req.body || {});
    const result = await query(buildSortQuery(sql, sort), params);
    res.json(result.rows);
  } catch (error) {
    console.error('Error filtering historial remunerativo:', error);
    res.status(500).json({ error: error.message });
  }
};

export const getById = async (req, res) => {
  try {
    const result = await query(`SELECT * FROM ${TABLE} WHERE id = $1`, [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Registro no encontrado' });
    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const create = async (req, res) => {
  try {
    const data = cleanData(req.body);
    const id = generate24HexId();
    const fields = Object.keys(data);
    const values = Object.values(data);
    const placeholders = fields.map((_, index) => `$${index + 1}`).join(', ');

    const result = await query(
      `INSERT INTO ${TABLE} (${fields.join(', ')}, id, created_date, updated_date, created_by_id, created_by)
       VALUES (${placeholders}, $${fields.length + 1}, $${fields.length + 2}, $${fields.length + 3}, $${fields.length + 4}, $${fields.length + 5})
       RETURNING *`,
      [...values, id, new Date(), new Date(), req.user?.id || null, req.user?.email || null]
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error creating historial remunerativo:', error);
    res.status(500).json({ error: error.message });
  }
};

export const bulkCreate = async (req, res) => {
  try {
    const rows = Array.isArray(req.body) ? req.body : [];
    if (rows.length === 0) return res.status(400).json({ error: 'No hay registros para insertar' });

    const created = [];
    for (const raw of rows) {
      const data = cleanData(raw);
      const fields = Object.keys(data);
      const values = Object.values(data);
      const placeholders = fields.map((_, index) => `$${index + 1}`).join(', ');
      const result = await query(
        `INSERT INTO ${TABLE} (${fields.join(', ')}, id, created_date, updated_date, created_by_id, created_by)
         VALUES (${placeholders}, $${fields.length + 1}, $${fields.length + 2}, $${fields.length + 3}, $${fields.length + 4}, $${fields.length + 5})
         ON CONFLICT (employee_id, year, month) DO UPDATE SET
           period_label = EXCLUDED.period_label,
           base_salary = EXCLUDED.base_salary,
           family_allowance = EXCLUDED.family_allowance,
           other_regular_income = EXCLUDED.other_regular_income,
           total_remuneration = EXCLUDED.total_remuneration,
           worked_days = EXCLUDED.worked_days,
           source = EXCLUDED.source,
           notes = EXCLUDED.notes,
           updated_date = EXCLUDED.updated_date
         RETURNING *`,
        [...values, generate24HexId(), new Date(), new Date(), req.user?.id || null, req.user?.email || null]
      );
      created.push(result.rows[0]);
    }

    res.json(created);
  } catch (error) {
    console.error('Error bulk creating historial remunerativo:', error);
    res.status(500).json({ error: error.message });
  }
};

export const update = async (req, res) => {
  try {
    const data = cleanData(req.body);
    const fields = Object.keys(data);
    if (fields.length === 0) return res.status(400).json({ error: 'No hay campos para actualizar' });

    const setClause = fields.map((field, index) => `${field} = $${index + 1}`).join(', ');
    const result = await query(
      `UPDATE ${TABLE}
       SET ${setClause}, updated_date = $${fields.length + 1}
       WHERE id = $${fields.length + 2}
       RETURNING *`,
      [...Object.values(data), new Date(), req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Registro no encontrado' });
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating historial remunerativo:', error);
    res.status(500).json({ error: error.message });
  }
};

export const remove = async (req, res) => {
  try {
    const result = await query(`DELETE FROM ${TABLE} WHERE id = $1 RETURNING id`, [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Registro no encontrado' });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export default { getAll, filter, getById, create, bulkCreate, update, delete: remove };
