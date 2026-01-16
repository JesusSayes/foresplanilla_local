import express from 'express';
import pool from '../config/database.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

router.use(authenticateToken);

router.get('/', async (req, res) => {
  try {
    const { sort = '-created_date' } = req.query;
    const orderBy = sort.startsWith('-') ? `${sort.substring(1)} DESC` : `${sort} ASC`;
    
    const result = await pool.query(
      `SELECT * FROM contract ORDER BY ${orderBy}`
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching contracts:', error);
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
    const query = `SELECT * FROM contract ${whereClause} ORDER BY ${orderBy}`;
    
    const result = await pool.query(query, values);
    res.json(result.rows);
  } catch (error) {
    console.error('Error filtering contracts:', error);
    res.status(500).json({ error: error.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      'SELECT * FROM contract WHERE id = $1',
      [id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Contract not found' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error fetching contract:', error);
    res.status(500).json({ error: error.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const data = req.body;
    const fields = Object.keys(data);
    const values = Object.values(data);
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

router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    
    const fields = Object.keys(updates);
    const values = Object.values(updates);
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

router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
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
