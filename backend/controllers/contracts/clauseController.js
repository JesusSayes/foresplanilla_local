import prisma from "../../config/prisma.js";
import { generate24HexId } from '../../utils/idGenerator.js';

const present = clause => ({ ...clause, order: clause.contract_order, type: clause.contract_type });
const clauseData = body => {
  const data = {};
  for (const field of ['title', 'content', 'contract_types', 'is_active', 'category', 'contract_order', 'contract_type']) {
    if (field in body) data[field] = body[field];
  }
  if ('order' in body) data.contract_order = body.order;
  if ('type' in body) data.contract_type = body.type;
  data.updated_date = new Date();
  return data;
};

// Asigna posiciones únicas y guarda todo el movimiento en una transacción.
export const reorder = async (req, res) => {
  const ids = req.body?.ids;
  if (!Array.isArray(ids) || !ids.length || ids.some(id => typeof id !== 'string' || !id) || new Set(ids).size !== ids.length) {
    return res.status(400).json({ error: 'Lista de cláusulas no válida' });
  }
  try {
    await prisma.$transaction(ids.map((id, index) => prisma.contract_clause.update({
      where: { id }, data: { contract_order: index, updated_date: new Date() }
    })));
    res.status(204).send();
  } catch (error) {
    res.status(error.code === 'P2025' ? 404 : 500).json({ error: 'No se pudo reordenar las cláusulas' });
  }
};

export const getAll = async (req, res) => {
  try {
    const clauses = await prisma.contract_clause.findMany({
      // include: { contract: true },
      orderBy: [{ contract_order: 'asc' }, { id: 'asc' }]
    });
    res.json(clauses.map(present));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const getById =  async (req, res) => {
  try{
    const clause = await prisma.contract_clause.findUnique({
      where: { id: req.params.id }
    });
    if (!clause) return res.status(404).json({ error: 'Clause not found' });
    res.json(present(clause));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const create = async (req, res) => {
  try {
    const clause = await prisma.contract_clause.create({
      data: { ...clauseData(req.body), id: generate24HexId(), created_date: new Date(), created_by_id: req.user.userId || req.user.id, created_by: req.user.email }
    });
    res.status(201).json(present(clause));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const update = async (req, res) => {
  try {
    const clause = await prisma.contract_clause.update({
      where: { id: req.params.id },
      data: clauseData(req.body)
    });
    res.json(present(clause));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const remove = async (req, res) => {
  try {
    await prisma.contract_clause.delete({
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
