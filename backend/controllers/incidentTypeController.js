import { query } from "../config/database.js";
import { generate24HexId } from "../utils/idGenerator.js";

const TABLE_NAME = "incident_type";
const SORT_FIELDS = new Set(["name", "affectation", "is_active", "created_date", "updated_date"]);

const orderBy = (sort = "name") => {
  const desc = sort.startsWith("-");
  const field = sort.replace("-", "");
  const safeField = SORT_FIELDS.has(field) ? field : "name";
  return `${safeField} ${desc ? "DESC" : "ASC"}`;
};

const cleanPayload = (body = {}) => {
  const { id, created_date, updated_date, created_by_id, created_by, is_sample, ...data } = body;
  return data;
};

export const getAll = async (req, res) => {
  try {
    const { sort = "name" } = req.query;
    const result = await query(`SELECT * FROM ${TABLE_NAME} ORDER BY ${orderBy(sort)}`);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const getById = async (req, res) => {
  try {
    const result = await query(`SELECT * FROM ${TABLE_NAME} WHERE id = $1`, [req.params.id]);
    const record = result.rows[0];
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

    const result = await query(
      `INSERT INTO ${TABLE_NAME} (
        id, name, affectation, is_active, created_date, updated_date, created_by_id, created_by, is_sample
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *`,
      [
        generate24HexId(),
        data.name,
        data.affectation,
        data.is_active ?? true,
        new Date(),
        new Date(),
        userId,
        userEmail,
        false,
      ]
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const update = async (req, res) => {
  try {
    const data = cleanPayload(req.body);
    const fields = [];
    const values = [];
    let index = 1;

    ["name", "affectation", "is_active"].forEach((field) => {
      if (data[field] !== undefined) {
        fields.push(`${field} = $${index}`);
        values.push(data[field]);
        index++;
      }
    });

    fields.push(`updated_date = $${index}`);
    values.push(new Date());
    index++;
    values.push(req.params.id);

    const result = await query(
      `UPDATE ${TABLE_NAME}
       SET ${fields.join(", ")}
       WHERE id = $${index}
       RETURNING *`,
      values
    );
    const record = result.rows[0];
    if (!record) return res.status(404).json({ error: "Tipo de incidente no encontrado" });
    res.json(record);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const remove = async (req, res) => {
  try {
    const result = await query(`DELETE FROM ${TABLE_NAME} WHERE id = $1 RETURNING id`, [req.params.id]);
    if (!result.rows[0]) return res.status(404).json({ error: "Tipo de incidente no encontrado" });
    res.status(204).send();
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const filter = async (req, res) => {
  try {
    const { sort = "name" } = req.query;
    const filters = req.body || {};
    const conditions = [];
    const values = [];

    if (filters.name) {
      values.push(`%${filters.name}%`);
      conditions.push(`name ILIKE $${values.length}`);
    }
    if (filters.affectation) {
      values.push(filters.affectation);
      conditions.push(`affectation = $${values.length}`);
    }
    if (filters.is_active !== undefined) {
      values.push(filters.is_active);
      conditions.push(`is_active = $${values.length}`);
    }

    const where = conditions.length ? ` WHERE ${conditions.join(" AND ")}` : "";
    const result = await query(`SELECT * FROM ${TABLE_NAME}${where} ORDER BY ${orderBy(sort)}`, values);
    res.json(result.rows);
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
