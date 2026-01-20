import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

export const getAll = async (req, res) => {
  try {
    const payslips = await prisma.payslip.findMany({
      include: { employee: true },
      orderBy: [{ year: 'desc' }, { month: 'desc' }]
    });
    res.json(payslips);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const getById =  async (req, res) => {
  try {
    const payslip = await prisma.payslip.findUnique({
      where: { id: parseInt(req.params.id) },
      include: { employee: true }
    });
    if (!payslip) return res.status(404).json({ error: 'Payslip not found' });
    res.json(payslip);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const create = async (req, res) => {
  try {
    const payslip = await prisma.payslip.create({
      data: req.body
    });
    res.status(201).json(payslip);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const update = async (req, res) => {
  try {
    const payslip = await prisma.payslip.update({
      where: { id: parseInt(req.params.id) },
      data: req.body
    });
    res.json(payslip);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const remove = async (req, res) => {
  try {
    await prisma.payslip.delete({
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
