import express from 'express';
import pool from '../config/database.js';
import { authenticateToken } from '../middleware/auth.js';
import {
  attachEmployeeScope,
  canAccessEmployee,
  loadAccessContext,
  requireAnyPermission,
} from '../middleware/authorization.js';
import { generate24HexId } from '../utils/idGenerator.js';

const router = express.Router();

router.use(authenticateToken, loadAccessContext);

const VIEW_PERMISSIONS = ['system.admin', 'contracts.view'];
const CREATE_PERMISSIONS = ['system.admin', 'contracts.create'];
const UPDATE_PERMISSIONS = ['system.admin', 'contracts.edit'];
const DELETE_PERMISSIONS = ['system.admin', 'contracts.delete'];

router.get('/', requireAnyPermission(...VIEW_PERMISSIONS), attachEmployeeScope(...VIEW_PERMISSIONS), async (req, res) => {
  try {
    const { sort = '-created_date' } = req.query;
    const orderBy = sort.startsWith('-') ? `${sort.substring(1)} DESC` : `${sort} ASC`;

    const result = await pool.query(
      req.accessibleEmployeeIds === null
        ? `SELECT * FROM contract ORDER BY ${orderBy}`
        : `SELECT * FROM contract WHERE employee_id = ANY($1::varchar[]) ORDER BY ${orderBy}`,
      req.accessibleEmployeeIds === null ? [] : [req.accessibleEmployeeIds]
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching contracts:', error);
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
      values.push(req.accessibleEmployeeIds);
      paramCount++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const query = `SELECT * FROM contract ${whereClause} ORDER BY ${orderBy}`;

    const result = await pool.query(query, values);
    res.json(result.rows);
  } catch (error) {
    console.error('Error filtering contracts:', error);
    res.status(500).json({ error: error.message });
  }
});

router.get('/:id', requireAnyPermission(...VIEW_PERMISSIONS), attachEmployeeScope(...VIEW_PERMISSIONS), async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      'SELECT * FROM contract WHERE id = $1',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Contract not found' });
    }
    if (!canAccessEmployee(req, result.rows[0].employee_id)) {
      return res.status(403).json({ error: 'Acceso denegado al empleado' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error fetching contract:', error);
    res.status(500).json({ error: error.message });
  }
});

router.post('/', requireAnyPermission(...CREATE_PERMISSIONS), attachEmployeeScope(...CREATE_PERMISSIONS), async (req, res) => {
  try {
    const data = req.body;
    if (data.employee_id && !canAccessEmployee(req, data.employee_id)) {
      return res.status(403).json({ error: 'Acceso denegado al empleado' });
    }
    const contractToInsert = {
      id: generate24HexId(),

      ...data,

      end_date: data.end_date || null,
      start_date: data.start_date || null,
      signed_date: data.signed_date || null,

      activity_cost: data.activity_cost ?? 0,
      food_cost: data.food_cost ?? 0,
      transport_cost: data.transport_cost ?? 0,

      renewable: data.renewable ?? false,
      is_sample: data.is_sample ?? false,
      is_digitally_signed: data.is_digitally_signed ?? false,

      created_date: new Date(),
      updated_date: new Date()
    };
    const fields = Object.keys(contractToInsert);
    const values = Object.values(contractToInsert);
    const placeholders = fields.map((_, index) => `$${index + 1}`).join(', ');

    const result = await pool.query(
      `INSERT INTO contract (${fields.join(', ')}) VALUES (${placeholders}) RETURNING *`,
      values
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error creating contract:', error);
    res.status(500).json({ error: error.message });
  }
});

router.put('/:id', requireAnyPermission(...UPDATE_PERMISSIONS), attachEmployeeScope(...UPDATE_PERMISSIONS), async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    const current = await pool.query('SELECT employee_id FROM contract WHERE id = $1', [id]);
    if (current.rows.length === 0) return res.status(404).json({ error: 'Contract not found' });
    if (!canAccessEmployee(req, current.rows[0].employee_id)) {
      return res.status(403).json({ error: 'Acceso denegado al empleado' });
    }
    if (updates.employee_id && !canAccessEmployee(req, updates.employee_id)) {
      return res.status(403).json({ error: 'Acceso denegado al empleado' });
    }

    // evitar que el id sea actualizado
    delete updates.id;

    // agregar fecha de actualización
    updates.updated_date = new Date();

    const fields = Object.keys(updates);
    const values = Object.values(updates);

    if (fields.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    const setClause = fields.map((field, index) => `${field} = $${index + 1}`).join(', ');

    const result = await pool.query(
      `UPDATE contract SET ${setClause} WHERE id = $${fields.length + 1} RETURNING *`,
      [...values, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Contract not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating contract:', error);
    res.status(500).json({ error: error.message });
  }
});

router.delete('/:id', requireAnyPermission(...DELETE_PERMISSIONS), attachEmployeeScope(...DELETE_PERMISSIONS), async (req, res) => {
  try {
    const { id } = req.params;
    const current = await pool.query('SELECT employee_id FROM contract WHERE id = $1', [id]);
    if (current.rows.length === 0) return res.status(404).json({ error: 'Contract not found' });
    if (!canAccessEmployee(req, current.rows[0].employee_id)) {
      return res.status(403).json({ error: 'Acceso denegado al empleado' });
    }
    const result = await pool.query(
      'DELETE FROM contract WHERE id = $1 RETURNING *',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Contract not found' });
    }

    res.json({ message: 'Contract deleted successfully' });
  } catch (error) {
    console.error('Error deleting contract:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
