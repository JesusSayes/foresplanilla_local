import { attendanceDateFilter } from '../../utils/attendanceDateFilter.js';
import { syncOvertimeAlert } from '../../services/overtimeAlertSync.js';
import { toDateString } from '../../utils/employmentDate.js';
import prisma from "../../config/prisma.js";

import { generate24HexId } from '../../utils/idGenerator.js'
import { canAccessEmployee } from "../../middleware/authorization.js";

// Leer los campos nuevos por SQL hasta que Prisma se actualice manualmente.
const withResolution = async alerts => {
  if (!alerts.length) return alerts;
  const rows = await prisma.$queryRawUnsafe(
    `SELECT id, resolved_by, resolution_date, resolution_notes FROM public.overtime_alert WHERE id IN (${alerts.map((_, i) => `$${i + 1}`).join(', ')})`,
    ...alerts.map(alert => alert.id)
  );
  const byId = new Map(rows.map(row => [row.id, row]));
  return alerts.map(alert => ({
    ...alert, ...byId.get(alert.id),
    alert_date: toDateString(alert.alert_date),
    overtime_hours: Number(alert.overtime_hours),
    resolution_date: toDateString(byId.get(alert.id)?.resolution_date || alert.resolution_date),
  }));
};

export const getAll = async (req, res) => {
  try {
    const alerts = await prisma.overtime_alert.findMany({
      where: req.accessibleEmployeeIds === null ? {} : { employee_id: { in: req.accessibleEmployeeIds } },
      orderBy: { created_date: 'desc' }
    })

    res.json(await withResolution(alerts))
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
}

export const getById = async (req, res) => {
  try {
    const alert = await prisma.overtime_alert.findUnique({
      where: { id: req.params.id }
    })

    if (!alert) return res.status(404).json({ error: 'Alert not found' })
    if (!canAccessEmployee(req, alert.employee_id)) return res.status(403).json({ error: 'Acceso denegado al empleado' })

    res.json((await withResolution([alert]))[0])
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
}

export const create = async (req, res) => {
  try {

    const userEmail = req.user?.email || 'system';
    const { alert_date, ...data } = req.body
    if (!canAccessEmployee(req, data.employee_id)) return res.status(403).json({ error: 'Acceso denegado al empleado' })

    const alert = await prisma.overtime_alert.create({
      data: {
        id: generate24HexId(),
        alert_date: new Date(alert_date),

        ...data,

        created_date: new Date(),
        updated_date: new Date(),
        created_by: userEmail,
      }
    })

    res.status(201).json(alert)

  } catch (error) {
    res.status(500).json({ error: error.message })
  }
}

export const update = async (req, res) => {
  try {
    const existing = await prisma.overtime_alert.findUnique({ where: { id: req.params.id } })
    if (!existing) return res.status(404).json({ error: 'Alert not found' })
    if (!canAccessEmployee(req, existing.employee_id)) return res.status(403).json({ error: 'Acceso denegado al empleado' })

    const { created_date, created_by, resolved_by, resolution_date, resolution_notes, ...data } = req.body
    const resolution = { resolved_by, resolution_date, resolution_notes }
    const resolutionFields = Object.keys(resolution).filter(field => resolution[field] !== undefined)
    if (resolutionFields.some(field => resolution[field] !== null && typeof resolution[field] !== 'string')) {
      return res.status(400).json({ error: 'Datos de resolución no válidos' })
    }
    if (resolution_date != null && (!/^\d{4}-\d{2}-\d{2}$/.test(resolution_date) || Number.isNaN(Date.parse(resolution_date)))) {
      return res.status(400).json({ error: 'Fecha de resolución no válida' })
    }
    if (data.employee_id && !canAccessEmployee(req, data.employee_id)) return res.status(403).json({ error: 'Acceso denegado al empleado' })

    const alert = await prisma.$transaction(async tx => {
      const updated = await tx.overtime_alert.update({
        where: { id: req.params.id },
        data: { ...data, updated_date: new Date() }
      })
      if (!resolutionFields.length) return updated
      const rows = await tx.$queryRawUnsafe(
        `UPDATE public.overtime_alert SET ${resolutionFields.map((field, index) => `"${field}" = $${index + 1}${field === 'resolution_date' ? '::date' : ''}`).join(', ')} WHERE id = $${resolutionFields.length + 1} RETURNING *`,
        ...resolutionFields.map(field => resolution[field]), req.params.id
      )
      return rows[0]
    })

    res.json(alert)

  } catch (error) {
    res.status(500).json({ error: error.message })
  }
}

export const remove = async (req, res) => {
  try {
    const existing = await prisma.overtime_alert.findUnique({ where: { id: req.params.id } })
    if (!existing) return res.status(404).json({ error: 'Alert not found' })
    if (!canAccessEmployee(req, existing.employee_id)) return res.status(403).json({ error: 'Acceso denegado al empleado' })

    await prisma.overtime_alert.delete({
      where: { id: req.params.id }
    })

    res.status(204).send()

  } catch (error) {
    res.status(500).json({ error: error.message })
  }
}

export const filter = async (req, res) => {
  try {

    const filters = req.body || {}

    const where = {}
    if (req.accessibleEmployeeIds !== null) where.employee_id = { in: req.accessibleEmployeeIds }

    if (filters.employee_id) {
      if (!canAccessEmployee(req, filters.employee_id)) return res.status(403).json({ error: 'Acceso denegado al empleado' })
      where.employee_id = filters.employee_id
    }

    if (filters.attendance_record_id) where.attendance_record_id = filters.attendance_record_id

    if (filters.status)
      where.status = filters.status

    const alerts = await prisma.overtime_alert.findMany({
      where,
      orderBy: { created_date: 'desc' }
    })

    res.json(await withResolution(alerts))

  } catch (error) {
    res.status(500).json({ error: error.message })
  }
}

// Una sola petición del navegador; filtrar antes de consultar y procesar.
export const generate = async (req, res) => {
  try {
    const where = req.accessibleEmployeeIds === null ? {} : { employee_id: { in: req.accessibleEmployeeIds || [] } };
    if (req.body?.date !== undefined) {
      try { where.date = attendanceDateFilter(req.body.date); }
      catch (error) { return res.status(400).json({ error: error.message }); }
    }
    const records = await prisma.attendance_record.findMany({ where, select: { id: true, employee_id: true } });
    const [employees, schedules] = await Promise.all([
      prisma.employee.findMany({ where: { id: { in: [...new Set(records.map(r => r.employee_id))] } } }),
      prisma.work_schedule.findMany({ where: { is_active: true } }),
    ]);
    const context = { employees: new Map(employees.map(e => [e.id, e])), schedules };
    for (const record of records) await syncOvertimeAlert(record.id, req.user?.email, context);
    const pending = await prisma.overtime_alert.count({ where: {
      ...(where.employee_id ? { employee_id: where.employee_id } : {}),
      ...(where.date ? { alert_date: where.date } : {}), status: 'Pendiente',
    } });
    return res.json({ total: records.length, pending });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

export default {
  generate,
  getAll,
  getById,
  create,
  update,
  delete: remove,
  filter
}
