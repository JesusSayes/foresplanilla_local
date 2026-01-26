import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

export const getAll = async (req, res) => {
  try {
    const balances = await prisma.vacation_balance.findMany({
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
    const balance = await prisma.vacation_balance.findUnique({
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
    const balance = await prisma.vacation_balance.create({
      data: req.body
    });
    res.status(201).json(balance);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const update = async (req, res) => {
  try {
    const balance = await prisma.vacation_balance.update({
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
    await prisma.vacation_balance.delete({
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
