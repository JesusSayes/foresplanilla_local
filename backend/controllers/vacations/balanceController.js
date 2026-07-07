import prisma from "../../config/prisma.js";
import { canAccessEmployee, employeeScopeWhere, requireEmployeeAccess } from "../../middleware/authorization.js";

const MODEL = prisma.vacation_balance;

export const getAll = async (req, res) => {
  try {
    const balances = await MODEL.findMany({
      where: employeeScopeWhere(req),
      // include: { employee: true }, // solo si tienes relación definida
      orderBy: { year: 'desc' }
    });
    res.json(balances);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const getById = async (req, res) => {
  try {
    const balance = await MODEL.findUnique({
      where: { id: req.params.id },
      // include: { employee: true }
    });
    if (!balance) return res.status(404).json({ error: 'Balance not found' });
    if (!canAccessEmployee(req, balance.employee_id)) {
      return res.status(403).json({ error: 'Acceso denegado al empleado' });
    }
    res.json(balance);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const create = async (req, res) => {
  try {
    if (!requireEmployeeAccess(req, res, req.body?.employee_id)) return;

    const balance = await MODEL.create({
      data: req.body
    });
    res.status(201).json(balance);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const update = async (req, res) => {
  try {
    const existing = await MODEL.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: 'Balance not found' });
    if (!canAccessEmployee(req, existing.employee_id)) {
      return res.status(403).json({ error: 'Acceso denegado al empleado' });
    }
    if (req.body?.employee_id && !canAccessEmployee(req, req.body.employee_id)) {
      return res.status(403).json({ error: 'Acceso denegado al empleado' });
    }

    const balance = await MODEL.update({
      where: { id: req.params.id },
      data: req.body
    });
    res.json(balance);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const remove = async (req, res) => {
  try {
    const existing = await MODEL.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: 'Balance not found' });
    if (!canAccessEmployee(req, existing.employee_id)) {
      return res.status(403).json({ error: 'Acceso denegado al empleado' });
    }

    await MODEL.delete({
      where: { id: req.params.id }
    });
    res.status(204).send();
  } catch (error) {
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
    if (filters.is_active !== undefined) {
      where.is_active = filters.is_active;
    }
    Object.assign(where, employeeScopeWhere(req));

    const balances = await MODEL.findMany({
      where,
      orderBy: { period_start: 'desc' }, // ajusta al campo real que tengas
      // include: { employee: true },
    });

    res.json(balances);
  } catch (error) {
    console.error('Error filtrando vacation balances', error);
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
