import { query } from "../config/database.js";
import { hasPermission } from "../middleware/authorization.js";
import { generate24HexId } from "../utils/idGenerator.js";

const TABLE = "notification_preference";
const FIELDS = [
  "user_email",
  "employee_id",
  "incident_pending",
  "incident_approved",
  "incident_rejected",
  "vacation_pending",
  "vacation_approved",
  "vacation_rejected",
  "contract_expiring",
  "payslip_ready",
  "attendance_alert",
  "system",
  "email_notifications",
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

const canReadOrWrite = (req, row) => (
  isAdmin(req) ||
  row?.user_email === currentEmail(req) ||
  row?.employee_id === currentEmployeeId(req)
);

const canDelete = (req, row) => (
  isAdmin(req) ||
  row?.user_email === currentEmail(req)
);

export const getAll = async (req, res) => {
  try {
    const scoped = appendOwnerScope(req, `SELECT * FROM ${TABLE}`, []);
    const result = await query(`${scoped.sql} ORDER BY created_date DESC`, scoped.params);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const filter = async (req, res) => {
  try {
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
    const result = await query(`${scoped.sql} ORDER BY created_date DESC`, scoped.params);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const getById = async (req, res) => {
  try {
    const result = await query(`SELECT * FROM ${TABLE} WHERE id = $1`, [req.params.id]);
    const preference = result.rows[0];
    if (!preference) return res.status(404).json({ error: "NotificationPreference not found" });
    if (!canReadOrWrite(req, preference)) return res.status(403).json({ error: "Acceso denegado a las preferencias" });
    res.json(preference);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const create = async (req, res) => {
  try {
    const data = cleanData(req.body);
    if (!canReadOrWrite(req, data)) return res.status(403).json({ error: "Acceso denegado a las preferencias" });

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
    if (current.rows.length === 0) return res.status(404).json({ error: "NotificationPreference not found" });

    const data = cleanData(req.body);
    const nextRow = { ...current.rows[0], ...data };
    if (!canReadOrWrite(req, current.rows[0]) || !canReadOrWrite(req, nextRow)) {
      return res.status(403).json({ error: "Acceso denegado a las preferencias" });
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
    if (current.rows.length === 0) return res.status(404).json({ error: "NotificationPreference not found" });
    if (!canDelete(req, current.rows[0])) return res.status(403).json({ error: "Acceso denegado a las preferencias" });

    await query(`DELETE FROM ${TABLE} WHERE id = $1`, [req.params.id]);
    res.status(204).send();
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export default { getAll, filter, getById, create, update, delete: remove };
