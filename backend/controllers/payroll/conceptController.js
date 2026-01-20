import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

export const getAll = async (req, res) => {
  try {
    const concepts = await prisma.payrollConcept.findMany({
      orderBy: { code: 'asc' }
    });
    res.json(concepts);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const getById =  async (req, res) => {
  try {
    const concept = await prisma.payrollConcept.findUnique({
      where: { id: parseInt(req.params.id) }
    });
    if (!concept) return res.status(404).json({ error: 'Concept not found' });
    res.json(concept);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const create = async (req, res) => {
  try {
    const concept = await prisma.payrollConcept.create({
      data: req.body
    });
    res.status(201).json(concept);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const update = async (req, res) => {
  try {
    const concept = await prisma.payrollConcept.update({
      where: { id: parseInt(req.params.id) },
      data: req.body
    });
    res.json(concept);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const remove = async (req, res) => {
  try {
    await prisma.payrollConcept.delete({
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
