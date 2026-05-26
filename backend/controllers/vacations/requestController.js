import prisma from "../../config/prisma.js";

import { generate24HexId } from '../../utils/idGenerator.js'
import { parseDate, pick } from '../../utils/date.util.js';

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
      where: { id: req.params.id },
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
    const userEmail = req.user?.email || 'system';

    const {
      start_date,
      end_date,
      approved_date,
      ...data
    } = req.body;

    const parsedStart = parseDate(start_date);
    const parsedEnd = parseDate(end_date);
    const parsedApproved = parseDate(approved_date);

    if (!parsedStart || !parsedEnd) {
      return res.status(400).json({ error: 'Fechas inválidas (start_date / end_date)' });
    }

    const request = await MODEL.create({
      data: {
        id: generate24HexId(),

        ...pick(data, [
          'employee_id',
          'request_type',
          'total_days',
          'business_days',
          'reason',
          'supporting_document_url',
          'comments',
          'status',
          'approved_by',
          'rejection_reason',
          'is_sample'
        ]),

        start_date: parsedStart,
        end_date: parsedEnd,
        approved_date: parsedApproved,

        status: data.status ?? 'Pendiente',

        created_date: new Date(),
        updated_date: new Date(),
        created_by: userEmail,
        created_by_id: req.user?.id,
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
    const {
      created_date,
      created_by,
      created_by_id,
      start_date,
      end_date,
      approved_date,
      ...data
    } = req.body;

    const parsedStart = parseDate(start_date);
    const parsedEnd = parseDate(end_date);
    const parsedApproved = parseDate(approved_date);

    // Reglas de negocio (clave)
    if (data.status === 'Aprobada') {
      if (!parsedApproved || !data.approved_by) {
        return res.status(400).json({
          error: 'Para aprobar se requiere approved_date y approved_by'
        });
      }
    }

    // if (data.status === 'Rechazada') {
      // if (!data.rejection_reason) {
        // return res.status(400).json({
          // error: 'Para rechazar se requiere rejection_reason'
        // });
      // }
    // }

    const request = await MODEL.update({
      where: { id: req.params.id },
      data: {
        ...pick(data, [
          'employee_id',
          'request_type',
          'total_days',
          'business_days',
          'reason',
          'supporting_document_url',
          'comments',
          'status',
          'approved_by',
          'rejection_reason',
          'is_sample'
        ]),

        ...(parsedStart && { start_date: parsedStart }),
        ...(parsedEnd && { end_date: parsedEnd }),
        ...(approved_date !== undefined && { approved_date: parsedApproved }),

        updated_date: new Date(),
      },
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
      where: { id: req.params.id },
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

    if (filters.employee_id) {
      where.employee_id = filters.employee_id;
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
