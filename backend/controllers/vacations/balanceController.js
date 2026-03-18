import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

const MODEL = prisma.vacation_balance;

export const getAll = async (req, res) => {
  try {
    const balances = await MODEL.findMany({
      // include: { employee: true }, // solo si tienes relación definida
      orderBy: { year: 'desc' }
    });
    res.json(balances);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const getById = async (req, res) => {
  try {
    const balance = await MODEL.findUnique({
      where: { id: req.params.id },
      // include: { employee: true }
    });
    if (!balance) return res.status(404).json({ error: 'Balance not found' });
    res.json(balance);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const create = async (req, res) => {
  try {
    const balance = await MODEL.create({
      data: req.body
    });
    res.status(201).json(balance);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const update = async (req, res) => {
  try {
    const balance = await MODEL.update({
      where: { id: req.params.id },
      data: req.body
    });
    res.json(balance);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const remove = async (req, res) => {
  try {
    await MODEL.delete({
      where: { id: req.params.id }
    });
    res.status(204).send();
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const filter = async (req, res) => {
  try {
    const filters = req.body || {};
    const where = {};

    if (filters.employee_id && !Number.isNaN(Number(filters.employee_id))) {
      where.employee_id = Number(filters.employee_id);
    }
    if (filters.is_active !== undefined) {
      where.is_active = filters.is_active;
    }

    const balances = await MODEL.findMany({
      where,
      orderBy: { period_start: 'desc' }, // ajusta al campo real que tengas
      // include: { employee: true },
    });

    res.json(balances);
  } catch (error) {
    console.error('Error filtrando vacation balances', error);
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
