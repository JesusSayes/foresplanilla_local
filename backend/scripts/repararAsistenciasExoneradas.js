import prisma from "../config/prisma.js";

const DAY_NAMES = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

function getScheduleForDate(employeeId, departmentName, schedules, dateStr) {
  const candidates = schedules.filter(s => {
    const isForEmployee = s.employee_id === employeeId;
    const isForDept = !s.employee_id && departmentName &&
      (Array.isArray(s.departments)
        ? s.departments.includes(departmentName)
        : s.department_name === departmentName);
    return isForEmployee || isForDept;
  });

  const findBest = list => {
    const valid = list.filter(s => {
      const from = s.effective_from ? s.effective_from.toISOString().slice(0, 10) : "0000-01-01";
      const to = s.effective_to ? s.effective_to.toISOString().slice(0, 10) : "9999-12-31";
      return from <= dateStr && dateStr <= to;
    });

    valid.sort((a, b) => {
      const af = a.effective_from ? a.effective_from.toISOString().slice(0, 10) : "0000-01-01";
      const bf = b.effective_from ? b.effective_from.toISOString().slice(0, 10) : "0000-01-01";
      return bf.localeCompare(af);
    });

    return valid[0] || null;
  };

  return findBest(candidates.filter(s => s.employee_id === employeeId))
    || findBest(candidates.filter(s => !s.employee_id))
    || null;
}

function calcWorkedHours(startTime, endTime, breakMinutes) {
  const [sh, sm] = startTime.split(":").map(Number);
  const [eh, em] = endTime.split(":").map(Number);
  return Math.max(0, ((eh * 60 + em) - (sh * 60 + sm) - (breakMinutes || 60)) / 60);
}

async function repararAsistenciasExoneradas({ date_from, date_to }) {
  if (!date_from || !date_to) {
    throw new Error("Debes enviar --date_from=YYYY-MM-DD y --date_to=YYYY-MM-DD");
  }

  const from = new Date(date_from + "T00:00:00");
  const to = new Date(date_to + "T00:00:00");

  const [records, schedulesRaw, employees] = await Promise.all([
    prisma.attendance_record.findMany({
      where: {
        date: {
          gte: from,
          lte: to,
        },
      },
      orderBy: [{ date: "asc" }, { employee_id: "asc" }],
    }),
    prisma.work_schedule.findMany({
      where: { is_active: true },
      orderBy: { id: "asc" },
    }),
    prisma.employee.findMany({
      where: { status: "Activo" },
      select: { id: true, department_name: true },
    }),
  ]);

  const employeeMap = new Map(employees.map(e => [e.id, e]));
  let repaired = 0;

  for (const record of records) {
    if (!record.employee_id || !record.date) continue;

    const dateStr = record.date.toISOString().slice(0, 10);
    const employee = employeeMap.get(record.employee_id);
    const schedule = getScheduleForDate(record.employee_id, employee?.department_name, schedulesRaw, dateStr);

    if (!schedule?.exempt_from_clocking) continue;

    const dow = new Date(dateStr + "T00:00:00").getDay();
    const day = DAY_NAMES[dow];
    const startT = schedule[`${day}_start`];
    const endT = schedule[`${day}_end`];

    if (!startT || !endT || startT.trim() === "" || endT.trim() === "") continue;

    const breakMin = schedule.break_duration_minutes || 60;
    const worked = calcWorkedHours(startT, endT, breakMin);

    await prisma.$transaction([
      prisma.attendance_record.update({
        where: { id: record.id },
        data: {
          scheduled_start: startT,
          scheduled_end: endT,
          clock_in: startT,
          clock_out: endT,
          worked_hours: worked,
          regular_hours: worked,
          overtime_hours_25: 0,
          overtime_hours_35: 0,
          is_late: false,
          late_minutes: 0,
          is_absent: false,
          status: "Completo",
          notes: "Registro automático - Exonerado de marcación física",
          updated_date: new Date(),
        },
      }),
      prisma.attendance_logs.updateMany({
        where: {
          employee_id: record.employee_id,
          punch_time: {
            gte: new Date(dateStr + "T00:00:00"),
            lte: new Date(dateStr + "T23:59:59"),
          },
        },
        data: {
          attendance_record_id: null,
          is_used_for_calculation: false,
          is_within_window: null,
          updated_date: new Date(),
        },
      }),
    ]);

    repaired++;
  }

  return {
    success: true,
    date_from,
    date_to,
    records_scanned: records.length,
    repaired,
  };
}

if (process.argv[1].includes("repararAsistenciasExoneradas")) {
  const args = {};
  for (let i = 2; i < process.argv.length; i++) {
    const [k, v] = process.argv[i].split("=");
    if (k && v) args[k.replace("--", "")] = v;
  }

  repararAsistenciasExoneradas(args)
    .then(r => {
      console.log(JSON.stringify(r, null, 2));
      process.exit(0);
    })
    .catch(e => {
      console.error(e);
      process.exit(1);
    })
    .finally(() => prisma.$disconnect());
}

/*
 * node backend/scripts/repararAsistenciasExoneradas.js --date_from=2026-04-21 --date_to=2026-05-06
 * */
