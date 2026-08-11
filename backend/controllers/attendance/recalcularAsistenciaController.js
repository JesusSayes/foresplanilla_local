import prisma from "../../config/prisma.js";
import { canAccessEmployee } from "../../middleware/authorization.js";
import {
  getProtectedFields,
  protectValue,
} from "../../utils/manualAttendanceProtection.js";
import {
  getScheduleForDate,
  calcularMetricas,
} from "../../utils/attendanceMetrics.js";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const recalcularAsistencia = async (req, res) => {
  try {
    const { user } = req;
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { employee_id, date_from, date_to } = req.body;

    if (!employee_id || !date_from || !date_to) {
      return res.status(400).json({ error: 'employee_id, date_from y date_to son requeridos' });
    }
    if (!ISO_DATE.test(date_from) || !ISO_DATE.test(date_to)) {
      return res.status(400).json({ error: 'date_from y date_to deben tener formato YYYY-MM-DD' });
    }
    if (date_from > date_to) {
      return res.status(400).json({ error: 'date_from no puede ser mayor que date_to' });
    }
    if (!canAccessEmployee(req, employee_id)) {
      return res.status(403).json({ error: 'Acceso denegado al empleado' });
    }

    const [employee, allSchedules] = await Promise.all([
      prisma.employee.findUnique({ where: { id: employee_id } }),
      prisma.work_schedule.findMany({ where: { is_active: true }, orderBy: { effective_from: 'desc' } }),
    ]);

    if (!employee) {
      return res.status(404).json({ error: 'Empleado no encontrado' });
    }

    const recordsInRange = await prisma.attendance_record.findMany({
      where: {
        employee_id,
        date: {
          gte: new Date(date_from),
          lte: new Date(date_to),
        },
      },
    });

    const incidents = await prisma.attendance_incident.findMany({
      where: {
        employee_id,
        status: "Aprobada",
        incident_date: {
          gte: new Date(date_from),
          lte: new Date(date_to),
        },
      },
      select: {
        incident_date: true,
        incident_type: true,
        justified_time_start: true,
        justified_time_end: true,
        full_day_justification: true,
        late_minutes_to_adjust: true,
        hours_to_adjust: true,
      },
    });

    const approvedIncidentsByDate = {};
    const approvedCompensationsByDate = {};
    incidents.forEach((incident) => {
      if (!incident.incident_date) return;
      const dateKey = incident.incident_date.toISOString().slice(0, 10);
      if (!approvedIncidentsByDate[dateKey]) approvedIncidentsByDate[dateKey] = [];
      approvedIncidentsByDate[dateKey].push(incident);
      if (incident.incident_type === "Compensación de Tardanza") {
        if (!approvedCompensationsByDate[dateKey]) approvedCompensationsByDate[dateKey] = [];
        approvedCompensationsByDate[dateKey].push(incident);
      }
    });

    let updated = 0;

    for (const record of recordsInRange) {
      const dateStr = record.date ? record.date.toISOString().slice(0, 10) : null;
      if (!dateStr) continue;

      const schedule = getScheduleForDate(employee_id, employee.department_name, allSchedules, dateStr);
      const overtimeAuth = record.overtime_authorized ?? schedule?.overtime_authorized ?? false;
      const approvedIncidents = approvedIncidentsByDate[dateStr] || [];
      const metrics = calcularMetricas(record, schedule, dateStr, overtimeAuth, approvedIncidents);
      const protectedFields = getProtectedFields(record);
      const approvedCompensations = approvedCompensationsByDate[dateStr] || [];

      let status = record.status;
      if (approvedIncidents.length > 0 || record.status === "Justificado") {
        status = "Justificado";
      } else if (record.clock_in && record.clock_out) {
        status = "Completo";
      } else if (record.clock_in && !record.clock_out) {
        status = "Incompleto";
      } else if (!record.clock_in) {
        status = record.status === "Justificado" ? "Justificado" : "Ausente";
      }
      let finalLate = metrics.late_minutes;
      let finalIsLate = metrics.is_late;
      let finalOT25 = metrics.overtime_hours_25;
      let finalOT35 = metrics.overtime_hours_35;

      if (approvedCompensations.length > 0 && status !== "Vacaciones") {
        const compensatedLateMinutes = approvedCompensations.reduce(
          (total, incident) => total + (incident.late_minutes_to_adjust || 0),
          0
        );
        let compensatedOvertimeHours = approvedCompensations.reduce(
          (total, incident) => total + Number(incident.hours_to_adjust || 0),
          0
        );

        finalLate = Math.max(0, metrics.late_minutes - compensatedLateMinutes);
        finalIsLate = finalLate > 0;

        const deductOT25 = Math.min(finalOT25, compensatedOvertimeHours);
        finalOT25 -= deductOT25;
        compensatedOvertimeHours -= deductOT25;

        const deductOT35 = Math.min(finalOT35, compensatedOvertimeHours);
        finalOT35 -= deductOT35;
        status = "Justificado";
      }
      if (protectedFields.has("status")) {
        status = record.status;
      }

      await prisma.attendance_record.update({
        where: { id: record.id },
        data: {
          worked_hours: protectValue(protectedFields, "worked_hours", record.worked_hours, metrics.worked_hours),
          regular_hours: protectValue(protectedFields, "regular_hours", record.regular_hours, metrics.regular_hours),
          overtime_hours_25: protectValue(protectedFields, "overtime_hours_25", record.overtime_hours_25, finalOT25),
          overtime_hours_35: protectValue(protectedFields, "overtime_hours_35", record.overtime_hours_35, finalOT35),
          is_late: protectValue(protectedFields, "is_late", record.is_late, finalIsLate),
          late_minutes: protectValue(protectedFields, "late_minutes", record.late_minutes, finalLate),
          is_absent: protectValue(protectedFields, "is_absent", record.is_absent, status === "Ausente"),
          scheduled_start: metrics.scheduled_start || record.scheduled_start,
          scheduled_end: metrics.scheduled_end || record.scheduled_end,
          status,
        },
      });
      updated++;
    }

    return res.json({ success: true, updated, range: { date_from, date_to }, employee_id });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

export default { recalcularAsistencia };
