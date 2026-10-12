import express from 'express';
import pool from '../../config/database.js';
import { authenticateToken } from '../../middleware/auth.js';
import { loadAccessContext, requireAnyPermission, attachEmployeeScope, requireEmployeeAccess } from '../../middleware/authorization.js';
import { generate24HexId } from '../../utils/idGenerator.js';
import { schemas, badRequest, validateSupplement, serializeSupplement, calculateQuinta } from '../../services/payrollSupplements.js';

const router = express.Router();
router.use(authenticateToken, loadAccessContext);
const payrollRead = ['payroll.view_all', 'payroll.view_department', 'payroll.view_own', 'payroll.create', 'payroll.calculate'];
const permissions = {
  HorasExtrasManual: { read: [...payrollRead, 'attendance.view_all', 'attendance.view_department', 'attendance.approve_edits', 'attendance.manage'], create: ['attendance.manage', 'payroll.create'], update: ['attendance.manage', 'payroll.edit'], delete: ['attendance.manage'] },
  AdelantoGratificacion: { read: payrollRead, create: ['payroll.create'], update: ['payroll.edit'], delete: ['payroll.delete'] },
  VentaVacaciones: { read: [...payrollRead, 'vacations.view_all', 'vacations.manage'], create: ['vacations.manage', 'payroll.create'], update: ['vacations.manage', 'payroll.edit'], delete: ['vacations.manage'] },
  QuintaCategoriaCalculo: { read: payrollRead, create: ['payroll.create', 'payroll.calculate'], update: ['payroll.edit'], delete: ['payroll.delete'] },
  QuintaCategoriaConfig: { read: ['payroll.view_all', 'payroll.calculate', 'payroll.create', 'system.settings'], create: ['system.settings', 'payroll.edit'], update: ['system.settings', 'payroll.edit'], delete: ['system.settings', 'payroll.edit'] },
};
const guard = (name, action) => [requireAnyPermission(...permissions[name][action]), attachEmployeeScope(...permissions[name][action])];
const handler = action => async (req, res, next) => {
  try { await action(req, res); } catch (error) {
    if (error.code === '23505') return res.status(409).json({ error: 'Ya existe un registro activo para ese período' });
    if (error.code === '42P01') return res.status(503).json({ error: 'Falta ejecutar el SQL de suplementos de planilla' });
    if (error.status) return res.status(error.status).json({ error: error.message });
    next(error);
  }
};
const table = name => `public.${name.toLowerCase()}`; // Solo nombres de la lista cerrada schemas.
const scope = (req, name, params) => {
  if (!schemas[name].properties.employee_id || req.accessibleEmployeeIds === null) return 'TRUE';
  params.push(req.accessibleEmployeeIds || []);
  return `employee_id = ANY($${params.length}::text[])`;
};
const values = (name, data) => Object.entries(data).map(([field, value]) => ['array', 'object'].includes(schemas[name].properties[field]?.type) && value != null ? JSON.stringify(value) : value);
const insert = async (db, name, data) => {
  const fields = [...Object.keys(data), 'id'];
  const params = [...values(name, data), generate24HexId()];
  const result = await db.query(`INSERT INTO ${table(name)} (${fields.map(field => `"${field}"`).join(', ')}) VALUES (${params.map((_, i) => `$${i + 1}`).join(', ')}) RETURNING *`, params);
  return serializeSupplement(name, result.rows[0]);
};
const employeeExists = async (db, id) => {
  if (!(await db.query('SELECT id FROM public.employee WHERE id = $1', [id])).rows.length) throw badRequest('Empleado no encontrado');
};
const assertOpen = async (db, record) => {
  const closed = await db.query("SELECT id FROM public.payslip WHERE employee_id = $1 AND month = $2 AND year = $3 AND payroll_type = $4 AND status IN ('Aprobada', 'Pagada')", [record.employee_id, record.month, record.year, record.payroll_type]);
  if (closed.rows.length) throw badRequest('La planilla está aprobada o pagada');
};
const transaction = async action => {
  const db = await pool.connect();
  try { await db.query('BEGIN'); const result = await action(db); await db.query('COMMIT'); return result; }
  catch (error) { await db.query('ROLLBACK'); throw error; }
  finally { db.release(); }
};

router.post('/QuintaCategoriaCalculo/calculate', ...guard('QuintaCategoriaCalculo', 'create'), handler(async (req, res) => {
  const { employee_id, year, month, payroll_type = 'Mensual', monthly_remuneration } = req.body;
  validateSupplement('QuintaCategoriaCalculo', { employee_id, year, month, payroll_type }, true);
  if (!requireEmployeeAccess(req, res, employee_id)) return;
  if (monthly_remuneration != null && (typeof monthly_remuneration !== 'number' || !Number.isFinite(monthly_remuneration) || monthly_remuneration <= 0)) throw badRequest('Remuneración inválida');
  const calculation = await transaction(async db => {
    await employeeExists(db, employee_id);
    const config = (await db.query('SELECT * FROM public.quintacategoriaconfig WHERE year = $1 AND is_active = true', [year])).rows[0];
    if (!config) throw badRequest('No hay configuración activa para el ejercicio');
    validateSupplement('QuintaCategoriaConfig', serializeSupplement('QuintaCategoriaConfig', Object.fromEntries(Object.entries(config).filter(([key]) => key in schemas.QuintaCategoriaConfig.properties))), true);
    const start = `${year}-${String(month).padStart(2, '0')}-01`;
    const end = `${year}-${String(month).padStart(2, '0')}-${new Date(year, month, 0).getDate()}`;
    const employee = (await db.query('SELECT base_salary FROM public.employee WHERE id = $1', [employee_id])).rows[0];
    const contract = (await db.query('SELECT salary FROM public.contract WHERE employee_id = $1 AND start_date <= $2::date AND (end_date IS NULL OR end_date >= $3::date) ORDER BY start_date DESC LIMIT 1', [employee_id, end, start])).rows[0];
    const remuneration = monthly_remuneration ?? Number(contract?.salary || employee.base_salary || 0);
    if (!(remuneration > 0)) throw badRequest('No se pudo determinar una remuneración mayor a cero');
    const prior = (await db.query("SELECT * FROM public.quintacategoriacalculo WHERE employee_id = $1 AND year = $2 AND month < $3 AND status IN ('Aplicada', 'Aprobada')", [employee_id, year, month])).rows;
    const data = calculateQuinta({ employee_id, year, month, payroll_type, remuneration, config, prior });
    return insert(db, 'QuintaCategoriaCalculo', { ...data, created_by: req.user.email });
  });
  res.status(201).json({ status: 'success', calculation });
}));

for (const name of Object.keys(schemas)) {
  const list = async (req, res, filters = {}) => {
    if (!filters || typeof filters !== 'object' || Array.isArray(filters)) throw badRequest('Filtros inválidos');
    const params = [];
    const conditions = [scope(req, name, params)];
    for (const [field, value] of Object.entries(filters)) {
      if (!Object.hasOwn(schemas[name].properties, field) && field !== 'id') throw badRequest('Filtro inválido');
      if (value !== null && !['string', 'number', 'boolean'].includes(typeof value)) throw badRequest('Valor de filtro inválido');
      params.push(value);
      conditions.push(`"${field}" IS NOT DISTINCT FROM $${params.length}`);
    }
    const sort = req.query.sort || '-created_date';
    if (typeof sort !== 'string') throw badRequest('Orden inválido');
    const field = sort.replace(/^-/, '');
    if (!['id', 'created_date', 'updated_date', ...Object.keys(schemas[name].properties)].includes(field)) throw badRequest('Orden inválido');
    const result = await pool.query(`SELECT * FROM ${table(name)} WHERE ${conditions.join(' AND ')} ORDER BY "${field}" ${sort.startsWith('-') ? 'DESC' : 'ASC'}, id`, params);
    res.json(result.rows.map(row => serializeSupplement(name, row)));
  };
  router.get(`/${name}`, ...guard(name, 'read'), handler((req, res) => list(req, res)));
  router.post(`/${name}/filter`, ...guard(name, 'read'), handler((req, res) => list(req, res, req.body)));
  router.get(`/${name}/:id`, ...guard(name, 'read'), handler(async (req, res) => {
    const params = [req.params.id];
    const result = await pool.query(`SELECT * FROM ${table(name)} WHERE id = $1 AND ${scope(req, name, params)}`, params);
    if (!result.rows.length) return res.status(404).json({ error: 'Registro no encontrado' });
    res.json(serializeSupplement(name, result.rows[0]));
  }));
  router.post(`/${name}`, ...guard(name, 'create'), handler(async (req, res) => {
    const data = validateSupplement(name, req.body, true);
    if (data.employee_id && !requireEmployeeAccess(req, res, data.employee_id)) return;
    if ('created_by' in schemas[name].properties) data.created_by = req.user.email;
    if (schemas[name].properties.status) data.status = schemas[name].properties.status.default || 'Pendiente';
    for (const key of Object.keys(data)) if (/^(approved|applied|reverted|rejected)_/.test(key)) delete data[key];
    if (name === 'AdelantoGratificacion') { data.applied_amount = 0; data.remaining_balance = data.amount; }
    const row = await transaction(async db => {
      if (data.employee_id) await employeeExists(db, data.employee_id);
      if (name === 'HorasExtrasManual') await assertOpen(db, data);
      return insert(db, name, data);
    });
    res.status(201).json(row);
  }));
  router.put(`/${name}/:id`, ...guard(name, 'update'), handler(async (req, res) => {
    const data = validateSupplement(name, req.body);
    if (!Object.keys(data).length) throw badRequest('No hay campos para actualizar');
    if (data.employee_id && !requireEmployeeAccess(req, res, data.employee_id)) return;
    const row = await transaction(async db => {
      const params = [req.params.id];
      const existing = (await db.query(`SELECT * FROM ${table(name)} WHERE id = $1 AND ${scope(req, name, params)} FOR UPDATE`, params)).rows[0];
      if (!existing) throw Object.assign(new Error('Registro no encontrado'), { status: 404 });
      if (data.employee_id && data.employee_id !== existing.employee_id) await employeeExists(db, data.employee_id);
      if (name === 'HorasExtrasManual') {
        await assertOpen(db, existing);
        if (existing.status !== 'Activo' || data.status !== 'Revertido' || Object.keys(data).some(key => !['status', 'reverted_by', 'reverted_date', 'revert_reason'].includes(key))) throw badRequest('Las horas manuales solo pueden revertirse');
      }
      if (name !== 'QuintaCategoriaConfig' && name !== 'HorasExtrasManual') {
        const transitions = { Pendiente: ['Aprobada', 'Aprobado', 'Rechazada', 'Revertida', 'Revertido'], Aprobada: ['Aplicada', 'Revertida'], Aprobado: ['Aplicado', 'Pagado', 'Revertido'], Aplicada: ['Pagada', 'Revertida'], Aplicado: ['Pagado', 'Revertido'], Pagada: ['Revertida'], Pagado: ['Revertido'] };
        if (data.status && data.status !== existing.status && !transitions[existing.status]?.includes(data.status)) throw badRequest('Transición de estado no válida');
        if (existing.status !== 'Pendiente' && Object.keys(data).some(key => !/^(status|approved_|applied_|reverted_|rejected_|revert_reason|rejection_reason|payment_|remaining_balance)/.test(key))) throw badRequest('Solo se puede editar un registro pendiente');
      }
      delete data.created_by;
      for (const prefix of ['approved', 'applied', 'reverted', 'rejected']) {
        const states = { approved: ['Aprobada', 'Aprobado'], applied: ['Aplicada', 'Aplicado'], reverted: ['Revertida', 'Revertido'], rejected: ['Rechazada'] };
        delete data[`${prefix}_by`]; delete data[`${prefix}_date`];
        if (states[prefix].includes(data.status)) {
          if (`${prefix}_by` in schemas[name].properties) data[`${prefix}_by`] = req.user.email;
          if (`${prefix}_date` in schemas[name].properties) data[`${prefix}_date`] = new Date().toISOString();
        }
      }
      if (name === 'AdelantoGratificacion') {
        if (data.amount != null) data.remaining_balance = data.amount;
        if (data.status === 'Aplicado') { data.applied_amount = Number(existing.amount); data.remaining_balance = 0; }
        if (data.status === 'Revertido') { data.applied_amount = 0; data.remaining_balance = Number(existing.amount); }
      }
      const updateParams = values(name, data);
      const setters = Object.keys(data).map((field, i) => `"${field}" = $${i + 1}`);
      setters.push('updated_date = CURRENT_TIMESTAMP');
      updateParams.push(req.params.id);
      const result = await db.query(`UPDATE ${table(name)} SET ${setters.join(', ')} WHERE id = $${updateParams.length} RETURNING *`, updateParams);
      return serializeSupplement(name, result.rows[0]);
    });
    res.json(row);
  }));
  router.delete(`/${name}/:id`, ...guard(name, 'delete'), handler(async (req, res) => {
    const params = [req.params.id];
    const condition = scope(req, name, params);
    // Los movimientos se conservan para auditoría; se anulan mediante reversión.
    if (name !== 'QuintaCategoriaConfig') throw badRequest('Use la reversión para conservar el historial');
    const result = await pool.query(`DELETE FROM ${table(name)} WHERE id = $1 AND ${condition} AND NOT EXISTS (SELECT 1 FROM public.quintacategoriacalculo WHERE config_id = $1) RETURNING id`, params);
    if (!result.rows.length) return res.status(409).json({ error: 'Configuración no encontrada o utilizada en cálculos' });
    res.status(204).send();
  }));
}
export default router;
