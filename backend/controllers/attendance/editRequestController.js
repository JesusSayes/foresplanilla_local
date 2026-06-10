import prisma from "../../config/prisma.js";
import { canAccessEmployee, hasPermission } from "../../middleware/authorization.js";
import { calcularAsistenciaDesdeLogs } from "../../scripts/calcularAsistenciaDesdeLogs.js";
import { generate24HexId } from "../../utils/idGenerator.js";

const EDITABLE_FIELDS = new Set(["clock_in", "clock_out", "status", "notes"]);
const VALID_STATUSES = new Set(["Completo", "Incompleto", "Ausente", "Justificado", "Vacaciones", "Revisar", "Sin marcar"]);

const reviewerName = employee =>
  `${employee?.first_name || ""} ${employee?.last_name || ""}`.trim();

const normalizeRequestedValues = values => {
  if (!values || typeof values !== "object" || Array.isArray(values)) {
    throw new Error("requested_values debe ser un objeto");
  }

  const normalized = {};
  for (const [field, value] of Object.entries(values)) {
    if (!EDITABLE_FIELDS.has(field)) {
      throw new Error(`El campo ${field} no puede editarse mediante una solicitud`);
    }

    if (field === "clock_in" || field === "clock_out") {
      const normalizedTime = value === "" || value === null ? null : String(value).slice(0, 5);
      if (normalizedTime !== null && !/^\d{2}:\d{2}$/.test(normalizedTime)) {
        throw new Error(`${field} debe tener formato HH:mm`);
      }
      normalized[field] = normalizedTime;
    } else if (field === "status") {
      if (!VALID_STATUSES.has(value)) throw new Error("Estado de asistencia inválido");
      normalized[field] = value;
    } else {
      normalized[field] = value === "" || value === null ? null : String(value);
    }
  }

  if (Object.keys(normalized).length === 0) {
    throw new Error("Debe solicitar al menos un cambio");
  }

  return normalized;
};

const scopedWhere = req => (
  req.accessibleEmployeeIds === null ? {} : { employee_id: { in: req.accessibleEmployeeIds } }
);

export const getAll = async (req, res) => {
  try {
    const requests = await prisma.attendance_edit_request.findMany({
      where: scopedWhere(req),
      orderBy: { requested_at: "desc" },
    });
    res.json(requests);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const filter = async (req, res) => {
  try {
    const filters = req.body || {};
    const where = scopedWhere(req);

    if (filters.employee_id) {
      if (!canAccessEmployee(req, filters.employee_id)) {
        return res.status(403).json({ error: "Acceso denegado al empleado" });
      }
      where.employee_id = filters.employee_id;
    }
    if (filters.attendance_record_id) where.attendance_record_id = filters.attendance_record_id;
    if (filters.status) where.status = filters.status;
    if (filters.id) where.id = filters.id;

    const requests = await prisma.attendance_edit_request.findMany({
      where,
      orderBy: { requested_at: "desc" },
    });
    res.json(requests);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const getById = async (req, res) => {
  try {
    const request = await prisma.attendance_edit_request.findUnique({ where: { id: req.params.id } });
    if (!request) return res.status(404).json({ error: "Solicitud no encontrada" });
    if (!canAccessEmployee(req, request.employee_id)) {
      return res.status(403).json({ error: "Acceso denegado al empleado" });
    }
    res.json(request);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const create = async (req, res) => {
  try {
    const attendanceRecord = await prisma.attendance_record.findUnique({
      where: { id: req.body?.attendance_record_id },
    });
    if (!attendanceRecord) return res.status(404).json({ error: "Registro de asistencia no encontrado" });
    if (!canAccessEmployee(req, attendanceRecord.employee_id)) {
      return res.status(403).json({ error: "Acceso denegado al empleado" });
    }

    const requestedValues = normalizeRequestedValues(req.body?.requested_values);
    const editReason = String(req.body?.edit_reason || "").trim();
    if (!editReason) return res.status(400).json({ error: "El motivo de edición es obligatorio" });

    const originalValues = {};
    const effectiveChanges = {};
    for (const [field, value] of Object.entries(requestedValues)) {
      if (attendanceRecord[field] !== value) {
        originalValues[field] = attendanceRecord[field] ?? null;
        effectiveChanges[field] = value;
      }
    }
    if (Object.keys(effectiveChanges).length === 0) {
      return res.status(400).json({ error: "La solicitud no contiene cambios efectivos" });
    }

    const requester = req.access.employee;
    const now = new Date();
    const request = await prisma.attendance_edit_request.create({
      data: {
        id: generate24HexId(),
        attendance_record_id: attendanceRecord.id,
        employee_id: attendanceRecord.employee_id,
        attendance_date: attendanceRecord.date,
        original_values: originalValues,
        requested_values: effectiveChanges,
        edit_reason: editReason,
        status: "Pendiente",
        requested_by_id: requester.id,
        requested_by_name: reviewerName(requester),
        requested_at: now,
        created_date: now,
        updated_date: now,
      },
    });
    res.status(201).json(request);
  } catch (error) {
    if (error?.code === "P2002") {
      return res.status(409).json({ error: "Ya existe una solicitud pendiente para este registro" });
    }
    res.status(400).json({ error: error.message });
  }
};

export const approve = async (req, res) => {
  try {
    const reviewer = req.access.employee;
    const result = await prisma.$transaction(async tx => {
      const request = await tx.attendance_edit_request.findUnique({ where: { id: req.params.id } });
      if (!request) throw new Error("Solicitud no encontrada");
      if (!canAccessEmployee(req, request.employee_id)) throw new Error("Acceso denegado al empleado");
      if (request.status !== "Pendiente") throw new Error("La solicitud ya no está pendiente");
      if (request.requested_by_id === reviewer.id && !hasPermission(req.access, "system.admin")) {
        throw new Error("No puede aprobar su propia solicitud");
      }

      const record = await tx.attendance_record.findUnique({ where: { id: request.attendance_record_id } });
      if (!record) throw new Error("Registro de asistencia no encontrado");

      const requestedValues = normalizeRequestedValues(request.requested_values);
      const protectedFields = [...new Set([
        ...(Array.isArray(record.manually_protected_fields) ? record.manually_protected_fields : []),
        ...Object.keys(requestedValues),
      ])];
      const now = new Date();

      await tx.attendance_record.update({
        where: { id: record.id },
        data: {
          ...requestedValues,
          manually_protected_fields: protectedFields,
          last_approved_edit_id: request.id,
          manually_modified_by_id: reviewer.id,
          manually_modified_by: reviewerName(reviewer),
          manually_modified_at: now,
          updated_date: now,
        },
      });

      return tx.attendance_edit_request.update({
        where: { id: request.id },
        data: {
          status: "Aprobada",
          reviewed_by_id: reviewer.id,
          reviewed_by_name: reviewerName(reviewer),
          reviewed_at: now,
          review_comment: req.body?.review_comment || null,
          updated_date: now,
        },
      });
    }, { isolationLevel: "Serializable" });

    try {
      await calcularAsistenciaDesdeLogs({
        date: result.attendance_date.toISOString().slice(0, 10),
        force: true,
      });
      res.json(result);
    } catch (recalculationError) {
      console.error("Solicitud aprobada, pero falló el recálculo de asistencia:", recalculationError);
      res.json({
        ...result,
        warning: "La edición fue aprobada, pero no se pudieron recalcular las métricas de asistencia",
      });
    }
  } catch (error) {
    const status = error.message.includes("Acceso denegado") ? 403 : 400;
    res.status(status).json({ error: error.message });
  }
};

export const reject = async (req, res) => {
  try {
    const comment = String(req.body?.review_comment || "").trim();
    if (!comment) return res.status(400).json({ error: "El comentario de rechazo es obligatorio" });

    const existing = await prisma.attendance_edit_request.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: "Solicitud no encontrada" });
    if (!canAccessEmployee(req, existing.employee_id)) return res.status(403).json({ error: "Acceso denegado al empleado" });
    if (existing.status !== "Pendiente") return res.status(400).json({ error: "La solicitud ya no está pendiente" });

    const reviewer = req.access.employee;
    const request = await prisma.attendance_edit_request.update({
      where: { id: existing.id },
      data: {
        status: "Rechazada",
        reviewed_by_id: reviewer.id,
        reviewed_by_name: reviewerName(reviewer),
        reviewed_at: new Date(),
        review_comment: comment,
        updated_date: new Date(),
      },
    });
    res.json(request);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const cancel = async (req, res) => {
  try {
    const existing = await prisma.attendance_edit_request.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: "Solicitud no encontrada" });
    if (existing.requested_by_id !== req.access.employee.id && !hasPermission(req.access, "system.admin")) {
      return res.status(403).json({ error: "Solo el solicitante puede cancelar esta solicitud" });
    }
    if (existing.status !== "Pendiente") return res.status(400).json({ error: "La solicitud ya no está pendiente" });

    const request = await prisma.attendance_edit_request.update({
      where: { id: existing.id },
      data: {
        status: "Cancelada",
        reviewed_by_id: req.access.employee.id,
        reviewed_by_name: reviewerName(req.access.employee),
        reviewed_at: new Date(),
        review_comment: "Cancelada por el solicitante",
        updated_date: new Date(),
      },
    });
    res.json(request);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export default { getAll, filter, getById, create, approve, reject, cancel };
