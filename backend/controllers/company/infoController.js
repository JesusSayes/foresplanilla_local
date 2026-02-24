import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

export const getAll = async (req, res) => {
  try {
    const companies = await prisma.company_info.findMany({
      orderBy: { created_date: 'desc' }
    });
    res.json(companies);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const getById =  async (req, res) => {
  try {
    const company = await prisma.company_info.findUnique({
      where: { id: req.params.id }
    });
    if (!company) return res.status(404).json({ error: 'Company not found' });
    res.json(company);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const create = async (req, res) => {
  try {
    const company = await prisma.company_info.create({
      data: req.body
    });
    res.status(201).json(company);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const update = async (req, res) => {
  try {
    const company = await prisma.company_info.update({
      where: { id: req.params.id },
      data: req.body
    });
    res.json(company);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const remove = async (req, res) => {
  try {
    await prisma.company_info.delete({
      where: { id: req.params.id }
    });
    res.status(204).send();
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const filter = async (req, res) => {
  try {
    const { sort = '-created_date' } = req.query;
    const desc = sort.startsWith('-');
    const field = sort.replace('-', '');

    const companies = await prisma.company_info.findMany({
      orderBy: { [field]: desc ? 'desc' : 'asc' }
    });

    res.json(companies);
  } catch (error) {
    console.error('Error filtering company info:', error);
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
