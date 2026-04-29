import prisma from "../config/prisma.js";

/**
 * CONFIG
 */
const WINDOW_HOURS = 2;

/**
 * Utils
 */
function toHHMM(date) {
  return date.toTimeString().slice(0, 5);
}

function diffHours(a, b) {
  return (b - a) / 3600000;
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

    return {
      status: "Completo",
      clock_in: toHHMM(firstLog.punch_time),
      clock_out: toHHMM(lastLog.punch_time),
      worked_hours: parseFloat(worked.toFixed(2)),
      notes: null,
      usedLogIds: [firstLog.id, lastLog.id],
    };
  }

  /**
   * 7. Menos de 2 válidas
   */
  if (inWindowLogs.length < 2) {
    return {
      status: "Revisar",
      clock_in: logs.length > 0 ? toHHMM(logs[0].punch_time) : null,
      clock_out: null,
      worked_hours: 0,
      notes: "Marcaciones insuficientes dentro de ventana",
      usedLogIds: logs.length > 0 ? [logs[0].id] : [],
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
    : new Date(Date.now() - 24 * 60 * 60 * 1000); // ayer

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

  /**
   * 3. Obtener registros base
   */
  const records = await prisma.attendance_record.findMany({
    where: {
      date: new Date(dateStr + "T00:00:00"),
    },
  });

  let updated = 0;

  /**
   * 4. Procesar cada empleado
   */
  for (const record of records) {
    if (record.status === "Aprobada") {
      continue;
    }

    const key = `${record.employee_id}__${dateStr}`;
    const employeeLogs = grouped[key] || [];

    const result = computeAttendance({
      logs: employeeLogs,
      record,
    });

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
