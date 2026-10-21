import { canAccessEmployee, employeeScopeWhere } from "../../middleware/authorization.js";
import { prepareLoanData, serializeLoanData } from "../../utils/loanData.js";
import prisma from "../../config/prisma.js";

const scopeWhere = async req => {
  const loans = await prisma.loan.findMany({ where: employeeScopeWhere(req), select: { id: true } });
  return { loan_id: { in: loans.map(l => l.id) } };
};

const canAccessLoan = async (req, loanId) => {
  const loan = loanId ? await prisma.loan.findUnique({ where: { id: loanId } }) : null;
  return loan && canAccessEmployee(req, loan.employee_id);
};

export const getAll = async (req, res) => {
  try {
    const { sort = '-created_date' } = req.query;
    const desc = sort.startsWith('-');
    const field = sort.replace('-', '');
    const items = await prisma.loaninstallment.findMany({
      where: await scopeWhere(req),
      orderBy: { [field]: desc ? 'desc' : 'asc' }
    });
    res.json(serializeLoanData(items));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const getById = async (req, res) => {
  try {
    const item = await prisma.loaninstallment.findUnique({
      where: { id: req.params.id }
    });
    if (!item) return res.status(404).json({ error: 'LoanInstallment not found' });
    if (!await canAccessLoan(req, item.loan_id)) return res.status(403).json({ error: 'Acceso denegado al préstamo' });
    res.json(serializeLoanData(item));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const create = async (req, res) => {
  try {
    if (!await canAccessLoan(req, req.body.loan_id)) return res.status(403).json({ error: 'Acceso denegado al préstamo' });
    const item = await prisma.loaninstallment.create({ data: prepareLoanData(req.body, true) });
    res.status(201).json(serializeLoanData(item));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const update = async (req, res) => {
  try {
    const current = await prisma.loaninstallment.findUnique({ where: { id: req.params.id } });
    if (!current) return res.status(404).json({ error: 'LoanInstallment not found' });
    if (!await canAccessLoan(req, current.loan_id) || (req.body?.loan_id && !await canAccessLoan(req, req.body.loan_id))) {
      return res.status(403).json({ error: 'Acceso denegado al préstamo' });
    }
    const item = await prisma.loaninstallment.update({
      where: { id: req.params.id },
      data: prepareLoanData(req.body)
    });
    res.json(serializeLoanData(item));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const remove = async (req, res) => {
  try {
    const current = await prisma.loaninstallment.findUnique({ where: { id: req.params.id } });
    if (!current) return res.status(404).json({ error: 'LoanInstallment not found' });
    if (!await canAccessLoan(req, current.loan_id) || (req.body?.loan_id && !await canAccessLoan(req, req.body.loan_id))) {
      return res.status(403).json({ error: 'Acceso denegado al préstamo' });
    }
    await prisma.loaninstallment.delete({ where: { id: req.params.id } });
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
    const items = await prisma.loaninstallment.findMany({
      where: { AND: [filters, await scopeWhere(req)] },
      orderBy: { [field]: desc ? 'desc' : 'asc' }
    });
    res.json(serializeLoanData(items));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const controller = { getAll, getById, create, update, delete: remove, filter };
export default controller;
