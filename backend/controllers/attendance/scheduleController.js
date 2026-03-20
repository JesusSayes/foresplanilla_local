import { PrismaClient } from '@prisma/client'
import { generate24HexId } from '../../utils/idGenerator.js';
const prisma = new PrismaClient()

export const getAll = async (req, res) => {
  try {
    const schedules = await prisma.work_schedule.findMany({
      orderBy: { schedule_name: 'asc' }
    });
    res.json(schedules);
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
    res.json(schedule);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const create = async (req, res) => {
  try {
    const { id, created_date, updated_date, created_by, ...data } = req.body;
    const schedule = await prisma.work_schedule.create({
      data: {
        id: generate24HexId(),
        ...data
      }
    });
    res.status(201).json(schedule);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const update = async (req, res) => {
  try {
    const { id, created_date, updated_date, created_by, ...data } = req.body;
    const schedule = await prisma.work_schedule.update({
      where: { id: req.params.id },
      data: req.body
    });
    res.json(schedule);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const remove = async (req, res) => {
  try {
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

    res.json(schedules);
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
