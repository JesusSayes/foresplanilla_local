import prisma from "../config/prisma.js";

/**
 * CONFIG
 */
const WINDOW_HOURS = 2;
const DAY_NAMES = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

/**
 * Utils
 */
function toHHMM(date) {
  return date.toTimeString().slice(0, 5);
}

function diffHours(a, b) {
  return (b - a) / 3600000;
}

function toMinutes(hhmm) {
  if (!hhmm || typeof hhmm !== "string") return null;
  const [h, m] = hhmm.slice(0, 5).split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return h * 60 + m;
}

function computeLate(clockIn, scheduledStart) {
  if (!clockIn) {
    return { is_late: null, late_minutes: null };
  }

  const inMinutes = toMinutes(clockIn);
  const startMinutes = toMinutes(scheduledStart);

  if (inMinutes === null || startMinutes === null) {
    return { is_late: false, late_minutes: 0 };
  }

  const lateMinutes = Math.max(0, inMinutes - startMinutes);
  return { is_late: lateMinutes > 0, late_minutes: lateMinutes };
}

function computeOvertimeFields(clockIn, clockOut, record) {
  if (!clockIn || !clockOut) {
    return {
      overtime_hours_25: null,
      overtime_hours_35: null,
    };
  }

  return {
    overtime_hours_25: record.overtime_hours_25,
    overtime_hours_35: record.overtime_hours_35,
  };
}

function deduplicateLogs(logs) {
  const seen = new Set();

  return logs.filter(log => {
    const key = log.punch_time.getTime();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function getScheduleForDate(employeeId, departmentName, schedules, dateStr) {
  const candidates = schedules.filter(s => {
    const isForEmployee = s.employee_id === employeeId;
    const isForDept = !s.employee_id && departmentName &&
      (Array.isArray(s.departments)
        ? s.departments.includes(departmentName)
        : s.department_name === departmentName);
    return isForEmployee || isForDept;
  });

  const findBest = (list) => {
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

function buildWindow(date, startTime, endTime) {
  const baseDate =
    typeof date === "string"
      ? date.slice(0, 10)
      : new Date(date).toISOString().slice(0, 10);

  const [sh, sm] = startTime.split(":").map(Number);
  const [eh, em] = endTime.split(":").map(Number);

  const start = new Date(`${baseDate}T00:00:00`);
  const end = new Date(`${baseDate}T00:00:00`);

  start.setHours(sh - WINDOW_HOURS, sm, 0, 0);
  end.setHours(eh + WINDOW_HOURS, em, 0, 0);

  return { start, end };
}

/**
 * CORE LOGIC
 */
function computeAttendance({ logs, record }) {
  const punches = logs.map(l => l.punch_time);

  /**
   * 1. Sin marcaciones
   */
  if (!punches.length) {
    return {
      status: "Sin marcar",
      clock_in: null,
      clock_out: null,
      worked_hours: 0,
      notes: "Sin marcaciones",
      usedLogIds: [],
    };
  }

  /**
   * 2. Una sola marcación
   */
  if (punches.length === 1) {
    return {
      status: "Incompleto",
      clock_in: toHHMM(punches[0]),
      clock_out: null,
      worked_hours: 0,
      notes: "Solo una marcación",
      usedLogIds: [logs[0].id],
    };
  }

  /**
   * 3. SIN HORARIO DEFINIDO
   */
  if (!record.scheduled_start || !record.scheduled_end) {
    const firstLog = logs[0];
    const lastLog = logs[logs.length - 1];

    const clockIn = firstLog.punch_time;
    const clockOut = lastLog.punch_time;

    const worked = diffHours(clockIn, clockOut);

    /**
     * EXACTAMENTE 2 marcaciones
     */
    if (logs.length === 2) {
      const status =
        worked >= 6
          ? "Completo"
          : "Revisar";

      return {
        status,
        clock_in: toHHMM(clockIn),
        clock_out: toHHMM(clockOut),
        worked_hours: parseFloat(worked.toFixed(2)),
        notes:
          worked >= 6
            ? "Calculado sin horario definido"
            : "Sin horario definido con menos de 6 horas",
        usedLogIds: [firstLog.id, lastLog.id],
      };
    }

    /**
     * MÁS DE 2 marcaciones
     * siempre Revisar
     */
    return {
      status: "Revisar",
      clock_in: toHHMM(clockIn),
      clock_out: toHHMM(clockOut),
      worked_hours: parseFloat(worked.toFixed(2)),
      notes: "Sin horario definido con múltiples marcaciones",
      usedLogIds: [firstLog.id, lastLog.id],
    };
  }

  /**
   * 4. Construir ventana
   */
  const { start, end } = buildWindow(
    record.date,
    record.scheduled_start,
    record.scheduled_end
  );

  /**
   * 5. Marcar ventana
   */
  for (const log of logs) {
    log._is_within_window =
      log.punch_time >= start &&
      log.punch_time <= end;
  }

  const inWindowLogs = logs.filter(
    l => l._is_within_window
  );

  const outWindowLogs = logs.filter(
    l => !l._is_within_window
  );

  /**
   * 6. Exactamente 2 marcaciones dentro de ventana
   */
  if (
    logs.length === 2 &&
    inWindowLogs.length === 2
  ) {
    const firstLog = inWindowLogs[0];
    const lastLog = inWindowLogs[1];

    const worked = diffHours(
      firstLog.punch_time,
      lastLog.punch_time
    );

    const status = worked >= 6 ? "Completo" : "Revisar";

    return {
      status,
      clock_in: toHHMM(firstLog.punch_time),
      clock_out: toHHMM(lastLog.punch_time),
      worked_hours: parseFloat(worked.toFixed(2)),
      notes: worked >= 6 ? null : "Jornada incompleta",
      usedLogIds: [firstLog.id, lastLog.id],
    };
  }

  /**
   * 7. Menos de 2 válidas
   */
  if (inWindowLogs.length < 2) {
    const firstLog = logs[0] || null;
    const lastLog = logs[logs.length - 1] || null;

    if (firstLog && lastLog && firstLog.id !== lastLog.id) {
      const worked = diffHours(firstLog.punch_time, lastLog.punch_time);
      return {
        status: "Revisar",
        clock_in: toHHMM(firstLog.punch_time),
        clock_out: toHHMM(lastLog.punch_time),
        worked_hours: parseFloat(worked.toFixed(2)),
        notes: inWindowLogs.length === 1
          ? "Marcaciones parciales dentro de ventana"
          : "Sin marcaciones dentro de ventana horaria",
        usedLogIds: [firstLog.id, lastLog.id],
      };
    }

    const bestLog = inWindowLogs.length > 0
      ? inWindowLogs[0]
      : logs[0];

    return {
      status: "Revisar",
      clock_in: bestLog ? toHHMM(bestLog.punch_time) : null,
      clock_out: null,
      worked_hours: 0,
      notes: inWindowLogs.length === 1
        ? "Solo una marcación dentro de ventana"
        : "Sin marcaciones dentro de ventana horaria",
      usedLogIds: bestLog ? [bestLog.id] : [],
    };
  }

  /**
   * 8. Primera y última válida
   */
  const firstLog = inWindowLogs[0];
  const lastLog = inWindowLogs[inWindowLogs.length - 1];

  const clockIn = firstLog.punch_time;
  const clockOut = lastLog.punch_time;

  const worked = diffHours(clockIn, clockOut);

  let status = "Completo";
  let notes = null;

  if (outWindowLogs.length > 0) {
    status = "Revisar";
    notes = "Marcaciones fuera de ventana";
  }

  return {
    status,
    clock_in: toHHMM(clockIn),
    clock_out: toHHMM(clockOut),
    worked_hours: parseFloat(worked.toFixed(2)),
    notes,
    usedLogIds: [firstLog.id, lastLog.id],
  };
}

/**
 * MAIN
 */
export async function calcularAsistenciaDesdeLogs({ date } = {}) {
  const targetDate = date
    ? new Date(date)
    : new Date();

  const dateStr = targetDate.toISOString().slice(0, 10);

  console.log(`[FASE 2] Calculando asistencia para ${dateStr}`);

  /**
   * 1. Obtener logs del día
   */
  const logs = await prisma.attendance_logs.findMany({
    where: {
      punch_time: {
        gte: new Date(dateStr + "T00:00:00"),
        lte: new Date(dateStr + "T23:59:59"),
      },
    },
    orderBy: { punch_time: "asc" },
  });

  /**
   * 2. Agrupar por empleado
   */
  const grouped = {};

  for (const log of logs) {
    const key = `${log.employee_id}__${dateStr}`;

    if (!grouped[key]) {
      grouped[key] = [];
    }

    grouped[key].push(log);
  }

  for (const key of Object.keys(grouped)) {
    grouped[key] = deduplicateLogs(grouped[key]);
  }

  /**
   * 3. Obtener registros base
   */
  const records = await prisma.attendance_record.findMany({
    where: {
      date: new Date(dateStr + "T00:00:00"),
    },
  });

  const employeeIds = [
    ...new Set(records.map(r => r.employee_id).filter(Boolean)),
  ];

  const [employees, schedulesRaw] = await Promise.all([
    prisma.employee.findMany({
      where: { id: { in: employeeIds } },
      select: { id: true, department_name: true },
    }),
    prisma.work_schedule.findMany({
      where: { is_active: true },
      orderBy: { id: "asc" },
    }),
  ]);

  const employeeMap = new Map(employees.map(emp => [emp.id, emp]));

  let updated = 0;

  /**
   * 4. Procesar cada empleado
   */
  for (const record of records) {
    if (record.status === "Aprobada" && record.clock_in && record.clock_out) {
      continue;
    }

    const employee = employeeMap.get(record.employee_id);
    const schedule = getScheduleForDate(
      record.employee_id,
      employee?.department_name,
      schedulesRaw,
      dateStr
    );

    if (schedule?.exempt_from_clocking) {
      continue;
    }

    const key = `${record.employee_id}__${dateStr}`;
    const employeeLogs = grouped[key] || [];

    const result = computeAttendance({
      logs: employeeLogs,
      record,
    });

    const lateData = computeLate(result.clock_in, record.scheduled_start);
    const overtimeData = computeOvertimeFields(result.clock_in, result.clock_out, record);

    /**
     * Resetear logs del día
     */
    await prisma.attendance_logs.updateMany({
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
    });

    /**
     * Persistir flags
     */
    for (const log of employeeLogs) {
      await prisma.attendance_logs.update({
        where: {
          id: log.id,
        },
        data: {
          attendance_record_id: record.id,
          is_within_window:
            typeof log._is_within_window === "boolean"
              ? log._is_within_window
              : null,
          is_used_for_calculation:
            result.usedLogIds.includes(log.id),
          updated_date: new Date(),
        },
      });
    }

    await prisma.attendance_record.update({
      where: { id: record.id },
      data: {
        clock_in: result.clock_in,
        clock_out: result.clock_out,
        worked_hours: result.worked_hours,
        is_late: lateData.is_late,
        late_minutes: lateData.late_minutes,
        overtime_hours_25: overtimeData.overtime_hours_25,
        overtime_hours_35: overtimeData.overtime_hours_35,
        status: result.status,
        notes: result.notes,
        updated_date: new Date(),
      },
    });

    updated++;
  }

  console.log(`[FASE 2] Registros actualizados: ${updated}`);

  return {
    success: true,
    date: dateStr,
    updated,
  };
}

/**
 * CLI
 */
if (process.argv[1].includes("calcularAsistenciaDesdeLogs")) {
  const args = {};
  for (let i = 2; i < process.argv.length; i++) {
    const [k, v] = process.argv[i].split("=");
    if (k && v) args[k.replace("--", "")] = v;
  }

  calcularAsistenciaDesdeLogs(args)
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

// Caso	                          Resultado
// 0 marcaciones	                Sin marcar
// 1 marcación	                  Incompleto
// sin horario	                  Revisar
// marcaciones fuera de ventana	  Revisar
// correcto	                      Completo
