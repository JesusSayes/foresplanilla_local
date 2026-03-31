import { PrismaClient } from '@prisma/client'
import crypto from 'crypto';

const prisma = new PrismaClient()

const serializeRecord = (r) => ({
  ...r,
  date: r.date ? r.date.toISOString().slice(0, 10) : null,
  worked_hours:       r.worked_hours       != null ? Number(r.worked_hours)       : null,
  regular_hours:      r.regular_hours      != null ? Number(r.regular_hours)      : null,
  overtime_hours_25:  r.overtime_hours_25  != null ? Number(r.overtime_hours_25)  : null,
  overtime_hours_35:  r.overtime_hours_35  != null ? Number(r.overtime_hours_35)  : null,
});

export const getAll = async (req, res) => {
  try {
    const { sort = '-date' } = req.query;
    const desc = sort.startsWith('-');
    const field = sort.replace('-', '');

    const records = await prisma.attendance_record.findMany({
      orderBy: { [field]: desc ? 'desc' : 'asc' }
    });
    res.json(records.map(serializeRecord));
  } catch (error) {
    console.error('Error obteniendo attendance record', error);
    res.status(500).json({ error: error.message });
  }
};

export const getById =  async (req, res) => {
  try {
    const record = await prisma.attendance_record.findUnique({
      where: { id: req.params.id },
      // include: { employee: true, schedule: true, incidents: true }
    });
    if (!record) return res.status(404).json({ error: 'Record not found' });
    res.json(serializeRecord(record));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const generateId = () => crypto.randomBytes(12).toString('hex'); // 24 chars

export const create = async (req, res) => {
  try {
    console.log('AttendanceRecord.create body:', req.body);

    const data = req.body || {};
    const now = new Date();

    const record = await prisma.attendance_record.create({
      data: {
        id: data.id || generateId(), // id similar a los existentes
        employee_id: data.employee_id,
        date: data.date ? new Date(data.date) : null,
        clock_in: data.clock_in,
        clock_out: data.clock_out,
        scheduled_start: data.scheduled_start,
        scheduled_end: data.scheduled_end,
        worked_hours: data.worked_hours,
        is_late: data.is_late ?? false,
        late_minutes: data.late_minutes ?? 0,
        is_absent: data.is_absent ?? false,
        status: data.status,
        notes: data.notes,
        created_date: data.created_date ? new Date(data.created_date) : now,
        updated_date: data.updated_date ? new Date(data.updated_date) : now,
        created_by_id: data.created_by_id ?? null,
        created_by: data.created_by ?? null,
        is_sample: data.is_sample ?? false,
      },
    });
    res.status(201).json(serializeRecord(record));
  } catch (error) {
    console.error('Error en AttendanceRecord.create:', error);
    res.status(500).json({ error: error.message });
  }
};

export const update = async (req, res) => {
  try {
    const record = await prisma.attendance_record.update({
      where: { id: req.params.id },
      data: req.body
    });
    res.json(serializeRecord(record));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const remove = async (req, res) => {
  try {
    await prisma.attendance_record.delete({
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

    const filters = req.body || {};
    const where = {};

    // log de lo que llega
    console.log('AttendanceRecord.filter body:', req.body);

    // date exacto (string yyyy-MM-dd)
    if (filters.date) {
      const dateStr = filters.date;
      where.date = {
        gte: new Date(dateStr + 'T00:00:00.000Z'),
        lte: new Date(dateStr + 'T23:59:59.999Z'),
      };
    }

    if (filters.employee_id) {
      where.employee_id = filters.employee_id;
    }

    if (filters.status) {
      where.status = filters.status;
    }

    const records = await prisma.attendance_record.findMany({
      where,
      orderBy: { [field]: desc ? 'desc' : 'asc' }
    });

    res.json(records.map(serializeRecord));
  } catch (error) {
    console.error('Filter records error:', error);
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
