import prisma from "../config/prisma.js";

import { generate24HexId } from '../utils/idGenerator.js';

export const getAll = async (req, res) => {
  try {
    const { sort = 'code' } = req.query;
    const desc = sort.startsWith('-');
    const field = sort.replace('-', '');
    const categories = await prisma.costcentercategory.findMany({
      orderBy: { [field]: desc ? 'desc' : 'asc' }
    });
    res.json(categories);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const getById = async (req, res) => {
  try {
    const category = await prisma.costcentercategory.findUnique({
      where: { id: req.params.id }
    });
    if (!category) return res.status(404).json({ error: 'Category not found' });
    res.json(category);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const create = async (req, res) => {
  try {
    const { id, created_date, updated_date, created_by_id, created_by, is_sample, ...rest } = req.body;
    const currentUser = req.user;
    const userId = currentUser?.userId || 'system';
    const userEmail = currentUser?.email || 'system';
    const category = await prisma.costcentercategory.create({
      data: {
        id: generate24HexId(),
        ...rest,
        created_by_id: userId,
        created_by: userEmail,
        is_sample: false,
      }
    });
    res.status(201).json(category);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const update = async (req, res) => {
  try {
    const { id, created_date, updated_date, created_by_id, created_by, is_sample, ...rest } = req.body;
    const category = await prisma.costcentercategory.update({
      where: { id: req.params.id },
      data: { ...rest }
    });
    res.json(category);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const remove = async (req, res) => {
  try {
    await prisma.costcentercategory.delete({
      where: { id: req.params.id }
    });
    res.status(204).send();
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const filter = async (req, res) => {
  try {
    const { sort = 'code' } = req.query;
    const desc = sort.startsWith('-');
    const field = sort.replace('-', '');
    const filters = req.body || {};
    const where = {};

    if (filters.name) where.name = { contains: filters.name, mode: 'insensitive' };
    if (filters.code) where.code = { contains: filters.code, mode: 'insensitive' };
    if (filters.is_active !== undefined) where.is_active = filters.is_active;

    const categories = await prisma.costcentercategory.findMany({
      where,
      orderBy: { [field]: desc ? 'desc' : 'asc' }
    });
    res.json(categories);
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
