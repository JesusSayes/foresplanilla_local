import prisma from "../config/prisma.js";
import { generate24HexId } from "../utils/idGenerator.js";

const MODEL = () => prisma.incident_type;

const cleanPayload = (body = {}) => {
  const { id, created_date, updated_date, created_by_id, created_by, is_sample, ...data } = body;
  return data;
};

export const getAll = async (req, res) => {
  try {
    const { sort = "name" } = req.query;
    const desc = sort.startsWith("-");
    const field = sort.replace("-", "");
    const records = await MODEL().findMany({
      orderBy: { [field]: desc ? "desc" : "asc" },
    });
    res.json(records);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const getById = async (req, res) => {
  try {
    const record = await MODEL().findUnique({ where: { id: req.params.id } });
    if (!record) return res.status(404).json({ error: "Tipo de incidente no encontrado" });
    res.json(record);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const create = async (req, res) => {
  try {
    const userId = req.user?.id || req.user?.userId || "system";
    const userEmail = req.user?.email || "system";
    const data = cleanPayload(req.body);

    if (!data.name || !data.affectation) {
      return res.status(400).json({ error: "name y affectation son requeridos" });
    }

    const record = await MODEL().create({
      data: {
        id: generate24HexId(),
        ...data,
        is_active: data.is_active ?? true,
        created_date: new Date(),
        updated_date: new Date(),
        created_by_id: userId,
        created_by: userEmail,
        is_sample: false,
      },
    });
    res.status(201).json(record);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const update = async (req, res) => {
  try {
    const record = await MODEL().update({
      where: { id: req.params.id },
      data: {
        ...cleanPayload(req.body),
        updated_date: new Date(),
      },
    });
    res.json(record);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const remove = async (req, res) => {
  try {
    await MODEL().delete({ where: { id: req.params.id } });
    res.status(204).send();
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const filter = async (req, res) => {
  try {
    const { sort = "name" } = req.query;
    const desc = sort.startsWith("-");
    const field = sort.replace("-", "");
    const filters = req.body || {};
    const where = {};

    if (filters.name) where.name = { contains: filters.name, mode: "insensitive" };
    if (filters.affectation) where.affectation = filters.affectation;
    if (filters.is_active !== undefined) where.is_active = filters.is_active;

    const records = await MODEL().findMany({
      where,
      orderBy: { [field]: desc ? "desc" : "asc" },
    });
    res.json(records);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export default {
  getAll,
  getById,
  create,
  update,
  delete: remove,
  filter,
};
