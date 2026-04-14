import prisma from "../../config/prisma.js";

import { generate24HexId } from '../../utils/idGenerator.js';

export const getAll = async (req, res) => {
  try {
    const { sort = 'cuenta' } = req.query;
    const desc = sort.startsWith('-');
    const field = desc ? sort.slice(1) : sort;

    const records = await prisma.accountingaccount.findMany({
      orderBy: { [field]: desc ? 'desc' : 'asc' },
    });

    res.json(records);
  } catch (error) {
    console.error('Error fetching accounting accounts:', error);
    res.status(500).json({ error: error.message });
  }
};

export const getById = async (req, res) => {
  try {
    const { id } = req.params;

    const record = await prisma.accountingaccount.findUnique({
      where: { id },
    });

    if (!record) {
      return res.status(404).json({ error: 'Accounting account not found' });
    }

    res.json(record);
  } catch (error) {
    console.error('Error fetching accounting account by id:', error);
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

    const record = await prisma.accountingaccount.create({
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
    console.error('Error creating accounting account:', error);
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

    const record = await prisma.accountingaccount.update({
      where: { id },
      data: {
        ...rest,
      },
    });

    res.json(record);
  } catch (error) {
    console.error('Error updating accounting account:', error);
    res.status(500).json({ error: error.message });
  }
};

export const remove = async (req, res) => {
  try {
    const { id } = req.params;

    await prisma.accountingaccount.delete({
      where: { id },
    });

    res.status(204).send();
  } catch (error) {
    console.error('Error deleting accounting account:', error);
    res.status(500).json({ error: error.message });
  }
};

export const filter = async (req, res) => {
  try {
    const { sort = 'cuenta', ...rawFilters } = req.query;
    const desc = sort.startsWith('-');
    const field = desc ? sort.slice(1) : sort;

    const where = {};

    Object.entries(rawFilters).forEach(([key, value]) => {
      if (value === undefined || value === null || value === '') return;

      if (value === 'true' || value === 'false') {
        where[key] = value === 'true';
      } else {
        where[key] = value;
      }
    });

    const records = await prisma.accountingaccount.findMany({
      where,
      orderBy: { [field]: desc ? 'desc' : 'asc' },
    });

    res.json(records);
  } catch (error) {
    console.error('Error filtering accounting accounts:', error);
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

export default controller;

