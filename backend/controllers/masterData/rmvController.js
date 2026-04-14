import prisma from "../../config/prisma.js";

import { generate24HexId } from '../../utils/idGenerator.js';

export const getAll = async (req, res) => {
  try {
    const { sort = '-effective_date' } = req.query;
    const desc = sort.startsWith('-');
    const field = desc ? sort.slice(1) : sort;

    const records = await prisma.rmv.findMany({
      orderBy: { [field]: desc ? 'desc' : 'asc' },
    });

    res.json(records);
  } catch (error) {
    console.error('Error fetching RMV records:', error);
    res.status(500).json({ error: error.message });
  }
};

export const getById = async (req, res) => {
  try {
    const { id } = req.params;

    const record = await prisma.rmv.findUnique({
      where: { id },
    });

    if (!record) {
      return res.status(404).json({ error: 'RMV not found' });
    }

    res.json(record);
  } catch (error) {
    console.error('Error fetching RMV by id:', error);
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
      effective_date,
      ...rest
    } = req.body;

    const currentUser = req.user;
    const userId = currentUser?.userId || currentUser?.id || 'system';
    const userEmail = currentUser?.email || 'system';

    const record = await prisma.rmv.create({
      data: {
        id: generate24HexId(),
        ...rest,
        effective_date: effective_date ? new Date(effective_date) : null,
        created_by_id: userId,
        created_by: userEmail,
        is_sample: false,
      },
    });

    res.status(201).json(record);
  } catch (error) {
    console.error('Error creating RMV:', error);
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
      effective_date,
      ...rest
    } = req.body;

    const record = await prisma.rmv.update({
      where: { id },
      data: {
        ...rest,
        effective_date: effective_date ? new Date(effective_date) : null,
      },
    });

    res.json(record);
  } catch (error) {
    console.error('Error updating RMV:', error);
    res.status(500).json({ error: error.message });
  }
};

export const remove = async (req, res) => {
  try {
    const { id } = req.params;

    await prisma.rmv.delete({
      where: { id },
    });

    res.status(204).send();
  } catch (error) {
    console.error('Error deleting RMV:', error);
    res.status(500).json({ error: error.message });
  }
};

export const filter = async (req, res) => {
  try {
    const { sort = '-effective_date' } = req.query;
    const desc = sort.startsWith('-');
    const field = desc ? sort.slice(1) : sort;
    const filters = req.body || {};

    const where = {};
    for (const [key, value] of Object.entries(filters)) {
      if (value !== undefined && value !== null && value !== '') {
        where[key] = value;
      }
    }

    const records = await prisma.rmv.findMany({
      where,
      orderBy: { [field]: desc ? 'desc' : 'asc' },
    });

    res.json(records);
  } catch (error) {
    console.error('Error filtering RMV records:', error);
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
};

export default controller;
