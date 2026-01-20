// const { PrismaClient } = require('@prisma/client');
// const prisma = new PrismaClient();

import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

// exports.getAll = async (req, res) => {
export const getAll = async (req, res) => {
  try {
    const balances = await prisma.vacationBalance.findMany({
      include: { employee: true },
      orderBy: { year: 'desc' }
    });
    res.json(balances);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const getById =  async (req, res) => {
  try {
    const balance = await prisma.vacationBalance.findUnique({
      where: { id: parseInt(req.params.id) },
      include: { employee: true }
    });
    if (!balance) return res.status(404).json({ error: 'Balance not found' });
    res.json(balance);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const create = async (req, res) => {
  try {
    const balance = await prisma.vacationBalance.create({
      data: req.body
    });
    res.status(201).json(balance);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const update = async (req, res) => {
  try {
    const balance = await prisma.vacationBalance.update({
      where: { id: parseInt(req.params.id) },
      data: req.body
    });
    res.json(balance);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const remove = async (req, res) => {
  try {
    await prisma.vacationBalance.delete({
      where: { id: parseInt(req.params.id) }
    });
    res.status(204).send();
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
}

export default controller
