import { Prisma } from '@prisma/client';
import prisma from '../config/prisma.js';
import { generate24HexId } from '../utils/idGenerator.js';

const todayInPeru = () => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Lima',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
}).format(new Date());

const normalizeDate = (value) => {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
  return String(value || '').slice(0, 10);
};

const tipoCambioWhere = (filters = {}) => {
  const conditions = [];
  if (filters.fecha) conditions.push(Prisma.sql`fecha = CAST(${normalizeDate(filters.fecha)} AS DATE)`);
  if (filters.estado !== undefined) conditions.push(Prisma.sql`estado = ${Boolean(filters.estado)}`);
  if (filters.fuente) conditions.push(Prisma.sql`fuente = ${String(filters.fuente)}`);
  return conditions.length
    ? Prisma.sql`WHERE ${Prisma.join(conditions, ' AND ')}`
    : Prisma.empty;
};

const configWhere = (filters = {}) => {
  if (filters.is_active === undefined) return Prisma.empty;
  return Prisma.sql`WHERE is_active = ${Boolean(filters.is_active)}`;
};

const findTipoCambio = async (id) => {
  const rows = await prisma.$queryRaw`SELECT * FROM tipo_cambio WHERE id = ${id} LIMIT 1`;
  return rows[0] || null;
};

const findConfig = async (id) => {
  const rows = await prisma.$queryRaw`SELECT * FROM tipo_cambio_config WHERE id = ${id} LIMIT 1`;
  return rows[0] || null;
};

export const list = async (req, res, next) => {
  try {
    const rows = await prisma.$queryRaw(Prisma.sql`
      SELECT * FROM tipo_cambio ${tipoCambioWhere(req.body || {})}
      ORDER BY fecha DESC, created_date DESC
    `);
    res.json(rows);
  } catch (error) {
    next(error);
  }
};

export const get = async (req, res, next) => {
  try {
    const record = await findTipoCambio(req.params.id);
    if (!record) return res.status(404).json({ error: 'Tipo de cambio no encontrado' });
    res.json(record);
  } catch (error) {
    next(error);
  }
};

export const create = async (req, res, next) => {
  try {
    const { fecha, valor_compra, valor_venta } = req.body || {};
    if (!fecha || !Number(valor_compra) || !Number(valor_venta)) {
      return res.status(400).json({ error: 'fecha, valor_compra y valor_venta son requeridos' });
    }
    const id = generate24HexId();
    const rows = await prisma.$queryRaw`
      INSERT INTO tipo_cambio (
        id, fecha, valor_compra, valor_venta, estado, fuente, registrado_por
      ) VALUES (
        ${id}, CAST(${normalizeDate(fecha)} AS DATE), ${Number(valor_compra)}, ${Number(valor_venta)},
        ${req.body.estado !== false}, ${req.body.fuente || 'auto'}, ${req.body.registrado_por || null}
      )
      RETURNING *
    `;
    res.status(201).json(rows[0]);
  } catch (error) {
    if (error.code === 'P2010' && String(error.meta?.message || '').includes('unique')) {
      return res.status(409).json({ error: 'Ya existe un tipo de cambio para esa fecha' });
    }
    next(error);
  }
};

export const update = async (req, res, next) => {
  try {
    const current = await findTipoCambio(req.params.id);
    if (!current) return res.status(404).json({ error: 'Tipo de cambio no encontrado' });

    const fecha = normalizeDate(req.body.fecha || current.fecha);
    const compra = Number(req.body.valor_compra ?? current.valor_compra);
    const venta = Number(req.body.valor_venta ?? current.valor_venta);
    const rows = await prisma.$queryRaw`
      UPDATE tipo_cambio
      SET fecha = CAST(${fecha} AS DATE),
          valor_compra = ${compra},
          valor_venta = ${venta},
          estado = ${req.body.estado ?? current.estado},
          fuente = ${req.body.fuente ?? current.fuente},
          registrado_por = ${req.body.registrado_por ?? current.registrado_por},
          updated_date = NOW()
      WHERE id = ${req.params.id}
      RETURNING *
    `;
    res.json(rows[0]);
  } catch (error) {
    next(error);
  }
};

export const remove = async (req, res, next) => {
  try {
    const deleted = await prisma.$executeRaw`DELETE FROM tipo_cambio WHERE id = ${req.params.id}`;
    if (!deleted) return res.status(404).json({ error: 'Tipo de cambio no encontrado' });
    res.status(204).send();
  } catch (error) {
    next(error);
  }
};

export const listConfigs = async (req, res, next) => {
  try {
    const rows = await prisma.$queryRaw(Prisma.sql`
      SELECT * FROM tipo_cambio_config ${configWhere(req.body || {})}
      ORDER BY created_date DESC
    `);
    res.json(rows);
  } catch (error) {
    next(error);
  }
};

export const getConfig = async (req, res, next) => {
  try {
    const record = await findConfig(req.params.id);
    if (!record) return res.status(404).json({ error: 'Configuración no encontrada' });
    res.json(record);
  } catch (error) {
    next(error);
  }
};

export const createConfig = async (req, res, next) => {
  try {
    if (!req.body?.api_url) return res.status(400).json({ error: 'api_url es requerido' });
    const id = generate24HexId();
    const rows = await prisma.$queryRaw`
      INSERT INTO tipo_cambio_config (id, api_url, is_active, notes, created_by)
      VALUES (${id}, ${req.body.api_url}, ${req.body.is_active !== false}, ${req.body.notes || null}, ${req.user?.email || 'system'})
      RETURNING *
    `;
    res.status(201).json(rows[0]);
  } catch (error) {
    next(error);
  }
};

export const updateConfig = async (req, res, next) => {
  try {
    const current = await findConfig(req.params.id);
    if (!current) return res.status(404).json({ error: 'Configuración no encontrada' });
    const rows = await prisma.$queryRaw`
      UPDATE tipo_cambio_config
      SET api_url = ${req.body.api_url ?? current.api_url},
          is_active = ${req.body.is_active ?? current.is_active},
          notes = ${req.body.notes ?? current.notes},
          updated_date = NOW(),
          updated_by = ${req.user?.email || 'system'}
      WHERE id = ${req.params.id}
      RETURNING *
    `;
    res.json(rows[0]);
  } catch (error) {
    next(error);
  }
};

export const removeConfig = async (req, res, next) => {
  try {
    const deleted = await prisma.$executeRaw`DELETE FROM tipo_cambio_config WHERE id = ${req.params.id}`;
    if (!deleted) return res.status(404).json({ error: 'Configuración no encontrada' });
    res.status(204).send();
  } catch (error) {
    next(error);
  }
};

export const obtenerDiario = async (req, res, next) => {
  try {
    const force = Boolean(req.body?.force);
    const today = todayInPeru();
    const existing = await prisma.$queryRaw`
      SELECT * FROM tipo_cambio
      WHERE fecha = CAST(${today} AS DATE) AND estado = TRUE
      LIMIT 1
    `;
    if (!force && existing[0]) {
      return res.json({ success: true, message: 'Tipo de cambio ya registrado para hoy.', data: existing[0], already_exists: true });
    }

    const configs = await prisma.$queryRaw`
      SELECT * FROM tipo_cambio_config WHERE is_active = TRUE ORDER BY created_date DESC LIMIT 1
    `;
    const config = configs[0];
    if (!config?.api_url) {
      return res.status(400).json({ error: 'No hay configuración de API activa. Configure la URL en el módulo de Tipo de Cambio.' });
    }

    let url;
    try {
      url = new URL(config.api_url);
      if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Protocolo no permitido');
    } catch {
      return res.status(400).json({ error: 'La URL configurada para el API no es válida.' });
    }

    const response = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!response.ok) {
      return res.status(502).json({ error: `Error al consultar API de tipo de cambio (HTTP ${response.status}).` });
    }
    const apiData = await response.json();
    const compra = Number(apiData.compra);
    const venta = Number(apiData.venta);
    if (!compra || !venta || Number.isNaN(compra) || Number.isNaN(venta)) {
      return res.status(502).json({ error: 'Respuesta del API no contiene valores válidos de compra/venta.' });
    }

    const id = existing[0]?.id || generate24HexId();
    const rows = await prisma.$queryRaw`
      INSERT INTO tipo_cambio (id, fecha, valor_compra, valor_venta, estado, fuente, registrado_por)
      VALUES (${id}, CAST(${today} AS DATE), ${compra}, ${venta}, TRUE, 'auto', NULL)
      ON CONFLICT (fecha) DO UPDATE SET
        valor_compra = EXCLUDED.valor_compra,
        valor_venta = EXCLUDED.valor_venta,
        estado = TRUE,
        fuente = 'auto',
        registrado_por = NULL,
        updated_date = NOW()
      RETURNING *
    `;
    res.json({ success: true, message: existing[0] ? 'Tipo de cambio actualizado correctamente.' : 'Tipo de cambio registrado correctamente.', data: rows[0] });
  } catch (error) {
    next(error);
  }
};

export default {
  list,
  get,
  create,
  update,
  remove,
  listConfigs,
  getConfig,
  createConfig,
  updateConfig,
  removeConfig,
  obtenerDiario,
};
