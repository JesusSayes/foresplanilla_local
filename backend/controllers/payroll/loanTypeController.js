import { prepareLoanData, serializeLoanData } from "../../utils/loanData.js";
import prisma from "../../config/prisma.js";

export const getAll = async (req, res) => {
  try {
    const { sort = '-created_date' } = req.query;
    const desc = sort.startsWith('-');
    const field = sort.replace('-', '');
    const items = await prisma.loantype.findMany({
      orderBy: { [field]: desc ? 'desc' : 'asc' }
    });
    res.json(serializeLoanData(items));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const getById = async (req, res) => {
  try {
    const item = await prisma.loantype.findUnique({
      where: { id: req.params.id }
    });
    if (!item) return res.status(404).json({ error: 'LoanType not found' });
    res.json(serializeLoanData(item));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const create = async (req, res) => {
  try {
    const item = await prisma.loantype.create({ data: prepareLoanData(req.body, true) });
    res.status(201).json(serializeLoanData(item));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const update = async (req, res) => {
  try {
    const item = await prisma.loantype.update({
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
    await prisma.loantype.delete({ where: { id: req.params.id } });
    res.status(204).send();
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const filter = async (req, res) => {
  try {
    const { sort = '-created_date', ...filters } = req.query;
    const desc = sort.startsWith('-');
    const field = sort.replace('-', '');
    const items = await prisma.loantype.findMany({
      where: filters,
      orderBy: { [field]: desc ? 'desc' : 'asc' }
    });
    res.json(serializeLoanData(items));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const controller = { getAll, getById, create, update, delete: remove, filter };
export default controller;
