import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

const MODEL = prisma.vacation_request;

export const getAll = async (req, res) => {
  try {
    const requests = await MODEL.findMany({
      orderBy: { created_date: 'desc' },
      // include: { employee: true },
    });
    res.json(requests);
  } catch (error) {
    console.error('Error obteniendo vacation requests', error);
    res.status(500).json({ error: error.message });
  }
};

export const getById = async (req, res) => {
  try {
    const request = await MODEL.findUnique({
      where: { id: parseInt(req.params.id) },
      // include: { employee: true },
    });
    if (!request) return res.status(404).json({ error: 'Request not found' });
    res.json(request);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const create = async (req, res) => {
  try {
    const request = await MODEL.create({
      data: {
        employee_id: req.body.employee_id,
        start_date: req.body.start_date,
        end_date: req.body.end_date,
        // status: req.body.status ?? 'Pendiente',
      },
    });
    res.status(201).json(request);
  } catch (error) {
    console.error('Error creando vacation request', error);
    res.status(500).json({ error: error.message });
  }
};

export const update = async (req, res) => {
  try {
    const request = await MODEL.update({
      where: { id: parseInt(req.params.id) },
      data: req.body,
    });
    res.json(request);
  } catch (error) {
    console.error('Error actualizando vacation request', error);
    res.status(500).json({ error: error.message });
  }
};

export const remove = async (req, res) => {
  try {
    await MODEL.delete({
      where: { id: parseInt(req.params.id) },
    });
    res.status(204).send();
  } catch (error) {
    console.error('Error eliminando vacation request', error);
    res.status(500).json({ error: error.message });
  }
};

export const filter = async (req, res) => {
  try {
    const filters = req.body || {};
    const where = {};

    if (filters.employee_id && !Number.isNaN(Number(filters.employee_id))) {
      where.employee_id = parseInt(filters.employee_id);
    }
    // if (filters.status) {
      // where.status = filters.status;
    // }

    const requests = await MODEL.findMany({
      where,
      orderBy: { created_date: 'desc' },
      // include: { employee: true },
    });

    res.json(requests);
  } catch (error) {
    console.error('Error filtrando vacation requests', error);
    res.status(500).json({ error: error.message });
  }
};

const controller = {
  getAll,
  getById,
  create,
  update,
  delete: remove,
  filter,
};

export default controller;
