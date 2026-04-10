import prisma from "../config/prisma.js";

import { generate24HexId } from '../utils/idGenerator.js';

export const getAll = async (req, res) => {
  try {
    const logs = await prisma.cost_center_change_log.findMany({
      orderBy: { change_date: 'desc' }
    });
    res.json(logs);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const getById = async (req, res) => {
  try {
    const log = await prisma.cost_center_change_log.findUnique({ where: { id: req.params.id } });
    if (!log) return res.status(404).json({ error: 'Log not found' });
    res.json(log);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const create = async (req, res) => {
  try {
    const { id, created_date, updated_date, created_by_id, created_by, is_sample, ...rest } = req.body;
    const log = await prisma.cost_center_change_log.create({
      data: {
        id: generate24HexId(),
        ...rest,
        is_sample: false,
      }
    });
    res.status(201).json(log);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const update = async (req, res) => {
  try {
    const { id, created_date, created_by_id, created_by, is_sample, ...rest } = req.body;
    const log = await prisma.cost_center_change_log.update({
      where: { id: req.params.id },
      data: { ...rest }
    });
    res.json(log);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const remove = async (req, res) => {
  try {
    await prisma.cost_center_change_log.delete({ where: { id: req.params.id } });
    res.status(204).send();
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const filter = async (req, res) => {
  try {
    const { sort = '-change_date' } = req.query;
    const desc = sort.startsWith('-');
    const field = sort.replace('-', '');
    const filters = req.body || {};
    const where = {};
    if (filters.cost_center_id) where.cost_center_id = filters.cost_center_id;
    if (filters.assignment_id) where.assignment_id = filters.assignment_id;
    const logs = await prisma.cost_center_change_log.findMany({
      where,
      orderBy: { [field]: desc ? 'desc' : 'asc' }
    });
    res.json(logs);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const controller = { getAll, getById, create, update, delete: remove, filter }
export default controller
