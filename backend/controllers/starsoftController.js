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
    const rows = await prisma.$queryRaw`
      INSERT INTO starsoft_config (
        id, config_name, client_id, client_secret, cod_empresa, cod_sistema,
        auth_url, api_url, is_active, notes, created_by
      ) VALUES (
        ${id}, ${data.config_name}, ${data.client_id}, ${data.client_secret},
        ${data.cod_empresa}, ${data.cod_sistema}, ${data.auth_url}, ${data.api_url},
        ${data.is_active}, ${data.notes}, ${req.user?.email || 'system'}
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
    const results = { success: [], errors: [] };

    for (const asiento of asientos) {
      const trama = {
        empresa: asiento.empresa || config.cod_empresa,
        cuenta: asiento.cuenta || '',
        annomes: asiento.annomes || '',
        subdiario: asiento.subdiario || '',
        comprobante: asiento.comprobante || '',
        fecha_Documento: asiento.fecha_doc || '',
        tipo_Anexo: asiento.tipo_anexo || '',
        cod_Proveedor: asiento.cod_anexo || '',
        tipo_Doc: asiento.tipo_doc || '',
        nro_Doc: asiento.nro_doc || '',
        fecha_Vencimiento: asiento.fecha_vencimiento || asiento.fecha_doc || '',
        importe_Doc: asiento.importe ?? 0,
        conversion_Tc: asiento.conversion_tc || 'M',
        fecha_Registro: asiento.fecha_registro || '',
        tc: asiento.tc ?? 1,
        glosa: asiento.glosa || '',
        destino_Compra: asiento.centro_costos || '',
        centro_Costos: asiento.centro_costos || '',
        glosa_Mov: asiento.glosa_mov || '',
        anulado: asiento.anulado ? '1' : '0',
        debe_Haber: asiento.debe_haber || '',
      };

      try {
        const sendResponse = await fetch(config.api_url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify(trama),
        });
        const sendData = await parseResponse(sendResponse);
        const ok = sendResponse.ok && sendData.success !== false;

        if (ok) {
          const code = sendData.codigo || sendData.id || sendData.datos?.codigo || sendData.datos?.id || 'OK';
          await prisma.$executeRaw`
            UPDATE asiento_contable
            SET estado_migracion = 'Migrado', migrado = TRUE, fecha_migracion = NOW(),
                migrado_por = ${req.user?.email || 'system'}, sistema_destino = 'Starsoft',
                codigo_migracion = ${String(code)}, error_migracion = '', updated_date = NOW()
            WHERE id = ${asiento.id}
          `;
          results.success.push(asiento.id);
        } else {
          const message = sendData.message || sendData.error || sendData.mensaje || `HTTP ${sendResponse.status}`;
          await markAsError(asiento.id, message);
          results.errors.push({ id: asiento.id, comprobante: asiento.comprobante, cuenta: asiento.cuenta, error: message });
        }
      } catch (error) {
        const message = `Error de red: ${error.message}`;
        await markAsError(asiento.id, message);
        results.errors.push({ id: asiento.id, comprobante: asiento.comprobante, cuenta: asiento.cuenta, error: message });
      }
    }

    res.json({
      success: true,
      total: asientos.length,
      migrados: results.success.length,
      errores: results.errors.length,
      detalle_errores: results.errors,
    });
  } catch (error) {
    next(error);
  }
};

const markAsError = (id, message) => prisma.$executeRaw`
  UPDATE asiento_contable
  SET estado_migracion = 'Error', migrado = FALSE, error_migracion = ${message},
      sistema_destino = 'Starsoft', updated_date = NOW()
  WHERE id = ${id}
`;

export default {
  listConfigs,
  getConfig,
  createConfig,
  updateConfig,
  deleteConfig,
  migrate,
};
