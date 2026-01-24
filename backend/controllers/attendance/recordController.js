import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

export const getAll = async (req, res) => {
  try {
    const { sort = '-date' } = req.query;
    const desc = sort.startsWith('-');
    const field = sort.replace('-', '');

    const records = await prisma.attendance_record.findMany({
      // include: {
        // employee: true,
        // schedule: true,
        // incidents: true
      // },
      orderBy: { date: 'desc' }
    });
    res.json(records);
  } catch (error) {
    console.error('Error obteniendo attendance record', error);
    res.status(500).json({ error: error.message });
  }
};

export const getById =  async (req, res) => {
  try {
    const record = await prisma.attendanceRecord.findUnique({
      where: { id: parseInt(req.params.id) },
      include: {
        employee: true,
        schedule: true,
        incidents: true
      }
    });
    if (!record) return res.status(404).json({ error: 'Record not found' });
    res.json(record);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const create = async (req, res) => {
  try {
    const record = await prisma.attendanceRecord.create({
      data: req.body
    });
    res.status(201).json(record);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const update = async (req, res) => {
  try {
    const record = await prisma.attendanceRecord.update({
      where: { id: parseInt(req.params.id) },
      data: req.body
    });
    res.json(record);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const remove = async (req, res) => {
  try {
    await prisma.attendanceRecord.delete({
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
