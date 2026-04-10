import prisma from "../../config/prisma.js";

export const getAll = async (req, res) => {
  try {
    const concepts = await prisma.payroll_concept.findMany({
      // orderBy: { code: 'asc' }
      orderBy: { created_date: 'asc' }
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

export const filter = async (req, res) => {
  try {
    const {
      status,    // ?status=Activo
      code,      // ?code=ABC (contains)
      sort = '-created_date'  // Hereda patrón company_info
    } = req.query;

    const desc = sort.startsWith('-');
    const field = sort.replace('-', '');

    const concepts = await prisma.payroll_concept.findMany({
      where: {
        ...(status && { status }),
        ...(code && { code: { contains: code, mode: 'insensitive' } })  // Búsqueda parcial
      },
      orderBy: {
        [field]: desc ? 'desc' : 'asc'
      }
    });

    res.json(concepts);
  } catch (error) {
    console.error('Error filtering payroll concepts:', error);
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
