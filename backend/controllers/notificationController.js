import { query } from "../config/database.js";
import { hasPermission } from "../middleware/authorization.js";
import { generate24HexId } from "../utils/idGenerator.js";

const TABLE = "notification";
const FIELDS = [
  "user_email",
  "employee_id",
  "type",
  "title",
  "message",
  "link",
  "link_page",
  "is_read",
  "priority",
  "related_entity_id",
  "related_entity_type",
];

const isAdmin = (req) => hasPermission(req.access, "system.admin");
const currentEmployeeId = (req) => req.access?.employee?.id;
const currentEmail = (req) => req.user?.email;

const cleanData = (data = {}) => {
  const cleaned = {};
  FIELDS.forEach(field => {
    if (Object.prototype.hasOwnProperty.call(data, field)) {
      cleaned[field] = data[field] === "" ? null : data[field];
    }
  });
  return cleaned;
};

const appendOwnerScope = (req, sql, params) => {
  if (isAdmin(req)) return { sql, params };

  const connector = sql.includes(" WHERE ") ? " AND " : " WHERE ";
  params.push(currentEmail(req) || "");
  params.push(currentEmployeeId(req) || "");
  return {
    sql: `${sql}${connector}(user_email = $${params.length - 1} OR employee_id = $${params.length})`,
    params,
  };
};

const canOwnNotification = (req, row) => (
  isAdmin(req) ||
  row?.user_email === currentEmail(req) ||
  row?.employee_id === currentEmployeeId(req)
);

const canWriteNotification = (req, data) => (
  isAdmin(req) ||
  data?.user_email === currentEmail(req) ||
  data?.employee_id === currentEmployeeId(req)
);

export const getAll = async (req, res) => {
  try {
    const { sort = "-created_date" } = req.query;
    const desc = sort.startsWith("-");
    const field = desc ? sort.slice(1) : sort;
    const orderField = FIELDS.includes(field) || ["id", "created_date", "updated_date", "created_by"].includes(field)
      ? field
      : "created_date";
    const scoped = appendOwnerScope(req, `SELECT * FROM ${TABLE}`, []);
    const result = await query(`${scoped.sql} ORDER BY ${orderField} ${desc ? "DESC" : "ASC"}`, scoped.params);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const filter = async (req, res) => {
  try {
    const { sort = "-created_date" } = req.query;
    const desc = sort.startsWith("-");
    const field = desc ? sort.slice(1) : sort;
    const orderField = FIELDS.includes(field) || ["id", "created_date", "updated_date", "created_by"].includes(field)
      ? field
      : "created_date";
    const filters = req.body || {};
    const params = [];
    const conditions = [];

    Object.entries(filters).forEach(([key, value]) => {
      if ((FIELDS.includes(key) || key === "id") && value !== undefined && value !== null && value !== "") {
        params.push(value);
        conditions.push(`${key} = $${params.length}`);
      }
    });

    const baseSql = `SELECT * FROM ${TABLE}${conditions.length ? ` WHERE ${conditions.join(" AND ")}` : ""}`;
    const scoped = appendOwnerScope(req, baseSql, params);
    const result = await query(`${scoped.sql} ORDER BY ${orderField} ${desc ? "DESC" : "ASC"}`, scoped.params);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const getById = async (req, res) => {
  try {
    const result = await query(`SELECT * FROM ${TABLE} WHERE id = $1`, [req.params.id]);
    const notification = result.rows[0];
    if (!notification) return res.status(404).json({ error: "Notification not found" });
    if (!canOwnNotification(req, notification)) return res.status(403).json({ error: "Acceso denegado a la notificación" });
    res.json(notification);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const create = async (req, res) => {
  try {
    const data = cleanData(req.body);
    if (!canWriteNotification(req, data)) return res.status(403).json({ error: "Acceso denegado a la notificación" });

    const fields = Object.keys(data);
    const values = Object.values(data);
    const placeholders = fields.map((_, index) => `$${index + 1}`).join(", ");
    const result = await query(
      `INSERT INTO ${TABLE} (${fields.join(", ")}, id, created_date, updated_date, created_by)
       VALUES (${placeholders}, $${fields.length + 1}, $${fields.length + 2}, $${fields.length + 3}, $${fields.length + 4})
       RETURNING *`,
      [...values, generate24HexId(), new Date(), new Date(), currentEmail(req) || "system"]
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const update = async (req, res) => {
  try {
    const current = await query(`SELECT * FROM ${TABLE} WHERE id = $1`, [req.params.id]);
    if (current.rows.length === 0) return res.status(404).json({ error: "Notification not found" });

    const data = cleanData(req.body);
    const nextRow = { ...current.rows[0], ...data };
    if (!canOwnNotification(req, current.rows[0]) || !canWriteNotification(req, nextRow)) {
      return res.status(403).json({ error: "Acceso denegado a la notificación" });
    }

    const fields = Object.keys(data);
    if (fields.length === 0) return res.status(400).json({ error: "No hay campos para actualizar" });
    const setClause = fields.map((field, index) => `${field} = $${index + 1}`).join(", ");
    const result = await query(
      `UPDATE ${TABLE} SET ${setClause}, updated_date = $${fields.length + 1} WHERE id = $${fields.length + 2} RETURNING *`,
      [...Object.values(data), new Date(), req.params.id]
    );
    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const remove = async (req, res) => {
  try {
    const current = await query(`SELECT * FROM ${TABLE} WHERE id = $1`, [req.params.id]);
    if (current.rows.length === 0) return res.status(404).json({ error: "Notification not found" });
    if (!canOwnNotification(req, current.rows[0])) return res.status(403).json({ error: "Acceso denegado a la notificación" });

    await query(`DELETE FROM ${TABLE} WHERE id = $1`, [req.params.id]);
    res.status(204).send();
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export default { getAll, filter, getById, create, update, delete: remove };
