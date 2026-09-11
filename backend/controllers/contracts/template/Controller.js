import pool from '../../../config/database.js';
import { generate24HexId } from '../../../utils/idGenerator.js';

const FIELDS = ['template_name', 'description', 'is_default', 'is_active', 'contract_types', 'company_name', 'company_ruc', 'company_address', 'company_representative', 'company_representative_doc', 'contract_title', 'contract_subtitle', 'employer_section_title', 'employer_section_text', 'worker_section_title', 'worker_section_text', 'introduction_text', 'section_object_title', 'contract_object_text', 'section_functions_title', 'functions_intro_text', 'section_duration_title', 'duration_indeterminate_text', 'duration_fixed_text', 'trial_period_text', 'section_salary_title', 'salary_text', 'section_schedule_title', 'schedule_text', 'work_location_text', 'section_obligations_title', 'obligations_text', 'section_benefits_title', 'benefits_text', 'section_termination_title', 'termination_text', 'section_domicile_title', 'domicile_text', 'standard_clause_order', 'final_text_order', 'unified_clause_order'];
const ARRAYS = ['contract_types', 'standard_clause_order', 'final_text_order', 'unified_clause_order'];
const ORDERS = {
  standard_clause_order: ['object', 'functions', 'duration', 'salary', 'schedule'],
  final_text_order: ['obligations', 'benefits', 'termination', 'domicile'],
};
const badRequest = message => Object.assign(new Error(message), { status: 400 });
const validate = body => {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw badRequest('Datos no válidos');
  const data = {};
  for (const field of FIELDS) {
    if (!(field in body)) continue;
    const value = body[field];
    if (value !== null) {
      if (ARRAYS.includes(field)) {
        if (!Array.isArray(value) || value.some(item => typeof item !== 'string')) throw badRequest(`Lista no válida: ${field}`);
        if (field === 'unified_clause_order' && (value.some(id => !id.trim()) || new Set(value).size !== value.length)) throw badRequest('Orden unificado no válido');
        if (ORDERS[field] && value.length && (value.length !== ORDERS[field].length || new Set(value).size !== value.length || value.some(id => !ORDERS[field].includes(id)))) throw badRequest(`Orden incompleto o no válido: ${field}`);
      } else if (typeof value !== (field.startsWith('is_') ? 'boolean' : 'string')) throw badRequest(`Tipo no válido: ${field}`);
    }
    data[field] = ARRAYS.includes(field) && value !== null ? JSON.stringify(value) : value;
  }
  if (!Object.keys(data).length) throw badRequest('No hay campos para guardar');
  return data;
};
const handler = action => async (req, res) => {
  try { await action(req, res); }
  catch (error) { res.status(error.status || 500).json({ error: error.status ? error.message : 'No se pudo procesar la plantilla' }); }
};
const list = async (req, res, filters = {}) => {
  const params = [];
  const conditions = [];
  for (const [field, value] of Object.entries(filters)) {
    if (!['id', 'template_name', 'is_active', 'is_default'].includes(field)) throw badRequest('Filtro no válido');
    params.push(value);
    conditions.push(`"${field}" = $${params.length}`);
  }
  const sort = req.query?.sort || '-created_date';
  if (typeof sort !== 'string') throw badRequest('Orden no válido');
  const field = sort.replace(/^-/, '');
  if (!['created_date', 'updated_date', 'template_name', 'id'].includes(field)) throw badRequest('Orden no válido');
  const result = await pool.query(`SELECT * FROM public.contract_template${conditions.length ? ' WHERE ' + conditions.join(' AND ') : ''} ORDER BY "${field}" ${sort.startsWith('-') ? 'DESC' : 'ASC'}, id ASC`, params);
  res.json(result.rows);
};
export const getAll = handler((req, res) => list(req, res));
export const filter = handler((req, res) => list(req, res, req.body?.filters || req.body || {}));
export const getById = handler(async (req, res) => {
  const result = await pool.query('SELECT * FROM public.contract_template WHERE id = $1', [req.params.id]);
  if (!result.rows.length) return res.status(404).json({ error: 'Template not found' });
  res.json(result.rows[0]);
});
export const create = handler(async (req, res) => {
  const data = validate(req.body);
  if (!data.template_name?.trim()) throw badRequest('El nombre de plantilla es requerido');
  Object.assign(data, { id: generate24HexId(), created_date: new Date(), updated_date: new Date(), created_by_id: req.user.userId || req.user.id, created_by: req.user.email });
  const fields = Object.keys(data);
  const result = await pool.query(`INSERT INTO public.contract_template (${fields.map(f => `"${f}"`).join(', ')}) VALUES (${fields.map((_, i) => `$${i + 1}`).join(', ')}) RETURNING *`, Object.values(data));
  res.status(201).json(result.rows[0]);
});
export const update = handler(async (req, res) => {
  const data = validate(req.body);
  data.updated_date = new Date();
  const values = [...Object.values(data), req.params.id];
  const result = await pool.query(`UPDATE public.contract_template SET ${Object.keys(data).map((f, i) => `"${f}" = $${i + 1}`).join(', ')} WHERE id = $${values.length} RETURNING *`, values);
  if (!result.rows.length) return res.status(404).json({ error: 'Template not found' });
  res.json(result.rows[0]);
});
export const deleteTemplate = handler(async (req, res) => {
  await pool.query('DELETE FROM public.contract_template WHERE id = $1', [req.params.id]);
  res.status(204).send();
});
export default { getAll, getById, create, update, delete: deleteTemplate, filter };
