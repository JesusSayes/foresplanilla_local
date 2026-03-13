import { PrismaClient } from '@prisma/client'
import { generate24HexId } from '../../utils/idGenerator.js';
const prisma = new PrismaClient()

export const getAll = async (req, res) => {
  try {
    const incidents = await prisma.attendance_incident.findMany({
      // include: { attendance: true },
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

    if (filters.employee_id) {
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
    res.json(incident);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const create = async (req, res) => {
  try {
    const { id, created_date, updated_date, created_by, incident_date, review_date,...data } = req.body;
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
    const { review_date, ...data } = req.body;

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
