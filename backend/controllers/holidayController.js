import { PrismaClient } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';

const prisma = new PrismaClient();

export const getAllHolidays = async (req, res) => {
  try {
    const { year } = req.query;

    const where = {};
    if (year) {
      const startDate = new Date(`${year}-01-01`);
      const endDate = new Date(`${year}-12-31`);
      where.date = {
        gte: startDate,
        lte: endDate
      };
    }

    const holidays = await prisma.holiday.findMany({
      where,
      orderBy: { date: 'asc' }
    });

    res.json(holidays);
  } catch (error) {
    console.error('Error al obtener feriados:', error);
    res.status(500).json({ error: 'Error al obtener feriados' });
  }
};

export const getHolidayById = async (req, res) => {
  try {
    const { id } = req.params;
    const holiday = await prisma.holiday.findUnique({
      where: { id }
    });

    if (!holiday) {
      return res.status(404).json({ error: 'Feriado no encontrado' });
    }

    res.json(holiday);
  } catch (error) {
    console.error('Error al obtener feriado:', error);
    res.status(500).json({ error: 'Error al obtener feriado' });
  }
};

export const createHoliday = async (req, res) => {
  try {
    const { name, date, type, is_mandatory, description } = req.body;

    const holiday = await prisma.holiday.create({
      data: {
        id: uuidv4(),
        name,
        date: new Date(date),
        type,
        is_mandatory: is_mandatory !== undefined ? is_mandatory : true,
        description,
        created_by_id: req.user?.id,
        created_by: req.user?.full_name,
        created_date: new Date(),
        updated_date: new Date()
      }
    });

    res.status(201).json(holiday);
  } catch (error) {
    console.error('Error al crear feriado:', error);
    res.status(500).json({ error: 'Error al crear feriado' });
  }
};

export const updateHoliday = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, date, type, is_mandatory, description } = req.body;

    const holiday = await prisma.holiday.update({
      where: { id },
      data: {
        name,
        date: date ? new Date(date) : undefined,
        type,
        is_mandatory,
        description,
        updated_date: new Date()
      }
    });

    res.json(holiday);
  } catch (error) {
    console.error('Error al actualizar feriado:', error);
    res.status(500).json({ error: 'Error al actualizar feriado' });
  }
};

export const deleteHoliday = async (req, res) => {
  try {
    const { id } = req.params;
    await prisma.holiday.delete({
      where: { id }
    });
    res.json({ message: 'Feriado eliminado correctamente' });
  } catch (error) {
    console.error('Error al eliminar feriado:', error);
    res.status(500).json({ error: 'Error al eliminar feriado' });
  }
};
