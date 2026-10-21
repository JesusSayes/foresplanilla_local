import { prepareLoanData, serializeLoanData } from "../../utils/loanData.js";
import prisma from "../../config/prisma.js";
import { canAccessEmployee, employeeScopeWhere } from "../../middleware/authorization.js";

export const getAll = async (req, res) => {
  try {
    const { sort = '-created_date' } = req.query;
    const desc = sort.startsWith('-');
    const field = sort.replace('-', '');
    const items = await prisma.loan.findMany({
      where: employeeScopeWhere(req),
      orderBy: { [field]: desc ? 'desc' : 'asc' }
    });
    res.json(serializeLoanData(items));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const getById = async (req, res) => {
  try {
    const item = await prisma.loan.findUnique({
      where: { id: req.params.id }
    });
    if (!item) return res.status(404).json({ error: 'Loan not found' });
    if (!canAccessEmployee(req, item.employee_id)) {
      return res.status(403).json({ error: 'Acceso denegado al empleado' });
    }
    res.json(serializeLoanData(item));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const create = async (req, res) => {
  try {
    if (req.body?.employee_id && !canAccessEmployee(req, req.body.employee_id)) {
      return res.status(403).json({ error: 'Acceso denegado al empleado' });
    }
    if (!Number.isInteger(req.body.total_installments) || req.body.total_installments < 1 || req.body.total_installments > 12) {
      return res.status(400).json({ error: 'El número de cuotas debe estar entre 1 y 12.' });
    }
    const item = await prisma.loan.create({ data: prepareLoanData(req.body, true) });
    res.status(201).json(serializeLoanData(item));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const update = async (req, res) => {
  try {
    const current = await prisma.loan.findUnique({
      where: { id: req.params.id }
    });
    if (!current) return res.status(404).json({ error: 'Loan not found' });
    if (!canAccessEmployee(req, current.employee_id) ||
        (req.body?.employee_id && !canAccessEmployee(req, req.body.employee_id))) {
      return res.status(403).json({ error: 'Acceso denegado al empleado' });
    }
    if (req.body.total_installments != null && (!Number.isInteger(req.body.total_installments) || req.body.total_installments < 1 || req.body.total_installments > 12)) {
      return res.status(400).json({ error: 'El número de cuotas debe estar entre 1 y 12.' });
    }
    const data = prepareLoanData(req.body);
    if (data.is_deleted === true) {
      data.deleted_at = new Date();
      data.deleted_by = req.user?.email || req.access?.employee?.email || '';
    }
    const item = await prisma.$transaction(async db => {
      const updated = await db.loan.update({ where: { id: req.params.id }, data });
      if (data.is_deleted === true) {
        await db.loaninstallment.updateMany({ where: { loan_id: current.id, status: 'Pendiente' }, data: { status: 'Omitido' } });
      }
      return updated;
    }, { isolationLevel: 'Serializable' });
    res.json(serializeLoanData(item));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const remove = async (req, res) => {
  try {
    const current = await prisma.loan.findUnique({
      where: { id: req.params.id }
    });
    if (!current) return res.status(404).json({ error: 'Loan not found' });
    if (!canAccessEmployee(req, current.employee_id)) {
      return res.status(403).json({ error: 'Acceso denegado al empleado' });
    }
    await prisma.$transaction(async db => {
      await db.loan.update({ where: { id: current.id }, data: {
        is_deleted: true, deleted_at: new Date(),
        deleted_by: req.user?.email || req.access?.employee?.email || '',
      } });
      await db.loaninstallment.updateMany({ where: { loan_id: current.id, status: 'Pendiente' }, data: { status: 'Omitido' } });
    }, { isolationLevel: 'Serializable' });
    res.status(204).send();
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const filter = async (req, res) => {
  try {
    const { sort = '-created_date' } = req.query;
    const filters = req.body || {};
    const desc = sort.startsWith('-');
    const field = sort.replace('-', '');
    const items = await prisma.loan.findMany({
      where: {
        ...filters,
        ...employeeScopeWhere(req),
      },
      orderBy: { [field]: desc ? 'desc' : 'asc' }
    });
    res.json(serializeLoanData(items));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const controller = { getAll, getById, create, update, delete: remove, filter };
export default controller;
