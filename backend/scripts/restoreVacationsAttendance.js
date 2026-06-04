import prisma from "../config/prisma.js";
import { getScheduleForDate } from "../utils/attendanceMetrics.js";

function formatDate(date) {
  return date.toISOString().slice(0, 10);
}

function getDatesBetween(startDate, endDate) {
  const dates = [];

  const current = new Date(`${startDate}T00:00:00Z`);
  const end = new Date(`${endDate}T00:00:00Z`);

  while (current <= end) {
    dates.push(formatDate(current));
    current.setUTCDate(current.getUTCDate() + 1);
  }

  return dates;
}

function getScheduleHours(schedule, dateStr) {
  const dow = new Date(`${dateStr}T00:00:00`).getDay();

  const startFields = [
    "sunday_start",
    "monday_start",
    "tuesday_start",
    "wednesday_start",
    "thursday_start",
    "friday_start",
    "saturday_start",
  ];

  const endFields = [
    "sunday_end",
    "monday_end",
    "tuesday_end",
    "wednesday_end",
    "thursday_end",
    "friday_end",
    "saturday_end",
  ];

  return {
    start: schedule?.[startFields[dow]] || null,
    end: schedule?.[endFields[dow]] || null,
  };
}

function calculateWorkedHours(start, end, breakMinutes = 60) {
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);

  const totalMinutes =
    eh * 60 +
    em -
    (sh * 60 + sm) -
    breakMinutes;

  return Math.max(0, totalMinutes / 60);
}

export async function restoreVacationsAttendance({
  startDate,
  endDate,
}) {

  const schedules = await prisma.work_schedule.findMany({
    where: { is_active: true },
  });

  const employees = await prisma.employee.findMany({
    select: {
      id: true,
      department_name: true,
    },
  });

  const employeeMap = new Map(
    employees.map(e => [e.id, e])
  );

  const vacations =
    await prisma.vacation_request.findMany({
      where: {
        status: "Aprobada",
        request_type: "Vacaciones",
        start_date: {
          lte: new Date(`${endDate}T23:59:59Z`),
        },
        end_date: {
          gte: new Date(`${startDate}T00:00:00Z`),
        },
      },
    });

  let fixed = 0;

  console.table(
    vacations.map(v => ({
      employee_id: v.employee_id,
      start_date: v.start_date,
      end_date: v.end_date,
      status: v.status,
      request_type: v.request_type
    }))
  );

  for (const vacation of vacations) {
    const employee =
      employeeMap.get(vacation.employee_id);

    console.log(
      `[VACACION] ${vacation.employee_id} ${vacation.start_date.toISOString().slice(0,10)} -> ${vacation.end_date.toISOString().slice(0,10)}`
    );

    if (!employee) continue;

    const dates = getDatesBetween(
      formatDate(vacation.start_date),
      formatDate(vacation.end_date)
    );

    for (const dateStr of dates) {

      if (
        dateStr < startDate ||
        dateStr > endDate
      ) {
        continue;
      }

      const schedule = getScheduleForDate(
        vacation.employee_id,
        employee.department_name,
        schedules,
        dateStr
      );

      const scheduleHours = schedule ? getScheduleHours(schedule, dateStr) : null;

      const startHour = scheduleHours?.start || "09:00";
      const endHour = scheduleHours?.end || "18:00";

      const breakMinutes = schedule?.break_duration_minutes ?? 60;

      const workedHours =
        calculateWorkedHours(
          startHour,
          endHour,
          breakMinutes
        );

      console.log(
        `[HORARIO] ${vacation.employee_id} ${dateStr}`,
        {
          scheduleFound: !!schedule,
          startHour,
          endHour,
          breakMinutes
        }
      );

      const existing =
        await prisma.attendance_record.findFirst({
          where: {
            employee_id: vacation.employee_id,
            date: new Date(`${dateStr}T00:00:00.000Z`),
          },
          select: {
            id: true,
            employee_id: true,
            date: true,
            status: true,
            notes: true,
          },
        });

      if (!existing) {
        console.log(`[NO EXISTE] ${vacation.employee_id} ${dateStr}`);
        continue;
      }

      console.log(`[ENCONTRADO] ${vacation.employee_id} ${dateStr} (${existing.status})`);
      console.dir(existing, { depth: null });

      await prisma.attendance_record.update({
        where: {
          id: existing.id
        },
        data: {
          status: "Justificado",
          notes: "Vacaciones aprobadas (Vacaciones)",

          scheduled_start: startHour,
          scheduled_end: endHour,

          clock_in: startHour,
          clock_out: endHour,

          worked_hours: workedHours,
          regular_hours: workedHours,

          overtime_hours_25: 0,
          overtime_hours_35: 0,

          is_absent: false,
          is_late: false,
          late_minutes: 0,

          updated_date: new Date(),
        },
      });

      console.log(
        `[ACTUALIZADO] ${vacation.employee_id} ${dateStr}`
      );

      fixed++;
    }
  }

  console.log(
    `[VACACIONES] Registros corregidos: ${fixed}`
  );

  return { fixed };
}
