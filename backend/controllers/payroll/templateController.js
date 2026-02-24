import { PrismaClient } from '@prisma/client'
import { generate24HexId } from '../../utils/idGenerator.js';

const prisma = new PrismaClient()

const JSON_FIELDS = [
  'header_fields',
  'employee_info_fields',
  'work_period_fields',
  'income_section',
  'discount_section',
  'employer_contribution_section',
  'footer_fields',
];

const parseJsonFields = (data) => {
  const parsed = { ...data };
  for (const field of JSON_FIELDS) {
    if (field in parsed && typeof parsed[field] === 'string') {
      try {
        parsed[field] = JSON.parse(parsed[field]);
      } catch {
        // leave as-is if already valid
      }
    }
  }
  return parsed;
};

export const getAll = async (req, res) => {
  try {
    const templates = await prisma.payslip_template.findMany({
      orderBy: { created_date: 'desc' }
    });
    res.json(templates);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const getById = async (req, res) => {
  try {
    const template = await prisma.payslip_template.findUnique({
      where: { id: req.params.id }
    });
    if (!template) return res.status(404).json({ error: 'Template not found' });
    res.json(template);
  } catch (error) {
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

    const data = parseJsonFields(rest);

    const template = await prisma.payslip_template.create({
      data: {
        id: generate24HexId(),
        ...data,
        created_by_id: userId,
        created_by: userEmail,
        is_sample: false,
        created_date: new Date(),
        updated_date: new Date(),
      }
    });
    res.status(201).json(template);
  } catch (error) {
    console.error('Error creating payslip template:', error);
    res.status(500).json({ error: error.message });
  }
};

export const update = async (req, res) => {
  try {
    const {
      id: bodyId,
      created_date,
      created_by_id,
      created_by,
      is_sample,
      ...rest
    } = req.body;

    const data = parseJsonFields(rest);

    const template = await prisma.payslip_template.update({
      where: { id: req.params.id },
      data: {
        ...data,
        updated_date: new Date(),
      }
    });
    res.json(template);
  } catch (error) {
    console.error('Error updating payslip template:', error);
    res.status(500).json({ error: error.message });
  }
};

export const remove = async (req, res) => {
  try {
    await prisma.payslip_template.delete({
      where: { id: req.params.id }
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
