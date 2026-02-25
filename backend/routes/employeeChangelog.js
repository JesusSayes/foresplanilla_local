import express from 'express';
import pool from '../config/database.js';
import { authenticateToken } from '../middleware/auth.js';
import crypto from 'crypto';

const router = express.Router();

router.use(authenticateToken);

router.get('/', async (req, res) => {
  try {
    const { sort = '-created_date' } = req.query;
    const orderBy = sort.startsWith('-') ? `${sort.substring(1)} DESC` : `${sort} ASC`;

    const result = await pool.query(
      `SELECT * FROM employee_change_log ORDER BY ${orderBy}`
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching changelog:', error);
    res.status(500).json({ error: error.message });
  }
});

router.post('/filter', async (req, res) => {
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

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const query = `SELECT * FROM employee_change_log ${whereClause} ORDER BY ${orderBy}`;

    const result = await pool.query(query, values);
    res.json(result.rows);
  } catch (error) {
    console.error('Error filtering changelog:', error);
    res.status(500).json({ error: error.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      'SELECT * FROM employee_change_log WHERE id = $1',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Change log not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error fetching changelog:', error);
    res.status(500).json({ error: error.message });
  }
});

router.post('/', async (req, res) => {
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

router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

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

router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
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
