import { PrismaClient } from '@prisma/client'
import { generate24HexId } from '../utils/idGenerator.js';

const prisma = new PrismaClient()

export const getAll = async (req, res) => {
  try {
    const costCenters = await prisma.cost_center.findMany({
      orderBy: { code: 'asc' }
    });
    res.json(costCenters);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const getById =  async (req, res) => {
  try {
    const costCenter = await prisma.cost_center.findUnique({
      where: { id: parseInt(req.params.id) }
    });
    if (!costCenter) return res.status(404).json({ error: 'Cost center not found' });
    res.json(costCenter);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const create = async (req, res) => {
  try {
    const { id, created_date, updated_date, created_by_id, created_by, is_sample,...rest } = req.body; // ignorar id del cliente si viene

    const currentUser = req.user; // viene del middleware de auth
    const userId = currentUser?.userId || 'system';
    const userEmail = currentUser?.email || 'system';

    const costCenter = await prisma.cost_center.create({
      data: {
        id: generate24HexId(),
        ...rest,
        created_by_id: userId,
        created_by: userEmail,
        // created_date se llena con @default(now())
        // updated_date se llena con @updatedAt
        is_sample: false,
      }
    });
    res.status(201).json(costCenter);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const update = async (req, res) => {
  try {
    const { created_date, created_by_id, created_by, is_sample, id, ...rest } = req.body;

    const costCenter = await prisma.cost_center.update({
      where: { id: req.params.id },
      data: {
        ...rest,
      }
    });
    res.json(costCenter);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const remove = async (req, res) => {
  try {
    await prisma.cost_center.delete({
      where: { id: parseInt(req.params.id) }
    });
    res.status(204).send();
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const filter = async (req, res) => {
  try {
    const { sort = '-code' } = req.query;
    const desc = sort.startsWith('-');
    const field = sort.replace('-', '');

    const costCenters = await prisma.cost_center.findMany({  // Ajusta modelo
      orderBy: { [field]: desc ? 'desc' : 'asc' }
    });
    res.json(costCenters);
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
