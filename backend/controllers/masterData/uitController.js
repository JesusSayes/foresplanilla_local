import prisma from "../../config/prisma.js";

import { generate24HexId } from '../../utils/idGenerator.js';

export const getAll = async (req, res) => {
  try {
    const { sort = '-year' } = req.query;
    const desc = sort.startsWith('-');
    const field = desc ? sort.slice(1) : sort;

    const records = await prisma.uit.findMany({
      orderBy: { [field]: desc ? 'desc' : 'asc' },
    });

    res.json(records);
  } catch (error) {
    console.error('Error fetching UIT records:', error);
    res.status(500).json({ error: error.message });
  }
};

export const getById = async (req, res) => {
  try {
    const { id } = req.params;

    const record = await prisma.uit.findUnique({
      where: { id },
    });

    if (!record) {
      return res.status(404).json({ error: 'UIT not found' });
    }

    res.json(record);
  } catch (error) {
    console.error('Error fetching UIT by id:', error);
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

    const record = await prisma.uit.create({
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
    console.error('Error creating UIT:', error);
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

    const record = await prisma.uit.update({
      where: { id },
      data: { ...rest },
    });

    res.json(record);
  } catch (error) {
    console.error('Error updating UIT:', error);
    res.status(500).json({ error: error.message });
  }
};

export const remove = async (req, res) => {
  try {
    const { id } = req.params;

    await prisma.uit.delete({
      where: { id },
    });

    res.status(204).send();
  } catch (error) {
    console.error('Error deleting UIT:', error);
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
