import prisma from "../config/prisma.js";
import { generate24HexId } from '../utils/idGenerator.js';

export const getAll = async (req, res) => {
  try {
    const { sort = '-fecha_registro' } = req.query;
    const desc = sort.startsWith('-');
    const field = desc ? sort.slice(1) : sort;

    const records = await prisma.asiento_contable.findMany({
      orderBy: { [field]: desc ? 'desc' : 'asc' },
    });

    res.json(records);
  } catch (error) {
    console.error('Error fetching asientos contables:', error);
    res.status(500).json({ error: error.message });
  }
};

export const getById = async (req, res) => {
  try {
    const { id } = req.params;

    const record = await prisma.asiento_contable.findUnique({
      where: { id },
    });

    if (!record) {
      return res.status(404).json({ error: 'Asiento contable not found' });
    }

    res.json(record);
  } catch (error) {
    console.error('Error fetching asiento contable by id:', error);
    res.status(500).json({ error: error.message });
  }
};

export const create = async (req, res) => {
  try {
    const {
      id,
      created_date,
      updated_date,
      created_by_id,
      created_by,
      is_sample,
      ...rest
    } = req.body;

    const currentUser = req.user;
    const userId = currentUser?.userId || currentUser?.id || 'system';
    const userEmail = currentUser?.email || 'system';

    const record = await prisma.asiento_contable.create({
      data: {
        id: generate24HexId(),
        ...rest,
        created_by_id: userId,
        created_by: userEmail,
        is_sample: false,
      },
    });

    res.status(201).json(record);
  } catch (error) {
    console.error('Error creating asiento contable:', error);
    res.status(500).json({ error: error.message });
  }
};

export const update = async (req, res) => {
  try {
    const { id } = req.params;

    const {
      created_date,
      created_by_id,
      created_by,
      is_sample,
      id: bodyId,
      ...rest
    } = req.body;

    const record = await prisma.asiento_contable.update({
      where: { id },
      data: {
        ...rest,
      },
    });

    res.json(record);
  } catch (error) {
    console.error('Error updating asiento contable:', error);
    res.status(500).json({ error: error.message });
  }
};

export const remove = async (req, res) => {
  try {
    const { id } = req.params;

    await prisma.asiento_contable.delete({
      where: { id },
    });

    res.status(204).send();
  } catch (error) {
    console.error('Error deleting asiento contable:', error);
    res.status(500).json({ error: error.message });
  }
};

export const filter = async (req, res) => {
  try {
    const { sort = '-fecha_registro', ...rawFilters } = req.query;
    const desc = sort.startsWith('-');
    const field = desc ? sort.slice(1) : sort;

    const where = {};

    Object.entries(rawFilters).forEach(([key, value]) => {
      if (value === undefined || value === null || value === '') return;

      if (value === 'true' || value === 'false') {
        where[key] = value === 'true';
      } else {
        where[key] = value;
      }
    });

    const records = await prisma.asiento_contable.findMany({
      where,
      orderBy: { [field]: desc ? 'desc' : 'asc' },
    });

    res.json(records);
  } catch (error) {
    console.error('Error filtering asientos contables:', error);
    res.status(500).json({ error: error.message });
  }
};

export const bulkCreate = async (req, res) => {
  try {
    const asientos = req.body;

    if (!Array.isArray(asientos)) {
      return res.status(400).json({ error: 'Request body must be an array of asientos' });
    }

    const currentUser = req.user;
    const userId = currentUser?.userId || currentUser?.id || 'system';
    const userEmail = currentUser?.email || 'system';

    const asientosToCreate = asientos.map(({ id, created_date, updated_date, created_by_id, created_by, is_sample, ...rest }) => {
      const data = {
        id: generate24HexId(),
        ...rest,
        created_by_id: userId,
        created_by: userEmail,
        is_sample: false,
      };

      if (data.fecha_doc && typeof data.fecha_doc === 'string') {
        data.fecha_doc = new Date(data.fecha_doc);
      }
      if (data.fecha_vencimiento && typeof data.fecha_vencimiento === 'string') {
        data.fecha_vencimiento = new Date(data.fecha_vencimiento);
      }
      if (data.fecha_registro && typeof data.fecha_registro === 'string') {
        data.fecha_registro = new Date(data.fecha_registro);
      }

      return data;
    });

    const result = await prisma.$transaction(
      asientosToCreate.map(data =>
        prisma.asiento_contable.create({ data })
      )
    );

    res.status(201).json(result);
  } catch (error) {
    console.error('Error bulk creating asientos contables:', error);
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
  bulkCreate,
}

export default controller;
