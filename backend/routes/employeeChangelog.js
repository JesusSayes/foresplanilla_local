import express from 'express';
import pool from '../config/database.js';
import { authenticateToken } from '../middleware/auth.js';
import {
  attachEmployeeScope,
  canAccessEmployee,
  loadAccessContext,
  requireAnyPermission,
} from '../middleware/authorization.js';
import crypto from 'crypto';

const router = express.Router();

router.use(authenticateToken, loadAccessContext);

const VIEW_PERMISSIONS = ['system.admin', 'employees.view'];
const CREATE_PERMISSIONS = ['system.admin', 'employees.edit'];
const UPDATE_PERMISSIONS = ['system.admin', 'employees.edit'];
const DELETE_PERMISSIONS = ['system.admin', 'employees.delete'];

router.get('/', requireAnyPermission(...VIEW_PERMISSIONS), attachEmployeeScope(...VIEW_PERMISSIONS), async (req, res) => {
  try {
    const { sort = '-created_date' } = req.query;
    const orderBy = sort.startsWith('-') ? `${sort.substring(1)} DESC` : `${sort} ASC`;
    const values = [];
    const whereClause = req.accessibleEmployeeIds === null
      ? ''
      : 'WHERE employee_id = ANY($1::varchar[])';
    if (req.accessibleEmployeeIds !== null) values.push(req.accessibleEmployeeIds || []);

    const result = await pool.query(
      `SELECT * FROM employee_change_log ${whereClause} ORDER BY ${orderBy}`,
      values
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching changelog:', error);
    res.status(500).json({ error: error.message });
  }
});

router.post('/filter', requireAnyPermission(...VIEW_PERMISSIONS), attachEmployeeScope(...VIEW_PERMISSIONS), async (req, res) => {
  try {
    const filters = req.body;
    const { sort = '-created_date' } = req.query;
    const orderBy = sort.startsWith('-') ? `${sort.substring(1)} DESC` : `${sort} ASC`;

    const conditions = [];
    const values = [];
    let paramCount = 1;

    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        conditions.push(`${key} = $${paramCount}`);
        values.push(value);
        paramCount++;
      }
    });

    if (req.accessibleEmployeeIds !== null) {
      conditions.push(`employee_id = ANY($${paramCount}::varchar[])`);
      values.push(req.accessibleEmployeeIds || []);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const query = `SELECT * FROM employee_change_log ${whereClause} ORDER BY ${orderBy}`;

    const result = await pool.query(query, values);
    res.json(result.rows);
  } catch (error) {
    console.error('Error filtering changelog:', error);
    res.status(500).json({ error: error.message });
  }
});

router.get('/:id', requireAnyPermission(...VIEW_PERMISSIONS), attachEmployeeScope(...VIEW_PERMISSIONS), async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      'SELECT * FROM employee_change_log WHERE id = $1',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Change log not found' });
    }
    if (!canAccessEmployee(req, result.rows[0].employee_id)) {
      return res.status(403).json({ error: 'Acceso denegado al empleado' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error fetching changelog:', error);
    res.status(500).json({ error: error.message });
  }
});

router.post('/', requireAnyPermission(...CREATE_PERMISSIONS), attachEmployeeScope(...CREATE_PERMISSIONS), async (req, res) => {
  const {
    employee_id,
    field_changed,
    old_value,
    new_value,
    change_type,
    changed_by,
    change_date,
    notes
  } = req.body;

  const id = crypto.randomBytes(12).toString('hex');

  try {
    if (!canAccessEmployee(req, employee_id)) {
      return res.status(403).json({ error: 'Acceso denegado al empleado' });
    }

    const result = await pool.query(
      `INSERT INTO employee_change_log
       (id, employee_id, field_changed, old_value, new_value, change_type, changed_by, change_date, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [id, employee_id, field_changed, old_value || '', new_value || '', change_type, changed_by, change_date, notes || null]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error creating changelog:', error);

    if (error.code === '23502' && error.column === 'id') {
      try {
        const result = await pool.query(
          `INSERT INTO employee_change_log
           (id, employee_id, field_changed, old_value, new_value, change_type, changed_by, change_date, notes)
           VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8)
           RETURNING *`,
          [employee_id, field_changed, old_value || '', new_value || '', change_type, changed_by, change_date, notes || null]
        );
        return res.status(201).json(result.rows[0]);
      } catch (retryError) {
        console.error('Error on retry:', retryError);
        return res.status(500).json({ error: retryError.message });
      }
    }

    res.status(500).json({ error: error.message });
  }
});

router.put('/:id', requireAnyPermission(...UPDATE_PERMISSIONS), attachEmployeeScope(...UPDATE_PERMISSIONS), async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    const current = await pool.query('SELECT employee_id FROM employee_change_log WHERE id = $1', [id]);
    if (current.rows.length === 0) {
      return res.status(404).json({ error: 'Change log not found' });
    }
    if (!canAccessEmployee(req, current.rows[0].employee_id) ||
        (updates.employee_id && !canAccessEmployee(req, updates.employee_id))) {
      return res.status(403).json({ error: 'Acceso denegado al empleado' });
    }

    const fields = Object.keys(updates);
    const values = Object.values(updates);
    const setClause = fields.map((field, index) => `${field} = $${index + 1}`).join(', ');

    const result = await pool.query(
      `UPDATE employee_change_log SET ${setClause} WHERE id = $${fields.length + 1} RETURNING *`,
      [...values, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Change log not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating changelog:', error);
    res.status(500).json({ error: error.message });
  }
});

router.delete('/:id', requireAnyPermission(...DELETE_PERMISSIONS), attachEmployeeScope(...DELETE_PERMISSIONS), async (req, res) => {
  try {
    const { id } = req.params;
    const current = await pool.query('SELECT employee_id FROM employee_change_log WHERE id = $1', [id]);
    if (current.rows.length === 0) {
      return res.status(404).json({ error: 'Change log not found' });
    }
    if (!canAccessEmployee(req, current.rows[0].employee_id)) {
      return res.status(403).json({ error: 'Acceso denegado al empleado' });
    }

    const result = await pool.query(
      'DELETE FROM employee_change_log WHERE id = $1 RETURNING *',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Change log not found' });
    }

    res.json({ message: 'Change log deleted successfully' });
  } catch (error) {
    console.error('Error deleting changelog:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
