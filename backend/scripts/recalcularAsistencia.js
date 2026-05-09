import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

function getScheduleForDate(employeeId, departmentName, schedules, dateStr) {
  const candidates = schedules.filter(s => {
    if (!s.is_active) return false;
    const isForEmployee = s.employee_id === employeeId;
    const isForDept = !s.employee_id && departmentName &&
      (Array.isArray(s.departments)
        ? s.departments.includes(departmentName)
        : s.department_name === departmentName);
    return isForEmployee || isForDept;
  });

  const findBest = (list) => {
    const valid = list.filter(s => {
      const from = s.effective_from ? s.effective_from.toISOString().slice(0,10) : "0000-01-01";
      const to   = s.effective_to   ? s.effective_to.toISOString().slice(0,10)   : "9999-12-31";
      return from <= dateStr && to >= dateStr;
    });
    valid.sort((a, b) => {
      const af = a.effective_from ? a.effective_from.toISOString().slice(0,10) : "0000-01-01";
      const bf = b.effective_from ? b.effective_from.toISOString().slice(0,10) : "0000-01-01";
      return bf.localeCompare(af);
    });
    return valid[0] || null;
  };

  return findBest(candidates.filter(s => s.employee_id === employeeId))
      || findBest(candidates.filter(s => !s.employee_id))
      || null;
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

  const scheduledStart = schedule ? (schedule[dayStartMap[dow]] || "09:00") : "09:00";
  const scheduledEnd = schedule ? (schedule[dayEndMap[dow]] || "18:00") : "18:00";
  const breakMinutes = schedule?.break_duration_minutes ?? 60;
  const toleranceMinutes = schedule?.tolerance_minutes ?? 10;

  const [inH, inM] = clockIn.split(":").map(Number);
  const inTotal = inH * 60 + inM;
  const [schedH, schedM] = scheduledStart.split(":").map(Number);
  const schedTotal = schedH * 60 + schedM;
  const [endH, endM] = scheduledEnd.split(":").map(Number);
  const schedEndTotal = endH * 60 + endM;

  const rawLate = inTotal - schedTotal;
  const lateMinutes = rawLate > toleranceMinutes ? rawLate : 0;
  const isLate = lateMinutes > 0;

  let workedHours = 0;
  let regularHours = 0;
  let overtimeHours25 = 0;
  let overtimeHours35 = 0;

  if (clockOut) {
    const [outH, outM] = clockOut.split(":").map(Number);
    const outTotal = outH * 60 + outM;
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
    select: { incident_date: true },
  });

  const approvedIncidentsByDate = {};
  incidents.forEach(i => {
    if (!i.incident_date) return;
    approvedIncidentsByDate[i.incident_date.toISOString().slice(0, 10)] = true;
  });

  let updated = 0;

  for (const record of records) {
    const dateStr = record.date.toISOString().slice(0, 10);
    const schedule = getScheduleForDate(employee_id, emp.department_name, allSchedules, dateStr);
    const overtimeAuth = record.overtime_authorized ?? schedule?.overtime_authorized ?? false;
    const metrics = calcularMetricas(record, schedule, dateStr, overtimeAuth);

    const hasApprovedIncident = !!approvedIncidentsByDate[dateStr];

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

    await prisma.attendance_record.update({
      where: { id: record.id },
      data: {
        worked_hours: metrics.worked_hours,
        regular_hours: metrics.regular_hours,
        overtime_hours_25: metrics.overtime_hours_25,
        overtime_hours_35: metrics.overtime_hours_35,
        is_late: metrics.is_late,
        late_minutes: metrics.late_minutes,
        is_absent: metrics.is_absent,
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
