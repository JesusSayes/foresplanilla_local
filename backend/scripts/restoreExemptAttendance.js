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

function calculateWorkedHours(
  start,
  end,
  breakMinutes = 60
) {
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);

  const totalMinutes =
    eh * 60 +
    em -
    (sh * 60 + sm) -
    breakMinutes;

  return Math.max(
    0,
    totalMinutes / 60
  );
}

export async function restoreExemptAttendance({
  startDate,
  endDate,
}) {

  const schedules =
    await prisma.work_schedule.findMany({
      where: {
        is_active: true,
      },
    });

  const employees =
    await prisma.employee.findMany({
      select: {
        id: true,
        department_name: true,
      },
    });

  let fixed = 0;

  for (const employee of employees) {

    const dates =
      getDatesBetween(
        startDate,
        endDate
      );

    for (const dateStr of dates) {

      const schedule =
        getScheduleForDate(
          employee.id,
          employee.department_name,
          schedules,
          dateStr
        );

      if (!schedule?.exempt_from_clocking) {
        continue;
      }

      const hours =
        getScheduleHours(
          schedule,
          dateStr
        );

      const startHour =
        hours.start || "09:00";

      const endHour =
        hours.end || "18:00";

      const workedHours =
        calculateWorkedHours(
          startHour,
          endHour,
          schedule?.break_duration_minutes ?? 60
        );

      const existing =
        await prisma.attendance_record.findFirst({
          where: {
            employee_id: employee.id,
            date: new Date(
              `${dateStr}T00:00:00.000Z`
            ),
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

        console.log(
          `[NO EXISTE] ${employee.id} ${dateStr}`
        );

        continue;
      }

      console.log(
        `[ENCONTRADO] ${employee.id} ${dateStr} (${existing.status})`
      );

      console.dir(
        {
          attendance_id: existing.id,
          startHour,
          endHour,
          workedHours,
          exempt_from_clocking:
            schedule.exempt_from_clocking,
        },
        { depth: null }
      );

      await prisma.attendance_record.update({
        where: {
          id: existing.id,
        },
        data: {
          status: "Completo",

          notes: existing.notes
            ? `${existing.notes} | Exonerado recuperado`
            : "Marcación automática - Exonerado de marcación física - recuperado",

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
        `[ACTUALIZADO] ${employee.id} ${dateStr}`
      );

      fixed++;
    }
  }

  console.log(
    `[EXONERADOS] Registros corregidos: ${fixed}`
  );

  return { fixed };
}
