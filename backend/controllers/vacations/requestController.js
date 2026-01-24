import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

export const getAll = async (req, res) => {
  try {
    // const { sort = '-created_date' } = req.query;
    // const desc = sort.startsWith('-');
    // const field = sort.replace('-', '');

    // mapea nombre lógico a campo real del modelo - actualizar tabla
    // const sortField =
      // field === 'created_date' ? 'created_date' :
      // field === 'request_date' ? 'request_date' :
      // field;
    const sortField = 'id';

    const requests = await prisma.vacatin_request.findMany({
      // orderBy: { [sortField]: desc ? 'desc' : 'asc' },
      orderBy: { [sortField]: 'desc' },
    });
    res.json(requests);
  } catch (error) {
    console.error('Error obteniendo vacation requests', error);
    res.status(500).json({ error: error.message });
  }
};

export const getById =  async (req, res) => {
  try {
    const request = await prisma.vacationRequest.findUnique({
      where: { id: parseInt(req.params.id) },
      include: { employee: true }
    });
    if (!request) return res.status(404).json({ error: 'Request not found' });
    res.json(request);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const create = async (req, res) => {
  try {
    const request = await prisma.vacationRequest.create({
      data: req.body
    });
    res.status(201).json(request);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const update = async (req, res) => {
  try {
    const request = await prisma.vacationRequest.update({
      where: { id: parseInt(req.params.id) },
      data: req.body
    });
    res.json(request);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const remove = async (req, res) => {
  try {
    await prisma.vacationRequest.delete({
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
