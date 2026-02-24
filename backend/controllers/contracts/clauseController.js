import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

export const getAll = async (req, res) => {
  try {
    const clauses = await prisma.contract_clause.findMany({
      // include: { contract: true },
      orderBy: { contract_order: 'asc' }
    });
    res.json(clauses);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const getById =  async (req, res) => {
  try{
    const clause = await prisma.contract_clause.findUnique({
      where: { id: parseInt(req.params.id) },
      include: { contract: true }
    });
    if (!clause) return res.status(404).json({ error: 'Clause not found' });
    res.json(clause);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const create = async (req, res) => {
  try {
    const clause = await prisma.contract_clause.create({
      data: req.body
    });
    res.status(201).json(clause);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const update = async (req, res) => {
  try {
    const clause = await prisma.contract_clause.update({
      where: { id: parseInt(req.params.id) },
      data: req.body
    });
    res.json(clause);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const remove = async (req, res) => {
  try {
    await prisma.contractClause.delete({
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
