import prisma from "../../config/prisma.js";

import { generate24HexId } from '../../utils/idGenerator.js';
import { toDateString } from '../../utils/employmentDate.js';

const serializeSchedule = schedule => ({
  ...schedule,
  effective_from: toDateString(schedule.effective_from),
  effective_to: toDateString(schedule.effective_to),
});

const normalizeSite = value => String(value || '').trim().toLocaleLowerCase();

const isTemplateSchedule = schedule => (
  !schedule.employee_id &&
  !schedule.department_name &&
  !(Array.isArray(schedule.departments) && schedule.departments.length > 0)
);

const filterSchedulesForAccess = async (req, schedules) => {
  if (req.accessibleEmployeeIds === null) return schedules;

  const employees = await prisma.employee.findMany({
    where: { id: { in: req.accessibleEmployeeIds || [] } },
    select: { id: true, department_name: true, site: true },
  });
  const employeeIds = new Set(employees.map(employee => employee.id));
  const departments = new Set(employees.map(employee => employee.department_name).filter(Boolean));
  const sites = new Set(employees.map(employee => normalizeSite(employee.site)).filter(Boolean));

  return schedules.filter(schedule => {
    if (isTemplateSchedule(schedule)) {
      const templateSite = normalizeSite(schedule.site);
      return !templateSite || sites.has(templateSite);
    }
    if (schedule.employee_id) return employeeIds.has(schedule.employee_id);
    if (schedule.department_name && departments.has(schedule.department_name)) return true;
    return Array.isArray(schedule.departments) && schedule.departments.some(department => departments.has(department));
  });
};

const canAccessSchedule = async (req, schedule) => (
  (await filterSchedulesForAccess(req, [schedule])).length > 0
);

export const getAll = async (req, res) => {
  try {
    const schedules = await prisma.work_schedule.findMany({
      orderBy: { schedule_name: 'asc' }
    });
    const accessibleSchedules = await filterSchedulesForAccess(req, schedules);
    res.json(accessibleSchedules.map(serializeSchedule));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const getById =  async (req, res) => {
  try {
    const schedule = await prisma.work_schedule.findUnique({
      where: { id: req.params.id }
    });
    if (!schedule) return res.status(404).json({ error: 'Schedule not found' });
    if (!(await filterSchedulesForAccess(req, [schedule])).length) return res.status(403).json({ error: 'Acceso denegado al horario' });
    res.json(serializeSchedule(schedule));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const create = async (req, res) => {
  try {
    const { id, created_date, updated_date, created_by, effective_from, effective_to, ...data } = req.body;
    if (!(await canAccessSchedule(req, data))) return res.status(403).json({ error: 'Acceso denegado al horario' });
    const schedule = await prisma.work_schedule.create({
      data: {
        id: generate24HexId(),
        ...data,
        effective_from: effective_from ? new Date(effective_from) : null,
        effective_to: effective_to ? new Date(effective_to) : null,
      }
    });
    res.status(201).json(serializeSchedule(schedule));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const update = async (req, res) => {
  try {
    const { id, created_date, updated_date, created_by, effective_from, effective_to, ...data } = req.body;
    const existing = await prisma.work_schedule.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: 'Schedule not found' });
    if (!(await canAccessSchedule(req, existing)) || !(await canAccessSchedule(req, { ...existing, ...data }))) {
      return res.status(403).json({ error: 'Acceso denegado al horario' });
    }
    const schedule = await prisma.work_schedule.update({
      where: { id: req.params.id },
      data: {
        ...data,
        effective_from: effective_from ? new Date(effective_from) : null,
        effective_to: effective_to ? new Date(effective_to) : null,
      }
    });
    res.json(serializeSchedule(schedule));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const remove = async (req, res) => {
  try {
    const existing = await prisma.work_schedule.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: 'Schedule not found' });
    if (!(await canAccessSchedule(req, existing))) return res.status(403).json({ error: 'Acceso denegado al horario' });
    await prisma.work_schedule.delete({
      where: { id: req.params.id }
    });
    res.status(204).send();
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const filter = async (req, res) => {
  try {
    const { sort = 'schedule_name' } = req.query;
    const desc = sort.startsWith('-');
    const field = sort.replace('-', '');

    const filters = req.body || {};
    const where = {};

    if (filters.schedule_name) {
      where.schedule_name = {
        contains: filters.schedule_name,
        mode: 'insensitive',
      };
    }

    // if (filters.is_active !== undefined) {
      // where.is_active = filters.is_active;
    // }

    // if (filters.exempt_from_clocking !== undefined) {
      // where.exempt_from_clocking = filters.exempt_from_clocking;
    // }

    if (filters.employee_id) {
      where.employee_id = filters.employee_id;
    }

    if (filters.department_name) {
      where.department_name = filters.department_name;
    }

    const schedules = await prisma.work_schedule.findMany({
      where,
      orderBy: { [field]: desc ? 'desc' : 'asc' },
    });

    const accessibleSchedules = await filterSchedulesForAccess(req, schedules);
    res.json(accessibleSchedules.map(serializeSchedule));
  } catch (error) {
    console.error('Error filtering schedules:', error);
    res.status(500).json({ error: error.message });
  }
};

const controller = {
  getAll,
  getById,
  create,
  update,
  delete: remove, // aquí sí usamos la clave "delete"
  filter,
}

export default controller
