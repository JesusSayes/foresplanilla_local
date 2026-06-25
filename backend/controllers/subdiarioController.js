import prisma from "../config/prisma.js";
import { generate24HexId } from "../utils/idGenerator.js";

const SORT_FIELDS = new Set(["codigo", "descripcion", "nombre_breve", "apertura", "codigo_sunat", "estado", "created_date", "updated_date"]);
const WRITABLE_FIELDS = ["codigo", "descripcion", "nombre_breve", "apertura", "codigo_sunat", "estado"];

const parseSort = (sort = "codigo") => {
  const desc = sort.startsWith("-");
  const field = desc ? sort.slice(1) : sort;
  return { [SORT_FIELDS.has(field) ? field : "codigo"]: desc ? "desc" : "asc" };
};

const cleanPayload = (body = {}) => {
  const data = {};
  WRITABLE_FIELDS.forEach((field) => {
    if (body[field] !== undefined) data[field] = body[field];
  });
  return data;
};

const buildWhere = (filters = {}) => {
  const where = {};
  WRITABLE_FIELDS.forEach((field) => {
    if (filters[field] !== undefined && filters[field] !== null && filters[field] !== "") {
      where[field] = filters[field];
    }
  });
  return where;
};

export const getAll = async (req, res) => {
  try {
    const records = await prisma.subdiario.findMany({
      orderBy: parseSort(req.query.sort),
    });
    res.json(records);
  } catch (error) {
    console.error("Error fetching subdiarios:", error);
    res.status(500).json({ error: error.message });
  }
};

export const getById = async (req, res) => {
  try {
    const record = await prisma.subdiario.findUnique({ where: { id: req.params.id } });
    if (!record) return res.status(404).json({ error: "Subdiario no encontrado" });
    res.json(record);
  } catch (error) {
    console.error("Error fetching subdiario:", error);
    res.status(500).json({ error: error.message });
  }
};

export const create = async (req, res) => {
  try {
    const data = cleanPayload(req.body);
    if (!data.codigo || !data.descripcion) {
      return res.status(400).json({ error: "codigo y descripcion son requeridos" });
    }

    const currentUser = req.user;
    const record = await prisma.subdiario.create({
      data: {
        id: generate24HexId(),
        ...data,
        estado: data.estado || "A",
        created_date: new Date(),
        updated_date: new Date(),
        created_by_id: currentUser?.userId || currentUser?.id || "system",
        created_by: currentUser?.email || "system",
        is_sample: false,
      },
    });
    res.status(201).json(record);
  } catch (error) {
    console.error("Error creating subdiario:", error);
    res.status(500).json({ error: error.message });
  }
};

export const update = async (req, res) => {
  try {
    const record = await prisma.subdiario.update({
      where: { id: req.params.id },
      data: {
        ...cleanPayload(req.body),
        updated_date: new Date(),
      },
    });
    res.json(record);
  } catch (error) {
    console.error("Error updating subdiario:", error);
    res.status(500).json({ error: error.message });
  }
};

export const remove = async (req, res) => {
  try {
    await prisma.subdiario.delete({ where: { id: req.params.id } });
    res.status(204).send();
  } catch (error) {
    console.error("Error deleting subdiario:", error);
    res.status(500).json({ error: error.message });
  }
};

export const filter = async (req, res) => {
  try {
    const records = await prisma.subdiario.findMany({
      where: buildWhere(req.body || {}),
      orderBy: parseSort(req.query.sort),
    });
    res.json(records);
  } catch (error) {
    console.error("Error filtering subdiarios:", error);
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
