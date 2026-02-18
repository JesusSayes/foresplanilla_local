import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

export const getAll = async (req, res) => {
  try {
    const costCenters = await prisma.costCenter.findMany({
      orderBy: { code: 'asc' }
    });
    res.json(costCenters);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const getById =  async (req, res) => {
  try {
    const costCenter = await prisma.costCenter.findUnique({
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
    const costCenter = await prisma.costCenter.create({
      data: req.body
    });
    res.status(201).json(costCenter);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const update = async (req, res) => {
  try {
    const costCenter = await prisma.costCenter.update({
      where: { id: parseInt(req.params.id) },
      data: req.body
    });
    res.json(costCenter);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const remove = async (req, res) => {
  try {
    await prisma.costCenter.delete({
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
