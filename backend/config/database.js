import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

pool.on('connect', (client) => {
  client.query('SET search_path TO public');
  console.log('OK: Conectado a PostgreSQL: foresplanilla_local');
});

pool.on('error', (err) => {
  console.error('ERR: Error en conexión PostgreSQL:', err);
  process.exit(-1);
});

export const query = async (text, params) => {
  const start = Date.now();
  try {
    const res = await pool.query(text, params);
    const duration = Date.now() - start;
    console.log('Executed query', { text: text.substring(0, 100), params: params, duration, rows: res.rowCount });
    return res;
  } catch (error) {
    console.error('Query error:', error);
    throw error;
  }
};

export default pool;
