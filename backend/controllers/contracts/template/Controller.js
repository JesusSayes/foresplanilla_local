import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export const getAll = async (req, res) => {
  try {
    const templates = await prisma.contract_template.findMany({
      orderBy: { created_date: 'desc' }
    });
    res.json(templates);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const getById = async (req, res) => {
  try {
    const template = await prisma.contract_template.findUnique({
      where: { id: parseInt(req.params.id) }
    });
    if (!template) return res.status(404).json({ error: 'Template not found' });
    res.json(template);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const create = async (req, res) => {
  try {
    const template = await prisma.contract_template.create({
      data: req.body
    });
    res.status(201).json(template);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const update = async (req, res) => {
  try {
    const template = await prisma.contract_template.update({
      where: { id: parseInt(req.params.id) },
      data: req.body
    });
    res.json(template);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const deleteTemplate = async (req, res) => {
  try {
    await prisma.contract_template.delete({
      where: { id: parseInt(req.params.id) }
    });
    res.status(204).send();
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const filter = async (req, res) => {
  try {
    const { filters, sort, pagination } = req.body;
    const where = {};

    if (filters) {
      Object.keys(filters).forEach(key => {
        if (filters[key]) where[key] = { contains: filters[key] };
      });
    }

    const templates = await prisma.contract_template.findMany({
      where,
      orderBy: sort || { created_date: 'desc' },
      skip: pagination?.offset || 0,
      take: pagination?.limit || 50
    });

    res.json(templates);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const controller = {
  getAll,
  getById,
  create,
  update,
  delete: deleteTemplate,
  filter,
};

export default controller;
