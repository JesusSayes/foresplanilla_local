import prisma from "../../config/prisma.js";

import { generate24HexId } from '../../utils/idGenerator.js';
import { canAccessEmployee } from "../../middleware/authorization.js";

export const getAll = async (req, res) => {
  try {
    const incidents = await prisma.attendance_incident.findMany({
      where: req.accessibleEmployeeIds === null ? {} : { employee_id: { in: req.accessibleEmployeeIds } },
      orderBy: { created_date: 'desc' }
    });
    res.json(incidents);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const filter = async (req, res) => {
  try {
    const { sort = '-created_date' } = req.query;
    const filters = req.body || {};

    // Mapea filtros simples a where de Prisma
    const where = {};
    if (req.accessibleEmployeeIds !== null) where.employee_id = { in: req.accessibleEmployeeIds };

    if (filters.employee_id) {
      if (!canAccessEmployee(req, filters.employee_id)) return res.status(403).json({ error: 'Acceso denegado al empleado' });
      where.employee_id = filters.employee_id;
    }

    if (filters.status) {
      where.status = filters.status;
    }

    if (filters.incident_type) {
      where.incident_type = filters.incident_type;
    }

    // rango de fechas (ajusta nombres de campos a tu schema)
    if (filters.date_from || filters.date_to) {
      where.incident_date = {};
      if (filters.date_from) where.incident_date.gte = new Date(filters.date_from);
      if (filters.date_to)   where.incident_date.lte = new Date(filters.date_to);
    }

    // sort: "-created_date" → createdAt desc, "created_date" → createdAt asc
    let orderBy = { created_date: 'desc' };
    if (sort) {
      const desc = sort.startsWith('-');
      const field = sort.replace('-', '');
      // mapea nombre lógico a campo real
      const sortField =
        field === 'created_date' ? 'created_date' :
        field === 'incident_date' ? 'incident_date' :
        field; // fallback

      orderBy = { [sortField]: desc ? 'desc' : 'asc' };
    }

    const incidents = await prisma.attendance_incident.findMany({
      where,
      orderBy
    });

    res.json(incidents);
  } catch (error) {
    console.error('Error filtrando incidents', error);
    res.status(500).json({ error: error.message });
  }
};

export const getById =  async (req, res) => {
  try {
    const incident = await prisma.attendance_incident.findUnique({
      where: { id: req.params.id },
      include: { attendance: true }
    });
    if (!incident) return res.status(404).json({ error: 'Incident not found' });
    if (!canAccessEmployee(req, incident.employee_id)) return res.status(403).json({ error: 'Acceso denegado al empleado' });
    res.json(incident);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const create = async (req, res) => {
  try {
    const { id, created_date, updated_date, created_by, incident_date, review_date,...data } = req.body;
    if (!canAccessEmployee(req, data.employee_id)) return res.status(403).json({ error: 'Acceso denegado al empleado' });
    const incident = await prisma.attendance_incident.create({
      data: {
        id: generate24HexId(),
        incident_date: new Date(incident_date),
        review_date: review_date ? new Date(review_date) : null,
        ...data
      }
    });
    res.status(201).json(incident);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const update = async (req, res) => {
  try {
    const existing = await prisma.attendance_incident.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: 'Incident not found' });
    if (!canAccessEmployee(req, existing.employee_id)) return res.status(403).json({ error: 'Acceso denegado al empleado' });
    const { review_date, ...data } = req.body;
    if (data.employee_id && !canAccessEmployee(req, data.employee_id)) return res.status(403).json({ error: 'Acceso denegado al empleado' });

    const incident = await prisma.attendance_incident.update({
      where: { id: req.params.id },
      data: {
        ...data,
        ...(review_date && { review_date: new Date(review_date) })
      }
    });
    res.json(incident);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const remove = async (req, res) => {
  try {
    const existing = await prisma.attendance_incident.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: 'Incident not found' });
    if (!canAccessEmployee(req, existing.employee_id)) return res.status(403).json({ error: 'Acceso denegado al empleado' });
    await prisma.attendance_incident.delete({
      where: { id: req.params.id }
    });
    res.status(204).send();
  } catch (error) {
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
