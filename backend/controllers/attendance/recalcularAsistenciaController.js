import prisma from "../../config/prisma.js";
import { canAccessEmployee } from "../../middleware/authorization.js";
import {
  getProtectedFields,
  protectValue,
} from "../../utils/manualAttendanceProtection.js";

function getScheduleForDate(employeeId, departmentName, schedules, dateStr) {
  const candidates = schedules.filter(s => {
    if (!s.is_active) return false;
    const isForEmployee = s.employee_id === employeeId;
    const isForDept = !s.employee_id && departmentName &&
      (s.departments?.includes(departmentName) || s.department_name === departmentName);
    return isForEmployee || isForDept;
  });

  const empSchedules = candidates.filter(s => s.employee_id === employeeId);
  const deptSchedules = candidates.filter(s => !s.employee_id);

  const findBest = (list) => {
    const valid = list.filter(s => {
      const from = s.effective_from ? s.effective_from.toISOString().slice(0, 10) : '0000-01-01';
      const to = s.effective_to ? s.effective_to.toISOString().slice(0, 10) : '9999-12-31';
      return from <= dateStr && to >= dateStr;
    });
    valid.sort((a, b) => {
      const af = a.effective_from ? a.effective_from.toISOString() : '0000-01-01';
      const bf = b.effective_from ? b.effective_from.toISOString() : '0000-01-01';
      return bf.localeCompare(af);
    });
    return valid[0] || null;
  };

  return findBest(empSchedules) || findBest(deptSchedules) || null;
}

function calcularMetricas(record, schedule, dateStr, overtimeAuthorized) {
  const clockIn = record.clock_in;
  const clockOut = record.clock_out;

  if (!clockIn) {
    return {
      worked_hours: 0,
      regular_hours: 0,
      overtime_hours_25: 0,
      overtime_hours_35: 0,
      is_late: false,
      late_minutes: 0,
      is_absent: record.status === "Ausente",
    };
  }

  const dow = new Date(dateStr + "T00:00:00").getDay();
  const dayStartMap = ["sunday_start","monday_start","tuesday_start","wednesday_start","thursday_start","friday_start","saturday_start"];
  const dayEndMap   = ["sunday_end","monday_end","tuesday_end","wednesday_end","thursday_end","friday_end","saturday_end"];

  const scheduledStart  = schedule ? (schedule[dayStartMap[dow]] || "09:00") : "09:00";
  const scheduledEnd    = schedule ? (schedule[dayEndMap[dow]]   || "18:00") : "18:00";
  const breakMinutes    = schedule?.break_duration_minutes ?? 60;
  const toleranceMinutes = schedule?.tolerance_minutes ?? 10;

  const [inH, inM]     = clockIn.split(":").map(Number);
  const inTotal        = inH * 60 + inM;
  const [schedH, schedM] = scheduledStart.split(":").map(Number);
  const schedTotal     = schedH * 60 + schedM;
  const [endH, endM]   = scheduledEnd.split(":").map(Number);
  const schedEndTotal  = endH * 60 + endM;

  const rawLate    = inTotal - schedTotal;
  const lateMinutes = rawLate > toleranceMinutes ? rawLate : 0;
  const isLate     = lateMinutes > 0;

  let workedHours = 0;
  let regularHours = 0;
  let overtimeHours25 = 0;
  let overtimeHours35 = 0;

  if (clockOut) {
    const [outH, outM] = clockOut.split(":").map(Number);
    const outTotal     = outH * 60 + outM;
    const totalMinutes = outTotal - inTotal - breakMinutes;
    workedHours = Math.max(0, totalMinutes / 60);

    const regularMinutes = Math.max(0, schedEndTotal - Math.max(inTotal, schedTotal) - breakMinutes);
    const normalHoursMax = regularMinutes / 60;

    if (workedHours <= normalHoursMax) {
      regularHours = workedHours;
    } else {
      regularHours = normalHoursMax;
      const extraHours = workedHours - normalHoursMax;

      if (overtimeAuthorized) {
        overtimeHours25 = Math.min(extraHours, 2);
        overtimeHours35 = Math.max(0, extraHours - 2);
      }
    }
  }

  return {
    worked_hours: workedHours,
    regular_hours: regularHours,
    overtime_hours_25: overtimeHours25,
    overtime_hours_35: overtimeHours35,
    is_late: isLate,
    late_minutes: lateMinutes,
    is_absent: false,
    scheduled_start: scheduledStart,
    scheduled_end: scheduledEnd,
  };
}

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

    let updated = 0;

    for (const record of recordsInRange) {
      const dateStr = record.date ? record.date.toISOString().slice(0, 10) : null;
      if (!dateStr) continue;

      const schedule = getScheduleForDate(employee_id, employee.department_name, allSchedules, dateStr);
      const overtimeAuth = record.overtime_authorized ?? schedule?.overtime_authorized ?? false;
      const metrics = calcularMetricas(record, schedule, dateStr, overtimeAuth);
      const protectedFields = getProtectedFields(record);

      let status = record.status;
      if (record.clock_in && record.clock_out) {
        status = "Completo";
      } else if (record.clock_in && !record.clock_out) {
        status = "Incompleto";
      } else if (!record.clock_in) {
        status = record.status === "Justificado" ? "Justificado" : "Ausente";
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
