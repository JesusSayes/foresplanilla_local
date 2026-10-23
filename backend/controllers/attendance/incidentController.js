import { compensationMinutes } from '../../services/compensationOvertime.js';
import { attendanceDateFilter } from '../../utils/attendanceDateFilter.js';
import prisma from "../../config/prisma.js";

import { generate24HexId } from '../../utils/idGenerator.js';
import { canAccessEmployee, hasPermission, resolveAccessibleEmployeeIds } from "../../middleware/authorization.js";
import { toDateString } from "../../utils/employmentDate.js";

const toPrismaDate = (value) => {
  const dateStr = toDateString(value);
  if (!dateStr) return null;
  const date = new Date(`${dateStr}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date;
};

const serializeIncident = (incident) => ({
  ...incident,
  incident_date: toDateString(incident.incident_date),
  review_date: toDateString(incident.review_date),
  hours_to_adjust: incident.incident_type === 'Compensación de Tardanza'
    ? compensationMinutes(incident) / 60
    : incident.hours_to_adjust != null ? Number(incident.hours_to_adjust) : null,
});

const validateCompensationBalance = async (tx, data, excludeId) => {
  const record = data.attendance_record_id
    ? await tx.attendance_record.findUnique({ where: { id: data.attendance_record_id } }) : null;
  if (!record || record.employee_id !== data.employee_id || toDateString(record.date) !== toDateString(data.incident_date)) {
    throw Object.assign(new Error('La asistencia no corresponde al empleado y fecha de la compensación'), { status: 400 });
  }
  const reservations = await tx.attendance_incident.findMany({
    where: {
      attendance_record_id: record.id,
      incident_type: 'Compensación de Tardanza',
      // Las aprobadas ya descuentan sus minutos del registro de asistencia.
      status: 'Pendiente',
      ...(excludeId && { id: { not: excludeId } }),
    },
    select: { late_minutes_to_adjust: true, hours_to_adjust: true, overtime_minutes_25: true, overtime_minutes_35: true },
  });
  const reservedLate = reservations.reduce((sum, item) => sum + Number(item.late_minutes_to_adjust || 0), 0);
  const reservedMinutes = reservations.reduce((sum, item) => sum + compensationMinutes(item), 0);
  const late = Number(data.late_minutes_to_adjust || 0);
  const hours = Number(data.hours_to_adjust || 0);
  const availableMinutes = Math.round((Number(record.overtime_hours_25 || 0) + Number(record.overtime_hours_35 || 0)) * 60);
  if (!Number.isInteger(late) || late < 0 || !Number.isFinite(hours) || hours < 0 ||
      (late === 0 && hours === 0) || late > Math.max(0, Number(record.late_minutes || 0) - reservedLate) ||
      Math.round(hours * 60) > Math.max(0, availableMinutes - reservedMinutes)) {
    throw Object.assign(new Error('Los minutos solicitados exceden el saldo disponible de la asistencia'), { status: 400 });
  }
  // El servidor asigna primero el saldo al 25%, descontando las reservas pendientes.
  const requestedMinutes = Math.round(hours * 60);
  const available25 = Math.max(0, Math.round(Number(record.overtime_hours_25 || 0) * 60) - reservedMinutes);
  data.overtime_minutes_25 = Math.min(requestedMinutes, available25);
  data.overtime_minutes_35 = requestedMinutes - data.overtime_minutes_25;
  return record;
};

export const getAll = async (req, res) => {
  try {
    const incidents = await prisma.attendance_incident.findMany({
      where: req.accessibleEmployeeIds === null ? {} : { employee_id: { in: req.accessibleEmployeeIds } },
      orderBy: { created_date: 'desc' }
    });
    res.json(incidents.map(serializeIncident));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const filter = async (req, res) => {
  try {
    const { sort = '-created_date' } = req.query;
    const filters = req.body || {};

    // Mapea filtros simples a where de Prisma
    const where = {};
    if (req.accessibleEmployeeIds !== null) where.employee_id = { in: req.accessibleEmployeeIds };

    if (filters.employee_id) {
      if (!canAccessEmployee(req, filters.employee_id)) return res.status(403).json({ error: 'Acceso denegado al empleado' });
      where.employee_id = filters.employee_id;
    }

    if (filters.status) {
      if (typeof filters.status === 'object') {
        const statuses = filters.status.$in;
        if (Object.keys(filters.status).length !== 1 || !Array.isArray(statuses) ||
            statuses.some(status => typeof status !== 'string' || !status)) {
          return res.status(400).json({ error: 'Filtro de estados inválido' });
        }
        where.status = { in: statuses };
      } else {
        where.status = filters.status;
      }
    }

    if (filters.authorizer_id !== undefined) {
      if (typeof filters.authorizer_id !== 'string' || !filters.authorizer_id) {
        return res.status(400).json({ error: 'Autorizador inválido' });
      }
      where.authorizer_id = filters.authorizer_id;
    }

    if (filters.incident_type) {
      where.incident_type = filters.incident_type;
    }

    if (filters.incident_date) {
      if (typeof filters.incident_date === 'object') {
        try {
          where.incident_date = attendanceDateFilter(filters.incident_date);
        } catch (error) {
          return res.status(400).json({ error: error.message });
        }
      } else {
        const incidentDate = toPrismaDate(filters.incident_date);
        if (!incidentDate) return res.status(400).json({ error: 'Fecha de incidente inválida' });
        where.incident_date = incidentDate;
      }
    }

    // rango de fechas (ajusta nombres de campos a tu schema)
    if (!filters.incident_date && (filters.date_from || filters.date_to)) {
      where.incident_date = {};
      if (filters.date_from) where.incident_date.gte = toPrismaDate(filters.date_from);
      if (filters.date_to)   where.incident_date.lte = toPrismaDate(filters.date_to);
    }

    // sort: "-created_date" → createdAt desc, "created_date" → createdAt asc
    let orderBy = { created_date: 'desc' };
    if (sort) {
      const desc = sort.startsWith('-');
      const field = sort.replace('-', '');
      // mapea nombre lógico a campo real
      const sortField =
        field === 'created_date' ? 'created_date' :
        field === 'incident_date' ? 'incident_date' :
        field; // fallback

      orderBy = { [sortField]: desc ? 'desc' : 'asc' };
    }

    const incidents = await prisma.attendance_incident.findMany({
      where,
      orderBy
    });

    res.json(incidents.map(serializeIncident));
  } catch (error) {
    console.error('Error filtrando incidents', error);
    res.status(500).json({ error: error.message });
  }
};

export const getById =  async (req, res) => {
  try {
    const incident = await prisma.attendance_incident.findUnique({
      where: { id: req.params.id },
      include: { attendance: true }
    });
    if (!incident) return res.status(404).json({ error: 'Incident not found' });
    if (!canAccessEmployee(req, incident.employee_id)) return res.status(403).json({ error: 'Acceso denegado al empleado' });
    res.json(serializeIncident(incident));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const create = async (req, res) => {
  try {
    const { id, created_date, updated_date, created_by, incident_date, review_date,...data } = req.body;
    if (!canAccessEmployee(req, data.employee_id)) return res.status(403).json({ error: 'Acceso denegado al empleado' });
    const incidentDate = toPrismaDate(incident_date);
    if (!incidentDate) return res.status(400).json({ error: 'Fecha de incidente inválida' });
    const incidentData = {
      id: generate24HexId(), incident_date: incidentDate,
      review_date: review_date ? toPrismaDate(review_date) : null, ...data,
    };
    const isPendingCompensation = data.incident_type === 'Compensación de Tardanza' && data.status === 'Pendiente';
    const incident = isPendingCompensation
      ? await prisma.$transaction(async tx => {
          const record = await validateCompensationBalance(tx, incidentData);
          const late = Number(data.late_minutes_to_adjust || 0);
          const hours = Number(data.hours_to_adjust || 0);
          const created = await tx.attendance_incident.create({ data: incidentData });
          await tx.attendance_record.update({ where: { id: record.id }, data: {
            status: 'Compensación',
            notes: (record.notes ? record.notes + ' | ' : '') +
              `Compensación solicitada: ${late} min tardanza, ${Math.round(hours * 60)} min HE`,
          } });
          return created;
        }, { isolationLevel: 'Serializable' })
      : await prisma.attendance_incident.create({ data: incidentData });
    res.status(201).json(serializeIncident(incident));
  } catch (error) {
    res.status(error.code === 'P2034' ? 409 : error.status || 500).json({ error: error.code === 'P2034' ? 'El saldo cambió durante la solicitud. Actualice e intente nuevamente.' : error.message });
  }
};

// La solicitud completa y la edición se confirman juntas; un fallo conserva el estado anterior.
export const saveCompensation = async (req, res) => {
  try {
    const { incidents, replaceIds = [] } = req.body || {};
    const first = incidents?.[0];
    if (!Array.isArray(incidents) || !incidents.length || incidents.length > 100 ||
        !Array.isArray(replaceIds) || replaceIds.some(id => typeof id !== 'string') ||
        !first?.employee_id || typeof first.codigo_solicitud !== 'string' || !first.codigo_solicitud) {
      return res.status(400).json({ error: 'Solicitud de compensación inválida' });
    }
    if (!canAccessEmployee(req, first.employee_id)) return res.status(403).json({ error: 'Acceso denegado al empleado' });
    if (replaceIds.length && !['attendance.edit', 'attendance.approve_compensations', 'attendance.manage']
      .some(permission => hasPermission(req.access, permission))) {
      return res.status(403).json({ error: 'Sin permiso para editar compensaciones' });
    }
    if (replaceIds.length) {
      const allowedIds = await resolveAccessibleEmployeeIds(req.access,
        ['attendance.edit', 'attendance.approve_compensations', 'attendance.manage']);
      if (allowedIds !== null && !allowedIds.includes(first.employee_id)) {
        return res.status(403).json({ error: 'Sin permiso para editar compensaciones de esta sede' });
      }
    }
    const rows = incidents.map(item => {
      const incidentDate = toPrismaDate(item.incident_date);
      if (!incidentDate || item.employee_id !== first.employee_id || item.codigo_solicitud !== first.codigo_solicitud ||
          item.incident_type !== 'Compensación de Tardanza' || item.status !== 'Pendiente') {
        throw Object.assign(new Error('Las fechas deben pertenecer a la misma solicitud pendiente'), { status: 400 });
      }
      return {
        id: generate24HexId(), employee_id: first.employee_id,
        attendance_record_id: item.attendance_record_id, incident_date: incidentDate,
        incident_type: 'Compensación de Tardanza', status: 'Pendiente',
        codigo_solicitud: first.codigo_solicitud, justification: item.justification,
        authorizer_id: item.authorizer_id, authorizer_name: item.authorizer_name,
        late_minutes_to_adjust: Number(item.late_minutes_to_adjust || 0),
        hours_to_adjust: Number(item.hours_to_adjust || 0), full_day_justification: false,
      };
    });
    const late = rows.reduce((sum, row) => sum + row.late_minutes_to_adjust, 0);
    const overtime = rows.reduce((sum, row) => sum + Math.round(row.hours_to_adjust * 60), 0);
    if (late <= 0 || late !== overtime || new Set(rows.map(row => row.attendance_record_id)).size !== rows.length) {
      return res.status(400).json({ error: 'La tardanza y las HE deben sumar los mismos minutos, sin fechas duplicadas' });
    }
    const saved = await prisma.$transaction(async tx => {
      const existing = await tx.attendance_incident.findMany({ where: { codigo_solicitud: first.codigo_solicitud } });
      if (existing.length) {
        // Reintento tras perder la respuesta: no volver a crear ni modificar lo registrado.
        if (existing.some(row => row.employee_id !== first.employee_id)) {
          throw Object.assign(new Error('Código de solicitud no disponible'), { status: 409 });
        }
        return existing;
      }
      if (replaceIds.length) {
        const previous = await tx.attendance_incident.findMany({ where: { id: { in: replaceIds } } });
        if (previous.length !== new Set(replaceIds).size || previous.some(row =>
          row.employee_id !== first.employee_id || row.incident_type !== 'Compensación de Tardanza' ||
          !['Pendiente', 'Rechazada'].includes(row.status))) {
          throw Object.assign(new Error('La solicitud cambió o ya fue aprobada; actualice antes de editar'), { status: 409 });
        }
        await tx.attendance_incident.deleteMany({ where: { id: { in: replaceIds } } });
      }
      const result = [];
      for (const data of rows) {
        const record = await validateCompensationBalance(tx, data);
        result.push(await tx.attendance_incident.create({ data }));
        await tx.attendance_record.update({ where: { id: record.id }, data: {
          status: 'Compensación',
          notes: (record.notes ? record.notes + ' | ' : '') +
            `Compensación solicitada: ${data.late_minutes_to_adjust} min tardanza, ${Math.round(data.hours_to_adjust * 60)} min HE`,
        } });
      }
      return result;
    }, { isolationLevel: 'Serializable' });
    res.status(201).json(saved.map(serializeIncident));
  } catch (error) {
    res.status(error.code === 'P2034' ? 409 : error.status || 500).json({ error: error.code === 'P2034'
      ? 'El saldo cambió durante la solicitud. Actualice e intente nuevamente.' : error.message });
  }
};

export const update = async (req, res) => {
  try {
    const existing = await prisma.attendance_incident.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: 'Incident not found' });
    if (!canAccessEmployee(req, existing.employee_id)) return res.status(403).json({ error: 'Acceso denegado al empleado' });
    const { incident_date, review_date, ...data } = req.body;
    if (existing.incident_type === 'Compensación de Tardanza' && ['Aprobada', 'Rechazada'].includes(data.status)) {
      const permissions = ['attendance.approve_compensations', 'attendance.manage'];
      if (!permissions.some(permission => hasPermission(req.access, permission)) ||
          existing.authorizer_id !== req.access?.employee?.id) {
        return res.status(403).json({ error: 'Solo el autorizador con permiso de compensaciones puede revisar esta solicitud' });
      }
      const allowedIds = await resolveAccessibleEmployeeIds(req.access, permissions);
      if (allowedIds !== null && !allowedIds.includes(existing.employee_id)) {
        return res.status(403).json({ error: 'No tiene permiso para aprobar compensaciones de esta sede' });
      }
    }
    if (data.employee_id && !canAccessEmployee(req, data.employee_id)) return res.status(403).json({ error: 'Acceso denegado al empleado' });
    if (incident_date !== undefined && !toPrismaDate(incident_date)) return res.status(400).json({ error: 'Fecha de incidente inválida' });
    if (review_date && !toPrismaDate(review_date)) return res.status(400).json({ error: 'Fecha de revisión inválida' });

    const updateData = {
      ...data,
      ...(incident_date !== undefined && { incident_date: toPrismaDate(incident_date) }),
      ...(review_date !== undefined && { review_date: review_date ? toPrismaDate(review_date) : null }),
    };
    const next = { ...existing, ...updateData };
    const needsBalanceCheck = next.incident_type === 'Compensación de Tardanza' &&
      ['Pendiente', 'Aprobada'].includes(next.status) &&
      (!['Pendiente', 'Aprobada'].includes(existing.status) ||
       ['attendance_record_id', 'employee_id', 'incident_date', 'incident_type', 'late_minutes_to_adjust', 'hours_to_adjust', 'overtime_minutes_25', 'overtime_minutes_35']
         .some(field => Object.hasOwn(updateData, field)));
    const incident = needsBalanceCheck
      ? await prisma.$transaction(async tx => {
          await validateCompensationBalance(tx, next, existing.id);
          updateData.overtime_minutes_25 = next.overtime_minutes_25;
          updateData.overtime_minutes_35 = next.overtime_minutes_35;
          return tx.attendance_incident.update({ where: { id: req.params.id }, data: updateData });
        }, { isolationLevel: 'Serializable' })
      : await prisma.attendance_incident.update({ where: { id: req.params.id }, data: updateData });
    res.json(serializeIncident(incident));
  } catch (error) {
    res.status(error.code === 'P2034' ? 409 : error.status || 500).json({ error: error.code === 'P2034' ? 'El saldo cambió durante la solicitud. Actualice e intente nuevamente.' : error.message });
  }
};

export const remove = async (req, res) => {
  try {
    const existing = await prisma.attendance_incident.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: 'Incident not found' });
    if (!canAccessEmployee(req, existing.employee_id)) return res.status(403).json({ error: 'Acceso denegado al empleado' });
    await prisma.attendance_incident.delete({
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
  saveCompensation,
  update,
  delete: remove, // aquí sí usamos la clave "delete"
  filter,
}

export default controller
