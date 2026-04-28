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
  const base = new Date(date);

  const [sh, sm] = startTime.split(":").map(Number);
  const [eh, em] = endTime.split(":").map(Number);

  const start = new Date(base);
  start.setHours(sh - WINDOW_HOURS, sm, 0, 0);

  const end = new Date(base);
  end.setHours(eh + WINDOW_HOURS, em, 0, 0);

  return { start, end };
}

/**
 * CORE LOGIC
 */
function computeAttendance({ punches, record }) {
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
    };
  }

  /**
   * 2. Una sola marcación
   */
  if (punches.length === 1) {
    return {
      status: "Incompleto",
      clock_in: null,
      clock_out: null,
      worked_hours: 0,
      notes: "Solo una marcación",
    };
  }

  /**
   * 3. Sin horario definido
   */
  if (!record.scheduled_start || !record.scheduled_end) {
    return {
      status: "Revisar",
      clock_in: null,
      clock_out: null,
      worked_hours: 0,
      notes: "Sin horario definido",
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
   * 5. Separar marcaciones
   */
  const inWindow = punches.filter(p => p >= start && p <= end);
  const outWindow = punches.filter(p => p < start || p > end);

  /**
   * 6. Insuficientes marcaciones válidas
   */
  if (inWindow.length < 2) {
    return {
      status: "Revisar",
      clock_in: null,
      clock_out: null,
      worked_hours: 0,
      notes: "Marcaciones insuficientes dentro de ventana",
    };
  }

  /**
   * 7. Calcular extremos
   */
  const clockIn = inWindow[0];
  const clockOut = inWindow[inWindow.length - 1];

  /**
   * 8. Validación de marcaciones completas
   */
  if (!clockIn || !clockOut) {
    return {
      status: "Incompleto",
      clock_in: clockIn ? toHHMM(clockIn) : null,
      clock_out: clockOut ? toHHMM(clockOut) : null,
      worked_hours: 0,
      notes: "Falta marcación de entrada o salida",
    };
  }

  /**
   * 9. Validaciones adicionales
   */
  let status = "Completo";

  if (outWindow.length > 0) {
    status = "Revisar";
  }

  /**
   * 10. Horas trabajadas
   */
  const worked = diffHours(clockIn, clockOut);

  return {
    status,
    clock_in: toHHMM(clockIn),
    clock_out: toHHMM(clockOut),
    worked_hours: parseFloat(worked.toFixed(2)),
    notes:
      outWindow.length > 0
        ? "Marcaciones fuera de ventana"
        : null,
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

    grouped[key].push(log.punch_time);
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
    const punches = grouped[key] || [];

    const result = computeAttendance({
      punches,
      record,
    });

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