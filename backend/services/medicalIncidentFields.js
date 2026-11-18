import { hasPermission } from '../middleware/authorization.js';

export const MEDICAL_FIELDS = ['citt_number', 'citt_status', 'subsidy_daily_base', 'subsidy_daily_base_reason'];
const invalid = message => Object.assign(new Error(message), { status: 400 });

// Estos campos se leen/escriben con SQL parametrizado hasta que se actualice Prisma.
export function splitMedicalFields(body, access, existing = {}) {
  const data = { ...body };
  const medical = {};
  for (const field of MEDICAL_FIELDS) {
    if (Object.hasOwn(data, field)) medical[field] = data[field];
    delete data[field];
  }
  if (!Object.keys(medical).length) return { data, medical };
  if ((data.incident_type ?? existing.incident_type) !== 'Descanso Médico') {
    throw invalid('El sustento médico solo corresponde a un descanso médico');
  }
  for (const field of ['citt_number', 'citt_status', 'subsidy_daily_base_reason']) {
    if (!Object.hasOwn(medical, field)) continue;
    if (medical[field] != null && typeof medical[field] !== 'string') throw invalid('Sustento médico inválido');
    medical[field] = String(medical[field] ?? '').trim();
  }
  if (medical.citt_status !== undefined && !['', 'Pendiente', 'Validado', 'No aplica'].includes(medical.citt_status)) {
    throw invalid('Estado de CITT inválido');
  }
  if (medical.subsidy_daily_base != null &&
      (typeof medical.subsidy_daily_base !== 'number' || !Number.isFinite(medical.subsidy_daily_base) || medical.subsidy_daily_base < 0)) {
    throw invalid('La base diaria debe ser un número no negativo');
  }
  if (Object.hasOwn(medical, 'subsidy_daily_base') && !medical.subsidy_daily_base) medical.subsidy_daily_base = null;
  const next = { ...existing, ...medical };
  if (next.citt_status === 'Validado' && !next.citt_number) throw invalid('Indique el número de CITT validado');
  if (next.subsidy_daily_base > 0 && !String(next.subsidy_daily_base_reason || '').trim()) {
    throw invalid('La base diaria manual requiere sustento');
  }
  const privilegedChange = (medical.citt_status === 'Validado' && existing.citt_status !== 'Validado') ||
    ['subsidy_daily_base', 'subsidy_daily_base_reason'].some(field =>
      Object.hasOwn(medical, field) && String(medical[field] ?? '') !== String(existing[field] ?? ''));
  if (privilegedChange && !['attendance.manage', 'attendance.approve_incidents', 'payroll.edit']
    .some(permission => hasPermission(access, permission))) {
    throw Object.assign(new Error('Solo un responsable autorizado puede validar el CITT o modificar la base sustentada'), { status: 403 });
  }
  return { data, medical };
}

export async function withMedicalFields(db, incidents) {
  const ids = incidents.filter(row => row.incident_type === 'Descanso Médico').map(row => row.id);
  if (!ids.length) return incidents;
  // to_jsonb permite seguir leyendo incidencias antiguas antes de aplicar el ALTER.
  const rows = await db.$queryRawUnsafe(`SELECT id,
    to_jsonb(i)->>'citt_number' AS citt_number,
    to_jsonb(i)->>'citt_status' AS citt_status,
    to_jsonb(i)->>'subsidy_daily_base' AS subsidy_daily_base,
    to_jsonb(i)->>'subsidy_daily_base_reason' AS subsidy_daily_base_reason
    FROM public.attendance_incident i WHERE id = ANY($1::text[])`, ids);
  const byId = new Map(rows.map(row => [row.id, {
    ...row, subsidy_daily_base: row.subsidy_daily_base == null ? null : Number(row.subsidy_daily_base),
  }]));
  return incidents.map(row => ({ ...row, ...byId.get(row.id) }));
}

export async function saveMedicalFields(db, incident, medical) {
  const fields = MEDICAL_FIELDS.filter(field => Object.hasOwn(medical, field));
  if (!fields.length) return incident;
  try {
    await db.$executeRawUnsafe(`UPDATE public.attendance_incident SET
      ${fields.map((field, index) => `"${field}" = $${index + 2}`).join(', ')}
      WHERE id = $1`, incident.id, ...fields.map(field => medical[field]));
  } catch (error) {
    if (error.meta?.code === '42703' || error.code === '42703') {
      throw Object.assign(new Error('Ejecute primero docs/sql/2026-11-17-medical-rest.sql'), { status: 503 });
    }
    throw error;
  }
  return { ...incident, ...medical };
}
