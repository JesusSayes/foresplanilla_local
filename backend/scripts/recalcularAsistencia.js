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

  let updated = 0;

  for (const record of records) {
    const dateStr  = record.date.toISOString().slice(0, 10);
    const schedule = getScheduleForDate(employee_id, emp.department_name, allSchedules, dateStr);

    const clockIn  = record.clock_in;
    const clockOut = record.clock_out;

    let worked_hours = 0, regular_hours = 0, overtime_hours_25 = 0, overtime_hours_35 = 0;
    let is_late = false, late_minutes = 0, is_absent = false;
    let scheduled_start = record.scheduled_start;
    let scheduled_end   = record.scheduled_end;

    if (clockIn && schedule) {
      const dow = new Date(dateStr + "T00:00:00").getDay();
      const dayStartMap = ["sunday_start","monday_start","tuesday_start","wednesday_start","thursday_start","friday_start","saturday_start"];
      const dayEndMap   = ["sunday_end","monday_end","tuesday_end","wednesday_end","thursday_end","friday_end","saturday_end"];

      scheduled_start        = schedule[dayStartMap[dow]] || "09:00";
      scheduled_end          = schedule[dayEndMap[dow]]   || "18:00";
      const breakMinutes     = schedule.break_duration_minutes ?? 60;
      const toleranceMinutes = schedule.tolerance_minutes ?? 10;

      const [inH, inM]       = clockIn.split(":").map(Number);
      const inTotal          = inH * 60 + inM;
      const [schedH, schedM] = scheduled_start.split(":").map(Number);
      const schedTotal       = schedH * 60 + schedM;
      const [endH, endM]     = scheduled_end.split(":").map(Number);
      const schedEndTotal    = endH * 60 + endM;

      const rawLate = inTotal - schedTotal;
      late_minutes  = rawLate > toleranceMinutes ? rawLate : 0;
      is_late       = late_minutes > 0;

      if (clockOut) {
        const [outH, outM] = clockOut.split(":").map(Number);
        const outTotal     = outH * 60 + outM;
        worked_hours = Math.max(0, (outTotal - inTotal - breakMinutes) / 60);

        const regularMinutes = Math.max(0, schedEndTotal - Math.max(inTotal, schedTotal) - breakMinutes);
        const normalHoursMax = regularMinutes / 60;

        const overtimeAuth = record.overtime_authorized ?? schedule.overtime_authorized ?? false;

        if (worked_hours <= normalHoursMax) {
          regular_hours = worked_hours;
        } else {
          regular_hours = normalHoursMax;
          const extraHours = worked_hours - normalHoursMax;
          if (overtimeAuth) {
            overtime_hours_25 = Math.min(extraHours, 2);
            overtime_hours_35 = Math.max(0, extraHours - 2);
          }
        }
      }
    } else if (!clockIn) {
      is_absent = record.status === "Ausente";
    }

    let status = record.status;
    if (clockIn && clockOut)       status = "Completo";
    else if (clockIn && !clockOut) status = "Incompleto";
    else if (!clockIn)             status = record.status === "Justificado" ? "Justificado" : "Ausente";

    await prisma.attendance_record.update({
      where: { id: record.id },
      data: {
        worked_hours,
        regular_hours,
        overtime_hours_25,
        overtime_hours_35,
        is_late,
        late_minutes,
        is_absent,
        scheduled_start: scheduled_start || record.scheduled_start,
        scheduled_end:   scheduled_end   || record.scheduled_end,
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
