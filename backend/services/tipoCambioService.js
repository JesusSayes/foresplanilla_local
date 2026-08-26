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

export const serializeTipoCambio = (record) => record ? {
  ...record,
  fecha: normalizeDate(record.fecha),
} : record;

export class TipoCambioServiceError extends Error {
  constructor(message, status = 500) {
    super(message);
    this.name = 'TipoCambioServiceError';
    this.status = status;
  }
}

let dailyExchangeRateJob = null;

const runDailyExchangeRate = async ({ force = false } = {}) => {
  const today = todayInPeru();
  const existing = await prisma.$queryRaw`
    SELECT * FROM tipo_cambio
    WHERE fecha = CAST(${today} AS DATE) AND estado = TRUE
    LIMIT 1
  `;
  if (!force && existing[0]) {
    return {
      success: true,
      message: 'Tipo de cambio ya registrado para hoy.',
      data: serializeTipoCambio(existing[0]),
      already_exists: true,
    };
  }

  const configs = await prisma.$queryRaw`
    SELECT * FROM tipo_cambio_config WHERE is_active = TRUE ORDER BY created_date DESC LIMIT 1
  `;
  const config = configs[0];
  if (!config?.api_url) {
    throw new TipoCambioServiceError(
      'No hay configuración de API activa. Configure la URL en el módulo de Tipo de Cambio.',
      400
    );
  }

  let url;
  try {
    url = new URL(config.api_url);
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Protocolo no permitido');
  } catch {
    throw new TipoCambioServiceError('La URL configurada para el API no es válida.', 400);
  }

  let response;
  try {
    response = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(15000),
    });
  } catch (error) {
    throw new TipoCambioServiceError(`No se pudo conectar con el API de tipo de cambio: ${error.message}`, 502);
  }

  if (!response.ok) {
    throw new TipoCambioServiceError(
      `Error al consultar API de tipo de cambio (HTTP ${response.status}).`,
      502
    );
  }

  const apiData = await response.json();
  const compra = Number(apiData.compra);
  const venta = Number(apiData.venta);
  if (!compra || !venta || Number.isNaN(compra) || Number.isNaN(venta)) {
    throw new TipoCambioServiceError(
      'Respuesta del API no contiene valores válidos de compra/venta.',
      502
    );
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

  return {
    success: true,
    message: existing[0]
      ? 'Tipo de cambio actualizado correctamente.'
      : 'Tipo de cambio registrado correctamente.',
    data: serializeTipoCambio(rows[0]),
  };
};

export const obtenerTipoCambioDiario = ({ force = false } = {}) => {
  if (dailyExchangeRateJob) return dailyExchangeRateJob;

  dailyExchangeRateJob = runDailyExchangeRate({ force })
    .finally(() => {
      dailyExchangeRateJob = null;
    });

  return dailyExchangeRateJob;
};
