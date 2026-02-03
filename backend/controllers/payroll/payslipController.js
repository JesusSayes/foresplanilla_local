import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

const MODEL = prisma.payslip;

export const getAll = async (req, res) => {
  try {
    // const { sort = '-created_date' } = req.query;

    // const desc = sort.startsWith('-');
    // const field = sort.replace('-', '');

    // const sortField =
      // field === 'created_date' ? 'created_date' :
      // field === 'payment_date' ? 'payment_date' :
      // field;
    const desc = true;
    const sortField = 'id'

    const payslips = await MODEL.findMany({
      orderBy: { [sortField]: desc ? 'desc' : 'asc' },
    });
    res.json(payslips);
  } catch (error) {
    console.error('Error obteniendo payslips', error);
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

export const filter = async (req, res) => {
  try {
    const { sort = '-year,-month' } = req.query;
    const filters = req.body || {};

    const where = {};

    if (filters.employee_id) {
      where.employee_id = filters.employee_id;
    }

    // Parse sort: "-year,-month"
    // const sortParts = sort.split(',');
    // const orderBy = sortParts.map((part) => {
      // const desc = part.startsWith('-');
      // const field = part.replace('-', '');
      // return { [field]: desc ? 'desc' : 'asc' };
    // });
    const sortParts = 'id';
    const desc = true;
    const field = 'desc';

    const payslips = await entitiesAPI.Payslip.findMany({
      where,
      orderBy,
    });

    res.json(payslips);
  } catch (error) {
    console.error('Error filtrando payslips', error);
    res.status(500).json({ error: error.message });
  }
};

const controller = {
  getAll,
  getById,
  create,
  update,
  delete: remove, // aquí sí usamos la clave "delete"
  filter,
}

export default controller
