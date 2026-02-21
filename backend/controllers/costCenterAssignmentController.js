import { PrismaClient } from '@prisma/client'
import { generate24HexId } from '../utils/idGenerator.js';

const prisma = new PrismaClient()

export const getAll = async (req, res) => {
  try {
    const assignments = await prisma.cost_center_assignment.findMany({
      orderBy: { created_date: 'desc' }
    });
    res.json(assignments);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const getById = async (req, res) => {
  try {
    const assignment = await prisma.cost_center_assignment.findUnique({ where: { id: req.params.id } });
    if (!assignment) return res.status(404).json({ error: 'Assignment not found' });
    res.json(assignment);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const create = async (req, res) => {
  try {
    const currentUser = req.user;
    const { cost_center_id, assignment_type, employee_id, department_name, percentage, start_date, end_date, is_active, notes } = req.body;
    const assignment = await prisma.cost_center_assignment.create({
      data: {
        id: generate24HexId(),
        cost_center_id: cost_center_id || null,
        assignment_type: assignment_type || null,
        employee_id: employee_id || null,
        department_name: department_name || null,
        percentage: percentage ? parseInt(percentage) : null,
        start_date: start_date ? new Date(start_date) : null,
        end_date: end_date || null,
        is_active: is_active ?? true,
        notes: notes || null,
        created_by_id: currentUser?.userId || 'system',
        created_by: currentUser?.email || 'system',
        is_sample: false,
      }
    });
    res.status(201).json(assignment);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const update = async (req, res) => {
  try {
    const { cost_center_id, assignment_type, employee_id, department_name, percentage, start_date, end_date, is_active, notes } = req.body;
    const assignment = await prisma.cost_center_assignment.update({
      where: { id: req.params.id },
      data: {
        cost_center_id: cost_center_id || null,
        assignment_type: assignment_type || null,
        employee_id: employee_id || null,
        department_name: department_name || null,
        percentage: percentage ? parseInt(percentage) : null,
        start_date: start_date ? new Date(start_date) : null,
        end_date: end_date || null,
        is_active: is_active ?? true,
        notes: notes || null,
      }
    });
    res.json(assignment);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const remove = async (req, res) => {
  try {
    await prisma.cost_center_assignment.delete({ where: { id: req.params.id } });
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
    if (filters.cost_center_id) where.cost_center_id = filters.cost_center_id;
    if (filters.is_active !== undefined) where.is_active = filters.is_active;
    if (filters.assignment_type) where.assignment_type = filters.assignment_type;
    const assignments = await prisma.cost_center_assignment.findMany({
      where,
      orderBy: { [field]: desc ? 'desc' : 'asc' }
    });
    res.json(assignments);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const controller = { getAll, getById, create, update, delete: remove, filter }
export default controller
