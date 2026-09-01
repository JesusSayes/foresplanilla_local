import { Prisma } from '@prisma/client';
import prisma from '../config/prisma.js';
import { generate24HexId } from '../utils/idGenerator.js';

const configFields = ({
  config_name = 'Configuración Starsoft',
  client_id = null,
  client_secret = null,
  cod_empresa = '003',
  cod_sistema = '01',
  auth_url = '',
  api_url = '',
  is_active = true,
  cuentas_por_planilla = [],
  cuentas_por_concepto = [],
  subdiarios_por_planilla = [],
  notes = null,
}) => ({
  config_name,
  client_id,
  client_secret,
  cod_empresa,
  cod_sistema,
  auth_url,
  api_url,
  is_active,
  cuentas_por_planilla,
  cuentas_por_concepto,
  subdiarios_por_planilla,
  notes,
});

const getActiveConfig = async () => {
  const rows = await prisma.$queryRaw`
    SELECT *
    FROM starsoft_config
    WHERE is_active = TRUE
    ORDER BY created_date DESC
    LIMIT 1
  `;
  return rows[0] || null;
};

const updateTestResult = (id, status, message) => prisma.$executeRaw`
  UPDATE starsoft_config
  SET last_test_status = ${status},
      last_test_date = NOW(),
      last_test_message = ${message},
      updated_date = NOW()
  WHERE id = ${id}
`;

const parseResponse = async (response) => {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    return { success: response.ok, message: text.slice(0, 300) };
  }
};

const toISODate = (value) => {
  if (!value) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const year = value.getUTCFullYear();
    const month = String(value.getUTCMonth() + 1).padStart(2, '0');
    const day = String(value.getUTCDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  const date = String(value).split('T')[0];
  const isoMatch = date.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) return date.slice(0, 10);
  const dmyMatch = date.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (dmyMatch) return `${dmyMatch[3]}-${dmyMatch[2]}-${dmyMatch[1]}`;
  return null;
};

const todayISO = () => new Date().toISOString().split('T')[0];

const sanitizeAnnomes = (value) => String(value || '').replace(/\D/g, '');

export const buildStarsoftPayload = (asientos) => asientos.map(asiento => ({
  cuenta: asiento.cuenta || '',
  annomes: sanitizeAnnomes(asiento.annomes),
  subdiario: asiento.subdiario || '',
  comprobante: asiento.comprobante || '',
  fecha_Registro: toISODate(asiento.fecha_registro) || toISODate(asiento.fecha_doc) || todayISO(),
  fecha_Documento: toISODate(asiento.fecha_doc) || toISODate(asiento.fecha_registro) || todayISO(),
  tipo_Anexo: asiento.tipo_anexo || '',
  cod_Anexo: asiento.cod_anexo || '',
  tipo_Doc: asiento.tipo_doc || '',
  nro_Doc: asiento.nro_doc || '',
  fecha_Vencimiento: asiento.fecha_vencimiento ? toISODate(asiento.fecha_vencimiento) : null,
  importe: asiento.importe ?? 0,
  conv_Tc: asiento.conversion_tc || 'M',
  tc: asiento.tc ?? 1,
  glosa: asiento.glosa || '',
  glosa_Mov: asiento.glosa_mov || '',
  anulado: !!asiento.anulado,
  debe_Haber: asiento.debe_haber || '',
  centro_Costos: asiento.centro_costos || '',
  moneda: asiento.moneda === 'USD' ? 'ME' : asiento.moneda === 'PEN' ? 'MN' : (asiento.moneda || ''),
}));

const getStarsoftErrorMessage = (data, status) => {
  let message = data?.message || data?.error || data?.mensaje || data?.detail || data?.details || '';
  if (!message && data?.datos && !Array.isArray(data.datos) && typeof data.datos === 'object') {
    message = data.datos.message || data.datos.error || data.datos.mensaje || '';
  }
  if (!message && Array.isArray(data?.errors)) message = data.errors.join('; ');
  if (!message && Array.isArray(data?.datos)) {
    message = data.datos.map(item => typeof item === 'string' ? item : JSON.stringify(item)).join('; ');
  }
  return message || `HTTP ${status} — Respuesta: ${JSON.stringify(data).slice(0, 400)}`;
};

export const listConfigs = async (req, res, next) => {
  try {
    const onlyActive = req.body?.is_active === true || req.query?.is_active === 'true';
    const rows = onlyActive
      ? await prisma.$queryRaw`SELECT * FROM starsoft_config WHERE is_active = TRUE ORDER BY created_date DESC`
      : await prisma.$queryRaw`SELECT * FROM starsoft_config ORDER BY created_date DESC`;
    res.json(rows);
  } catch (error) {
    next(error);
  }
};

export const getConfig = async (req, res, next) => {
  try {
    const rows = await prisma.$queryRaw`SELECT * FROM starsoft_config WHERE id = ${req.params.id} LIMIT 1`;
    if (!rows[0]) return res.status(404).json({ error: 'Configuración Starsoft no encontrada' });
    res.json(rows[0]);
  } catch (error) {
    next(error);
  }
};

export const createConfig = async (req, res, next) => {
  try {
    const id = generate24HexId();
    const data = configFields(req.body || {});
    const cuentasPorPlanilla = JSON.stringify(data.cuentas_por_planilla || []);
    const cuentasPorConcepto = JSON.stringify(data.cuentas_por_concepto || []);
    const subdiariosPorPlanilla = JSON.stringify(data.subdiarios_por_planilla || []);
    const rows = await prisma.$queryRaw`
      INSERT INTO starsoft_config (
        id, config_name, client_id, client_secret, cod_empresa, cod_sistema,
        auth_url, api_url, is_active, cuentas_por_planilla, cuentas_por_concepto,
        subdiarios_por_planilla, notes, created_by
      ) VALUES (
        ${id}, ${data.config_name}, ${data.client_id}, ${data.client_secret},
        ${data.cod_empresa}, ${data.cod_sistema}, ${data.auth_url}, ${data.api_url},
        ${data.is_active}, CAST(${cuentasPorPlanilla} AS JSONB), CAST(${cuentasPorConcepto} AS JSONB),
        CAST(${subdiariosPorPlanilla} AS JSONB), ${data.notes}, ${req.user?.email || 'system'}
      )
      RETURNING *
    `;
    res.status(201).json(rows[0]);
  } catch (error) {
    next(error);
  }
};

export const updateConfig = async (req, res, next) => {
  try {
    const data = configFields(req.body || {});
    const hasCuentasPorPlanilla = Object.prototype.hasOwnProperty.call(req.body || {}, 'cuentas_por_planilla');
    const hasCuentasPorConcepto = Object.prototype.hasOwnProperty.call(req.body || {}, 'cuentas_por_concepto');
    const hasSubdiariosPorPlanilla = Object.prototype.hasOwnProperty.call(req.body || {}, 'subdiarios_por_planilla');
    const cuentasPorPlanilla = JSON.stringify(data.cuentas_por_planilla || []);
    const cuentasPorConcepto = JSON.stringify(data.cuentas_por_concepto || []);
    const subdiariosPorPlanilla = JSON.stringify(data.subdiarios_por_planilla || []);
    const rows = await prisma.$queryRaw`
      UPDATE starsoft_config
      SET config_name = ${data.config_name},
          client_id = ${data.client_id},
          client_secret = ${data.client_secret},
          cod_empresa = ${data.cod_empresa},
          cod_sistema = ${data.cod_sistema},
          auth_url = ${data.auth_url},
          api_url = ${data.api_url},
          is_active = ${data.is_active},
          cuentas_por_planilla = CASE
            WHEN ${hasCuentasPorPlanilla} THEN CAST(${cuentasPorPlanilla} AS JSONB)
            ELSE cuentas_por_planilla
          END,
          cuentas_por_concepto = CASE
            WHEN ${hasCuentasPorConcepto} THEN CAST(${cuentasPorConcepto} AS JSONB)
            ELSE cuentas_por_concepto
          END,
          subdiarios_por_planilla = CASE
            WHEN ${hasSubdiariosPorPlanilla} THEN CAST(${subdiariosPorPlanilla} AS JSONB)
            ELSE subdiarios_por_planilla
          END,
          notes = ${data.notes},
          updated_date = NOW(),
          updated_by = ${req.user?.email || 'system'}
      WHERE id = ${req.params.id}
      RETURNING *
    `;
    if (!rows[0]) return res.status(404).json({ error: 'Configuración Starsoft no encontrada' });
    res.json(rows[0]);
  } catch (error) {
    next(error);
  }
};

export const deleteConfig = async (req, res, next) => {
  try {
    const deleted = await prisma.$executeRaw`DELETE FROM starsoft_config WHERE id = ${req.params.id}`;
    if (!deleted) return res.status(404).json({ error: 'Configuración Starsoft no encontrada' });
    res.status(204).send();
  } catch (error) {
    next(error);
  }
};

export const migrate = async (req, res, next) => {
  try {
    const mode = req.body?.mode || 'migrate';
    const asientoIds = Array.isArray(req.body?.asiento_ids) ? req.body.asiento_ids : [];
    const config = await getActiveConfig();

    if (!config) {
      return res.status(400).json({ error: 'No existe una configuración de Starsoft activa.' });
    }

    if (mode === 'preview') {
      if (asientoIds.length === 0) {
        return res.status(400).json({ error: 'No se enviaron asientos para generar la vista previa.' });
      }

      const asientos = await prisma.$queryRaw`
        SELECT * FROM asiento_contable
        WHERE id IN (${Prisma.join(asientoIds)})
      `;
      const payload = buildStarsoftPayload(asientos);

      return res.json({
        success: true,
        preview: true,
        total: payload.length,
        destination: config.api_url || null,
        payload,
      });
    }

    if (!config.auth_url || !config.api_url) {
      return res.status(400).json({ error: 'Las URLs de autenticación y envío de Starsoft no están configuradas.' });
    }
    if (!config.client_id || !config.client_secret) {
      return res.status(400).json({ error: 'Las credenciales de Starsoft no están configuradas.' });
    }

    let authResponse;
    let authData;
    try {
      authResponse = await fetch(config.auth_url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          clientID: config.client_id,
          clientSecret: config.client_secret,
          codEmpresa: config.cod_empresa,
          codSistema: config.cod_sistema,
        }),
      });
      authData = await parseResponse(authResponse);
    } catch (error) {
      if (mode === 'test') await updateTestResult(config.id, 'error', `Error de red: ${error.message}`);
      return res.status(502).json({ error: `Error de conexión con Starsoft: ${error.message}`, auth_error: true });
    }

    if (!authResponse.ok || authData.success === false || !authData.datos?.access_token) {
      const message = authData.message || authData.error || `HTTP ${authResponse.status}`;
      if (mode === 'test') await updateTestResult(config.id, 'error', `Autenticación fallida: ${message}`);
      return res.status(400).json({ error: `Autenticación Starsoft fallida: ${message}`, auth_error: true });
    }

    const accessToken = authData.datos.access_token;
    const expiresIn = authData.datos.expires_in ?? null;
    if (mode === 'test') {
      await updateTestResult(config.id, 'success', `Autenticación exitosa. Token válido por ${expiresIn ?? '?'} segundos.`);
      return res.json({ success: true, message: 'Autenticación exitosa', expires_in: expiresIn, cod_empresa: config.cod_empresa });
    }

    if (asientoIds.length === 0) {
      return res.status(400).json({ error: 'No se enviaron asientos a migrar.' });
    }

    const asientos = await prisma.$queryRaw`
      SELECT * FROM asiento_contable
      WHERE id IN (${Prisma.join(asientoIds)})
    `;
    const payload = buildStarsoftPayload(asientos);

    let sendResponse;
    try {
      sendResponse = await fetch(config.api_url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'text/plain',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify(payload),
      });
      console.log('[Starsoft] Payload enviado:', JSON.stringify({
        destination: config.api_url,
        asiento_ids: asientoIds,
        payload,
      }, null, 2));
    } catch (error) {
      const message = `Error de red: ${error.message}`;
      await markAsError(asientoIds, message);
      return res.status(502).json({
        success: false,
        error: message,
        total: asientos.length,
        migrados: 0,
        errores: asientos.length,
      });
    }

    const sendData = await parseResponse(sendResponse);
    const ok = sendResponse.ok && sendData.success === true;
    const datos = Array.isArray(sendData.datos) ? sendData.datos[0] : sendData.datos;
    const code = sendData.codigo || sendData.id || datos?.codigo || datos?.id || 'OK';

    if (ok) {
      await prisma.$executeRaw`
        UPDATE asiento_contable
        SET estado_migracion = 'Migrado', migrado = TRUE, fecha_migracion = NOW(),
            migrado_por = ${req.user?.email || 'system'}, sistema_destino = 'Starsoft',
            codigo_migracion = ${String(code)}, error_migracion = '', updated_date = NOW()
        WHERE id IN (${Prisma.join(asientoIds)})
      `;
      return res.json({
        success: true,
        total: asientos.length,
        migrados: asientos.length,
        errores: 0,
      });
    }

    const message = getStarsoftErrorMessage(sendData, sendResponse.status);
    await markAsError(asientoIds, message);
    return res.status(400).json({
      success: false,
      error: message,
      total: asientos.length,
      migrados: 0,
      errores: asientos.length,
      status: sendResponse.status,
    });
  } catch (error) {
    next(error);
  }
};

const markAsError = (ids, message) => prisma.$executeRaw`
  UPDATE asiento_contable
  SET estado_migracion = 'Error', migrado = FALSE, error_migracion = ${message},
      sistema_destino = 'Starsoft', updated_date = NOW()
  WHERE id IN (${Prisma.join(ids)})
`;

export default {
  listConfigs,
  getConfig,
  createConfig,
  updateConfig,
  deleteConfig,
  migrate,
};
