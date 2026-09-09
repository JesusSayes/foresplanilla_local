import pool from '../config/database.js';
import { hasPermission } from '../middleware/authorization.js';
import { generate24HexId } from '../utils/idGenerator.js';

const TABLE = 'public.reportconfiguration';
const FIELDS = [
  'report_name', 'report_type', 'description', 'filters', 'columns',
  'sort_by', 'sort_order', 'is_shared', 'is_favorite',
];
const REPORT_TYPES = ['employees', 'attendance', 'vacations', 'payroll', 'contracts'];
const SORT_FIELDS = ['id', 'created_date', 'updated_date', 'report_name', 'report_type'];
const FILTER_FIELDS = ['id', 'report_name', 'report_type', 'is_shared', 'is_favorite'];

const badRequest = message => Object.assign(new Error(message), { status: 400 });
const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);

const validateData = (body, creating = false) => {
  if (!isObject(body)) throw badRequest('Se requiere un objeto de configuración');
  if (Object.keys(body).some(field => !FIELDS.includes(field))) {
    throw badRequest('La configuración contiene campos no permitidos');
  }
  if (!Object.keys(body).length) throw badRequest('No hay campos para guardar');
  const data = { ...body };
  for (const field of ['report_name', 'report_type']) {
    if (creating || field in data) {
      if (typeof data[field] !== 'string' || !data[field].trim()) {
        throw badRequest(`El campo ${field} es requerido`);
      }
      data[field] = data[field].trim();
    }
  }
  if ('report_type' in data && !REPORT_TYPES.includes(data.report_type)) {
    throw badRequest('Tipo de reporte no válido');
  }
  for (const field of ['description', 'sort_by']) {
    if (field in data && typeof data[field] !== 'string') throw badRequest(`El campo ${field} debe ser texto`);
  }
  if ('sort_order' in data && !['asc', 'desc'].includes(data.sort_order)) {
    throw badRequest('Orden no válido');
  }
  for (const field of ['is_shared', 'is_favorite']) {
    if (field in data && typeof data[field] !== 'boolean') throw badRequest(`El campo ${field} debe ser booleano`);
  }
  if ('filters' in data && !isObject(data.filters)) throw badRequest('Los filtros deben ser un objeto');
  if ('columns' in data && (!Array.isArray(data.columns) || data.columns.some(column => typeof column !== 'string'))) {
    throw badRequest('Las columnas deben ser una lista de nombres');
  }
  return data;
};

// La identidad proviene del token. El correo solo permite acceder a registros
// históricos que todavía no tienen propietario por ID.
const ownerScope = (req, params) => {
  if (hasPermission(req.access, 'system.admin')) return 'TRUE';
  params.push(req.user?.userId || req.user?.id || null, req.user?.email || null);
  return `(created_by_id = $${params.length - 1} OR (created_by_id IS NULL AND created_by = $${params.length}))`;
};

const orderBy = req => {
  const sort = req.query?.sort || '-created_date';
  if (typeof sort !== 'string') throw badRequest('Orden no válido');
  const field = sort.startsWith('-') ? sort.slice(1) : sort;
  if (!SORT_FIELDS.includes(field)) throw badRequest('Campo de orden no permitido');
  return `"${field}" ${sort.startsWith('-') ? 'DESC' : 'ASC'} NULLS LAST, id ASC`;
};

const handler = action => async (req, res) => {
  try {
    await action(req, res);
  } catch (error) {
    if (error.status === 400) return res.status(400).json({ error: error.message });
    console.error('Error en ReportConfiguration:', error.code || error.name);
    res.status(500).json({ error: 'No se pudo procesar la configuración del reporte' });
  }
};

const list = async (req, res, filters = {}) => {
  if (!isObject(filters)) throw badRequest('Filtros no válidos');
  const params = [];
  const conditions = [ownerScope(req, params)];
  for (const [field, value] of Object.entries(filters)) {
    if (!FILTER_FIELDS.includes(field)) throw badRequest('Campo de filtro no permitido');
    if (typeof value !== (field.startsWith('is_') ? 'boolean' : 'string')) {
      throw badRequest('Valor de filtro no válido');
    }
    params.push(value);
    conditions.push(`"${field}" = $${params.length}`);
  }
  const result = await pool.query(
    `SELECT * FROM ${TABLE} WHERE ${conditions.join(' AND ')} ORDER BY ${orderBy(req)}`, params
  );
  res.json(result.rows);
};

export const getAll = handler((req, res) => list(req, res));
export const filter = handler((req, res) => list(req, res, req.body));

export const getById = handler(async (req, res) => {
  const params = [req.params.id];
  const result = await pool.query(
    `SELECT * FROM ${TABLE} WHERE id = $1 AND ${ownerScope(req, params)}`, params
  );
  if (!result.rows.length) return res.status(404).json({ error: 'Configuración no encontrada' });
  res.json(result.rows[0]);
});

const dbValues = data => Object.entries(data).map(([field, value]) =>
  ['filters', 'columns'].includes(field) ? JSON.stringify(value) : value
);

export const create = handler(async (req, res) => {
  if (!hasPermission(req.access, 'system.admin')) {
    return res.status(403).json({ error: 'Se requiere permiso administrativo para crear configuraciones' });
  }
  const data = validateData(req.body, true);
  const fields = Object.keys(data);
  const params = [
    ...dbValues(data), generate24HexId(), new Date(), new Date(),
    req.user.userId || req.user.id || null, req.user.email,
  ];
  const names = [...fields, 'id', 'created_date', 'updated_date', 'created_by_id', 'created_by'];
  const result = await pool.query(
    `INSERT INTO ${TABLE} (${names.map(field => `"${field}"`).join(', ')})
     VALUES (${params.map((_, i) => `$${i + 1}`).join(', ')}) RETURNING *`, params
  );
  res.status(201).json(result.rows[0]);
});

export const update = handler(async (req, res) => {
  const data = validateData(req.body);
  const params = dbValues(data);
  const setters = Object.keys(data).map((field, i) => `"${field}" = $${i + 1}`);
  params.push(new Date());
  setters.push(`updated_date = $${params.length}`);
  params.push(req.params.id);
  const idParam = params.length;
  const scope = ownerScope(req, params);
  const result = await pool.query(
    `UPDATE ${TABLE} SET ${setters.join(', ')} WHERE id = $${idParam} AND ${scope} RETURNING *`, params
  );
  if (!result.rows.length) return res.status(404).json({ error: 'Configuración no encontrada' });
  res.json(result.rows[0]);
});

export const remove = handler(async (req, res) => {
  const params = [req.params.id];
  const result = await pool.query(
    `DELETE FROM ${TABLE} WHERE id = $1 AND ${ownerScope(req, params)} RETURNING id`, params
  );
  if (!result.rows.length) return res.status(404).json({ error: 'Configuración no encontrada' });
  res.status(204).send();
});

export default { getAll, filter, getById, create, update, delete: remove };
