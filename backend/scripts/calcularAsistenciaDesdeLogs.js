import prisma from "../config/prisma.js";
import { generate24HexId } from "../utils/idGenerator.js";
import {
  getScheduleForDate,
  calcularMetricas,
} from "../utils/attendanceMetrics.js";

/**
 * CONFIG
 */
const WINDOW_HOURS = 2;

/**
 * Utils
 */
function toHHMM(date) {
  return date.toLocaleTimeString("en-GB", {
    timeZone: "America/Lima",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function toPeruDateString(date) {
  const peru = new Date(
    date.getTime() - (5 * 60 * 60 * 1000)
  );

  const year = peru.getUTCFullYear();
  const month = String(peru.getUTCMonth() + 1).padStart(2, "0");
  const day = String(peru.getUTCDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function getPeruDayBounds(dateStr) {
  const start = new Date(`${dateStr}T05:00:00.000Z`);
  const end = new Date(start.getTime() + (24 * 60 * 60 * 1000) - 1);

  return { start, end };
}

function diffHours(a, b) {
  return (b - a) / 3600000;
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

function buildWindow(date, startTime, endTime) {
  const baseDate =
    typeof date === "string"
      ? date.slice(0, 10)
      : toPeruDateString(new Date(date));

  const [sh, sm] = startTime.split(":").map(Number);
  const [eh, em] = endTime.split(":").map(Number);

  // Perú UTC-5
  const startUTC = new Date(`${baseDate}T00:00:00.000Z`);
  const endUTC = new Date(`${baseDate}T00:00:00.000Z`);

  startUTC.setUTCHours(sh + 5 - WINDOW_HOURS, sm, 0, 0);
  endUTC.setUTCHours(eh + 5 + WINDOW_HOURS, em, 0, 0);

  return {
    start: startUTC,
    end: endUTC,
  };
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
        worked_hours: 0,
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
      worked_hours: 0,
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

  console.log("WINDOW DEBUG", {
    employee: record.employee_id,
    date: record.date,
    start,
    end,
    logs: logs.map(l => ({
      id: l.id,
      punch_time: l.punch_time,
      peru: toHHMM(l.punch_time),
    })),
  });

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
      worked_hours: 0,
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
      return {
        status: "Revisar",
        clock_in: toHHMM(firstLog.punch_time),
        clock_out: toHHMM(lastLog.punch_time),
        worked_hours: 0,
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
    worked_hours: 0,
    notes,
    usedLogIds: [firstLog.id, lastLog.id],
  };
}

/**
 * MAIN
 */
export async function calcularAsistenciaDesdeLogs({ date, force = false } = {}) {
  const targetDate = date
    ? new Date(date)
    : new Date();

  const dateStr = typeof date === "string"
    ? date.slice(0, 10)
    : toPeruDateString(targetDate);

  const forceRecalc = force === true || force === "true";

  console.log(`[FASE 2] Calculando asistencia para ${dateStr}`);

  const { start: startOfDay, end: endOfDay } = getPeruDayBounds(dateStr);

  /**
   * 1. Obtener logs del día
   */
  const allLogs = await prisma.attendance_logs.findMany({
    where: {
      punch_time: {
        gte: startOfDay,
        lte: endOfDay,
      },
    },
    orderBy: { punch_time: "asc" },
  });

  const logs = allLogs.filter(log =>
    toPeruDateString(log.punch_time) === dateStr
  );

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
      date: new Date(`${dateStr}T00:00:00.000Z`),
    },
  });

  const logEmployeeIds = [
    ...new Set(logs.map(log => log.employee_id).filter(Boolean)),
  ];

  const existingRecordEmployeeIds = new Set(
    records.map(record => record.employee_id).filter(Boolean)
  );

  const missingEmployeeIds = logEmployeeIds.filter(
    employeeId => !existingRecordEmployeeIds.has(employeeId)
  );

  if (missingEmployeeIds.length > 0) {
    await prisma.attendance_record.createMany({
      data: missingEmployeeIds.map(employeeId => ({
        id: generate24HexId(),
        employee_id: employeeId,
        date: startOfDay,
        status: "Sin marcar",
        worked_hours: 0,
        is_absent: false,
        created_date: new Date(),
        updated_date: new Date(),
      })),
      skipDuplicates: true,
    });
  }

  const recordsToProcess = await prisma.attendance_record.findMany({
    where: {
      date: new Date(`${dateStr}T00:00:00.000Z`),
    },
  });

  const employeeIds = [
    ...new Set(recordsToProcess.map(r => r.employee_id).filter(Boolean)),
  ];

  const [employees, schedulesRaw] = await Promise.all([
    prisma.employee.findMany({
      where: { id: { in: employeeIds } },
      select: { id: true, department_name: true,
        document_number: true,
        first_name: true,
        last_name: true,
        attendance_method: true,
      },
    }),
    prisma.work_schedule.findMany({
      where: { is_active: true },
      orderBy: { id: "asc" },
    }),
  ]);

  const employeeMap = new Map(employees.map(emp => [emp.id, emp]));

  // console.log("\n[ATTENDANCE] EMPLOYEES TO PROCESS\n");
  // for (const emp of employees) {
    // console.log({
      // employee_id: emp.id,
      // document_number: emp.document_number,
      // name: `${emp.first_name || ""} ${emp.last_name || ""}`.trim(),
      // department: emp.department_name,
    // });
  // }
  // console.log("\n");

  let updated = 0;

  const incidents = await prisma.attendance_incident.findMany({
    where: {
      incident_date: {
        gte: startOfDay,
        lte: endOfDay,
      },
      status: "Aprobada",
    },
  });

  const approvedIncidents = new Set();

  for (const incident of incidents) {
    approvedIncidents.add(`${incident.employee_id}__${toPeruDateString(incident.incident_date)}`);
  };

  const overtimeAlerts = await prisma.overtime_alert.findMany({
    where: { status: "Pendiente", },
    select: { attendance_record_id: true, },
  });

  const pendingOvertimeRecordIds = new Set(
    overtimeAlerts
      .map(a => a.attendance_record_id)
      .filter(Boolean)
  );

  /**
   * 4. Procesar cada empleado
   */
  for (const record of recordsToProcess) {
    const recordDate = toPeruDateString(record.date);
    const today = toPeruDateString(new Date());

    // automático:
    // solo recalcular HOY
    if (!forceRecalc && recordDate !== today) {
      continue;
    }

    const protectedStatuses = ["Vacaciones", ]; // Aprobada?

    if (protectedStatuses.includes(record.status) && !forceRecalc) {
      continue;
    }

    const employee = employeeMap.get(record.employee_id);

    if (employee?.attendance_method !== "MARCADOR") {
      continue;
    }

    const schedule = getScheduleForDate(
      record.employee_id,
      employee?.department_name,
      schedulesRaw,
      dateStr
    );

    const dow = new Date(dateStr + "T00:00:00").getDay();

    const dayStartMap = ["sunday_start", "monday_start", "tuesday_start", "wednesday_start", "thursday_start", "friday_start", "saturday_start",];
    const dayEndMap = ["sunday_end", "monday_end", "tuesday_end", "wednesday_end", "thursday_end", "friday_end", "saturday_end",];

    const scheduledStart = schedule?.[dayStartMap[dow]] || null;
    const scheduledEnd = schedule?.[dayEndMap[dow]] || null;

    if (schedule?.exempt_from_clocking) {
      continue;
    }

    const key = `${record.employee_id}__${dateStr}`;
    const employeeLogs = grouped[key] || [];
    const hasSchedule = !!scheduledStart && !!scheduledEnd;

    const result = computeAttendance({
      logs: employeeLogs,
      record: {
        ...record,
        scheduled_start: hasSchedule ? scheduledStart : null,
        scheduled_end: hasSchedule ? scheduledEnd : null,
      },
    });

    const overtimeAuth =
      (record.overtime_authorized === true || schedule?.overtime_authorized === true) &&
      !pendingOvertimeRecordIds.has(record.id);

    const metrics = calcularMetricas(
      {
        ...record,
        clock_in: result.clock_in,
        clock_out: result.clock_out,
        status: result.status,
      },
      schedule,
      dateStr,
      overtimeAuth
    );

    const hasApprovedIncident =  approvedIncidents.has(`${record.employee_id}__${recordDate}`);

    console.log({
      employee: record.employee_id,
      recordDate,
      hasApprovedIncident,
      recordStatus: record.status,
    });
    let finalStatus = result.status;

    if (record.status === "Vacaciones") {
      finalStatus = "Vacaciones";
    }
    else if (hasApprovedIncident) {
      finalStatus = "Justificado";
    }
    else if (!result.clock_in) {
      finalStatus = "Ausente";
    }
    else if (result.clock_in && !result.clock_out) {
      finalStatus = "Incompleto";
    }

    /**
     * Resetear logs del día
     */
    await prisma.attendance_logs.updateMany({
      where: {
        attendance_record_id: record.id,
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
            Array.isArray(result.usedLogIds) &&
            result.usedLogIds.includes(log.id),
          updated_date: new Date(),
        },
      });
    }

    // console.log({
      // employee: record.employee_id,
      // date: recordDate,
      // before: {
        // clock_in: record.clock_in,
        // clock_out: record.clock_out,
        // status: record.status,
      // },
      // after: {
        // clock_in: result.clock_in,
        // clock_out: result.clock_out,
        // status: finalStatus,
      // },
    // });

    await prisma.attendance_record.update({
      where: { id: record.id },
      data: {
        clock_in: result.clock_in,
        clock_out: result.clock_out,

        worked_hours: metrics.worked_hours,
        regular_hours: metrics.regular_hours,
        overtime_hours_25: metrics.overtime_hours_25,
        overtime_hours_35: metrics.overtime_hours_35,

        is_late: metrics.is_late,
        late_minutes: metrics.late_minutes,
        is_absent: metrics.is_absent,

        scheduled_start: hasSchedule ? scheduledStart : null,
        scheduled_end: hasSchedule ? scheduledEnd : null,

        status: finalStatus,
        notes: result.notes ?? record.notes,

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
//
// for d in $(seq 0 $(( ( $(date -d "$(date +%F)" +%s) - $(date -d "2026-04-21" +%s) ) / 86400 ))); do
//  day=$(date -d "2026-04-21 +$d day" +%F)
//  node scripts/calcularAsistenciaDesdeLogs.js --date="$day" --force=true
// done
