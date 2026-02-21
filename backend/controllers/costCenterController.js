import { PrismaClient } from '@prisma/client'
import { generate24HexId } from '../utils/idGenerator.js';

const prisma = new PrismaClient()

export const getAll = async (req, res) => {
  try {
    const costCenters = await prisma.cost_center.findMany({ orderBy: { code: 'asc' } });
    res.json(costCenters);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const getById = async (req, res) => {
  try {
    const costCenter = await prisma.cost_center.findUnique({ where: { id: req.params.id } });
    if (!costCenter) return res.status(404).json({ error: 'Cost center not found' });
    res.json(costCenter);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const create = async (req, res) => {
  try {
    const currentUser = req.user;
    const userId = currentUser?.userId || 'system';
    const userEmail = currentUser?.email || 'system';

    const { category_id, category, code, name, is_active } = req.body;

    let categoryName = category || null;
    if (category_id) {
      const cat = await prisma.costcentercategory.findUnique({ where: { id: category_id }, select: { name: true } });
      if (cat) categoryName = cat.name;
    }

    const costCenter = await prisma.cost_center.create({
      data: {
        id: generate24HexId(),
        code: code || null,
        name: name || null,
        category: categoryName,
        is_active: is_active ?? true,
        created_by_id: userId,
        created_by: userEmail,
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
    const { category_id, category, code, name, is_active } = req.body;

    let categoryName = category || null;
    if (category_id) {
      const cat = await prisma.costcentercategory.findUnique({ where: { id: category_id }, select: { name: true } });
      if (cat) categoryName = cat.name;
    }

    const costCenter = await prisma.cost_center.update({
      where: { id: req.params.id },
      data: { code: code || null, name: name || null, category: categoryName, is_active: is_active ?? true }
    });
    res.json(costCenter);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const remove = async (req, res) => {
  try {
    await prisma.cost_center.delete({ where: { id: req.params.id } });
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
    const costCenters = await prisma.cost_center.findMany({
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
  delete: remove,
  filter,
}

export default controller
