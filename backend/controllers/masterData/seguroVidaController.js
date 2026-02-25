import { PrismaClient } from '@prisma/client';
import { generate24HexId } from '../../utils/idGenerator.js';

const prisma = new PrismaClient();

export const getAll = async (req, res) => {
  try {
    const { sort = 'age_range_start' } = req.query;
    const desc = sort.startsWith('-');
    const field = desc ? sort.slice(1) : sort;

    const records = await prisma.segurovidaley.findMany({
      orderBy: { [field]: desc ? 'desc' : 'asc' },
    });

    res.json(records);
  } catch (error) {
    console.error('Error fetching seguro vida ley:', error);
    res.status(500).json({ error: error.message });
  }
};

export const getById = async (req, res) => {
  try {
    const { id } = req.params;

    const record = await prisma.segurovidaley.findUnique({
      where: { id },
    });

    if (!record) {
      return res.status(404).json({ error: 'Seguro Vida Ley not found' });
    }

    res.json(record);
  } catch (error) {
    console.error('Error fetching seguro vida ley by id:', error);
    res.status(500).json({ error: error.message });
  }
};

export const create = async (req, res) => {
  try {
    const {
      id,
      created_date,
      updated_date,
      created_by_id,
      created_by,
      is_sample,
      ...rest
    } = req.body;

    const currentUser = req.user;
    const userId = currentUser?.userId || currentUser?.id || 'system';
    const userEmail = currentUser?.email || 'system';

    const record = await prisma.segurovidaley.create({
      data: {
        id: generate24HexId(),
        ...rest,
        created_by_id: userId,
        created_by: userEmail,
        is_sample: false,
      },
    });

    res.status(201).json(record);
  } catch (error) {
    console.error('Error creating seguro vida ley:', error);
    res.status(500).json({ error: error.message });
  }
};

export const update = async (req, res) => {
  try {
    const { id } = req.params;

    const {
      created_date,
      created_by_id,
      created_by,
      is_sample,
      id: bodyId,
      ...rest
    } = req.body;

    const record = await prisma.segurovidaley.update({
      where: { id },
      data: { ...rest },
    });

    res.json(record);
  } catch (error) {
    console.error('Error updating seguro vida ley:', error);
    res.status(500).json({ error: error.message });
  }
};

export const remove = async (req, res) => {
  try {
    const { id } = req.params;

    await prisma.segurovidaley.delete({
      where: { id },
    });

    res.status(204).send();
  } catch (error) {
    console.error('Error deleting seguro vida ley:', error);
    res.status(500).json({ error: error.message });
  }
};

const controller = {
  getAll,
  getById,
  create,
  update,
  delete: remove,
};

export default controller;
