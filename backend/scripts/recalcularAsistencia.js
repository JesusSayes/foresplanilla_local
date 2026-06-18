import { PrismaClient } from '@prisma/client';
import {
  getProtectedFields,
  protectValue,
} from "../utils/manualAttendanceProtection.js";
import {
  getScheduleForDate,
  calcularMetricas,
} from "../utils/attendanceMetrics.js";

const prisma = new PrismaClient();

/**
 * Recalcula métricas de asistencia (tardanza, horas trabajadas, horas extra) para un empleado en un rango de fechas.
 * Regla peruana: primeras 2h extra → 25%, a partir de la 3ra → 35%.
 *
 * Params:
 *   employee_id → (requerido) ID del empleado
 *   date_from   → (requerido) fecha inicio del rango, ej: "2026-01-01"
 *   date_to     → (requerido) fecha fin del rango, ej: "2026-01-31"
 */
export async function recalcularAsistencia({ employee_id, date_from, date_to } = {}) {
  if (!employee_id || !date_from || !date_to) {
    throw new Error('employee_id, date_from y date_to son requeridos');
  }

  const emp = await prisma.employee.findUnique({ where: { id: employee_id } });
  if (!emp) throw new Error('Empleado no encontrado');

  const allSchedules = await prisma.work_schedule.findMany({ orderBy: { id: 'asc' } });

  // Paginación con cursor sobre registros en el rango
  const records = [];
  let cursorRecord = null;
  while (true) {
    const page = await prisma.attendance_record.findMany({
      where: {
        employee_id,
        date: { gte: new Date(date_from + "T00:00:00"), lte: new Date(date_to + "T00:00:00") },
      },
      orderBy: { id: 'asc' },
      take:    500,
      ...(cursorRecord ? { cursor: { id: cursorRecord }, skip: 1 } : {}),
    });
    records.push(...page);
    if (page.length < 500) break;
    cursorRecord = page[page.length - 1].id;
  }

  const incidents = await prisma.attendance_incident.findMany({
    where: {
      employee_id,
      status: "Aprobada",
      incident_date: { gte: new Date(date_from + "T00:00:00"), lte: new Date(date_to + "T00:00:00") },
    },
    select: {
      incident_date: true,
      justified_time_start: true,
      justified_time_end: true,
      full_day_justification: true,
    },
  });

  const approvedIncidentsByDate = {};
  incidents.forEach(i => {
    if (!i.incident_date) return;
    const dateKey = i.incident_date.toISOString().slice(0, 10);
    if (!approvedIncidentsByDate[dateKey]) approvedIncidentsByDate[dateKey] = [];
    approvedIncidentsByDate[dateKey].push(i);
  });

  let updated = 0;

  for (const record of records) {
    const dateStr = record.date.toISOString().slice(0, 10);
    const schedule = getScheduleForDate(employee_id, emp.department_name, allSchedules, dateStr);
    const overtimeAuth = record.overtime_authorized ?? schedule?.overtime_authorized ?? false;
    const approvedIncidents = approvedIncidentsByDate[dateStr] || [];
    const metrics = calcularMetricas(record, schedule, dateStr, overtimeAuth, approvedIncidents);
    const protectedFields = getProtectedFields(record);

    const hasApprovedIncident = approvedIncidents.length > 0;

    let status;
    if (hasApprovedIncident || record.status === "Justificado") {
      status = "Justificado";
    } else if (record.clock_in && record.clock_out) {
      status = "Completo";
    } else if (record.clock_in && !record.clock_out) {
      status = "Incompleto";
    } else {
      status = "Ausente";
    }
    if (protectedFields.has("status")) {
      status = record.status;
    }

    await prisma.attendance_record.update({
      where: { id: record.id },
      data: {
        worked_hours: protectValue(protectedFields, "worked_hours", record.worked_hours, metrics.worked_hours),
        regular_hours: protectValue(protectedFields, "regular_hours", record.regular_hours, metrics.regular_hours),
        overtime_hours_25: protectValue(protectedFields, "overtime_hours_25", record.overtime_hours_25, metrics.overtime_hours_25),
        overtime_hours_35: protectValue(protectedFields, "overtime_hours_35", record.overtime_hours_35, metrics.overtime_hours_35),
        is_late: protectValue(protectedFields, "is_late", record.is_late, metrics.is_late),
        late_minutes: protectValue(protectedFields, "late_minutes", record.late_minutes, metrics.late_minutes),
        is_absent: protectValue(protectedFields, "is_absent", record.is_absent, metrics.is_absent),
        scheduled_start: metrics.scheduled_start || record.scheduled_start,
        scheduled_end: metrics.scheduled_end || record.scheduled_end,
        status,
        updated_date: new Date(),
      },
    });
    updated++;
  }

  return { success: true, updated, range: { date_from, date_to }, employee_id };
}

if (process.argv[1].endsWith('recalcularAsistencia.js')) {
  const args = {};
  for (let i = 2; i < process.argv.length; i++) {
    const [k, v] = process.argv[i].split('=');
    if (k && v) args[k.replace('--','')] = v;
  }
  recalcularAsistencia(args)
    .then(r => { console.log(JSON.stringify(r, null, 2)); process.exit(0); })
    .catch(e => { console.error(e.message); process.exit(1); })
    .finally(() => prisma.$disconnect());
}
