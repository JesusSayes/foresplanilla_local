import pg from "pg";
import prisma from "../../config/prisma.js";
import { generate24HexId } from "../../utils/idGenerator.js";

const { Pool } = pg;

let biotimePool = null;

function getBiotimePool() {
  if (!biotimePool) {
    biotimePool = new Pool({
      connectionString: process.env.BIOTIME_DATABASE_URL,
      max: 5,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    });
  }
  return biotimePool;
}

export async function syncBiotimeAttendance({ startDate, endDate } = {}) {
  const startedAt = new Date();

  let inserted = 0;
  let skipped = 0;
  let errors = 0;
  const errorDetails = [];

  const dateFrom = startDate
    ? new Date(startDate)
    : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const dateTo = endDate ? new Date(endDate) : new Date();

  if (isNaN(dateFrom.getTime()) || isNaN(dateTo.getTime())) {
    return {
      success: false,
      error: "Fechas inválidas. Use formato YYYY-MM-DD.",
    };
  }

  console.log(`[BiotimeSync] Inicio: ${startedAt.toISOString()}`);
  console.log(`[BiotimeSync] Rango: ${dateFrom.toISOString()} → ${dateTo.toISOString()}`);

  const pool = getBiotimePool();
  const client = await pool.connect();

  try {
    const { rows: transactions } = await client.query(
      `
      SELECT
        t.id,
        t.emp_code,
        t.punch_time,
        t.punch_state,
        t.verify_type,
        t.terminal_alias,
        t.area_alias,
        t.upload_time
      FROM iclock_transaction t
      WHERE t.punch_time >= $1
      AND t.punch_time <= $2
      ORDER BY t.emp_code, t.punch_time ASC
      `,
      [dateFrom, dateTo]
    );

    console.log(`[BiotimeSync] ${transactions.length} marcaciones obtenidas`);

    if (!transactions.length) {
      return {
        success: true,
        inserted: 0,
        skipped: 0,
        errors: 0,
        message: "No hay datos",
      };
    }

    const existingBiotimeLogs = await prisma.attendance_logs.findMany({
      where: {
        source: "biotime",
        punch_time: {
          gte: dateFrom,
          lte: dateTo,
        },
      },
      select: {
        raw_payload: true,
      },
    });

    const seenBiotimeIds = new Set(
      existingBiotimeLogs
        .map((log) => log?.raw_payload?.biotime_id)
        .filter((id) => id !== null && id !== undefined)
        .map((id) => String(id))
    );

    // 🔹 Mapear empleados
    const employees = await prisma.employee.findMany({
      select: {
        id: true,
        document_number: true,
      },
    });

    const employeeMap = {};
    for (const emp of employees) {
      if (emp.document_number) {
        employeeMap[emp.document_number.padStart(8, "0")] = emp.id;
      }
    }

    // 🔹 Procesar transacciones UNA POR UNA (simple y seguro)
    for (const tx of transactions) {
      try {
        const biotimeId = tx.id !== null && tx.id !== undefined ? String(tx.id) : null;
        if (!biotimeId || seenBiotimeIds.has(biotimeId)) {
          skipped++;
          continue;
        }

        const empCode = tx.emp_code?.padStart(8, "0");
        if (!empCode) {
          skipped++;
          continue;
        }

        const employeeId = employeeMap[empCode];
        if (!employeeId) {
          skipped++;
          continue;
        }

        const punchTime = new Date(tx.punch_time);

        await prisma.attendance_logs.create({
          data: {
            id: generate24HexId(),
            employee_id: employeeId,
            punch_time: punchTime,
            source: "biotime",
            raw_payload: {
              biotime_id: tx.id,
              punch_state: tx.punch_state,
              verify_type: tx.verify_type,
              terminal_alias: tx.terminal_alias,
              area_alias: tx.area_alias,
              upload_time: tx.upload_time,
            },
            created_date: new Date(),
            updated_date: new Date(),
          },
        });

        seenBiotimeIds.add(biotimeId);
        inserted++;
      } catch (err) {
        errors++;
        errorDetails.push(`TX ${tx.id}: ${err.message}`);
      }
    }

    const finishedAt = new Date();
    const durationMs = finishedAt - startedAt;

    console.log(`[BiotimeSync] Logs insertados: ${inserted}`);
    console.log(`[BiotimeSync] Logs omitidos: ${skipped}`);
    console.log(`[BiotimeSync] Errores: ${errors}`);
    console.log(`[BiotimeSync] Duración: ${durationMs} ms`);

    return {
      success: true,
      inserted,
      skipped,
      errors,
      errorDetails,
      durationMs,
    };
  } catch (err) {
    console.error("[BiotimeSync] Error general:", err.message);

    return {
      success: false,
      error: err.message,
      inserted,
      skipped,
      errors,
    };
  } finally {
    client.release();
  }
}

export async function triggerSync(req, res) {
  try {
    const startDate = req.body?.startDate || req.query?.startDate;
    const endDate = req.body?.endDate || req.query?.endDate;

    const result = await syncBiotimeAttendance({
      startDate,
      endDate,
    });

    res.json(result);
  } catch (err) {
    console.error("[BiotimeSync] trigger error:", err.message);

    res.status(500).json({
      success: false,
      error: err.message,
    });
  }
}

const controller = {
  triggerSync,
};

export default controller;
