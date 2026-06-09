import pg from "pg";
import { Prisma } from "@prisma/client";
import prisma from "../../config/prisma.js";
import { calcularAsistenciaDesdeLogs } from "../../scripts/calcularAsistenciaDesdeLogs.js";
import { generate24HexId } from "../../utils/idGenerator.js";

const { Pool } = pg;

let biotimePool = null;

function getPunchMinuteKey(employeeId, punchTime) {
  if (!employeeId || !punchTime) return null;
  const parsed = new Date(punchTime);
  if (Number.isNaN(parsed.getTime())) return null;
  return `${employeeId}|${parsed.toISOString().slice(0, 16)}`;
}

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

function normalizeDocumentNumber(value) {
  if (value === null || value === undefined) {
    return null;
  }

  const digits = String(value)
    .trim()
    .replace(/\.0$/, "")
    .replace(/\D/g, "");

  if (!digits) {
    return null;
  }

  return digits.padStart(8, "0");
}

export async function syncBiotimeAttendance({ startDate, endDate } = {}) {
  const startedAt = new Date();

  let inserted = 0;
  let skipped = 0;
  let errors = 0;
  const errorDetails = [];

  const dateFrom = startDate
    ? new Date(startDate)
    : new Date(Date.now() - 1 * 24 * 60 * 60 * 1000);

  const dateTo = endDate ? new Date(`${endDate}T23:59:59.999`) : new Date();

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

    const uniqueTransactions = [];
    const affectedDates = new Set();
    const incomingBiotimeIdsSet = new Set();

    for (const tx of transactions) {
      const biotimeId = tx.id !== null && tx.id !== undefined ? String(tx.id) : null;
      if (!biotimeId || incomingBiotimeIdsSet.has(biotimeId)) {
        skipped++;
        continue;
      }
      incomingBiotimeIdsSet.add(biotimeId);
      uniqueTransactions.push(tx);
    }

    const incomingBiotimeIds = Array.from(incomingBiotimeIdsSet);

    const existingBiotimeRows = incomingBiotimeIds.length
      ? await prisma.$queryRaw(
          Prisma.sql`SELECT raw_payload->>'biotime_id' AS biotime_id FROM attendance_logs WHERE source = 'biotime' AND raw_payload IS NOT NULL AND raw_payload->>'biotime_id' IN (${Prisma.join(incomingBiotimeIds)})`
        )
      : [];

    const seenBiotimeIds = new Set(
      existingBiotimeRows
        .map((row) => row?.biotime_id)
        .filter((id) => id !== null && id !== undefined)
        .map((id) => String(id))
    );

    const employees = await prisma.employee.findMany({
      select: {
        id: true,
        document_number: true,
      },
    });

    // console.log("[BiotimeSync][DEBUG EMPLOYEES]", {
      // total: employees.length,
      // sample: employees.slice(0, 10).map(emp => ({
        // id: emp.id,
        // document_number: emp.document_number,
        // normalized: normalizeDocumentNumber(emp.document_number),
      // })),
      // Busca específicamente el 74590081
      // targetMatch: employees.filter(emp => {
        // const normalized = normalizeDocumentNumber(emp.document_number);
        // return normalized === '74590081' || String(emp.document_number)?.trim() === '19851589';
      // }),
    // });

    const employeeMap = new Map();

    for (const emp of employees) {
      if (!emp.document_number) {
        console.log("[BiotimeSync][EMPLOYEE WITHOUT DOCUMENT]", {
          employeeId: emp.id,
        });

        continue;
      }

      const normalizedDocument = normalizeDocumentNumber(
        emp.document_number
      );

      if (!normalizedDocument) {
        console.log("[BiotimeSync][INVALID DOCUMENT]", {
          employeeId: emp.id,
          document_number: emp.document_number,
        });

        continue;
      }

      employeeMap.set(normalizedDocument, emp.id);

    }

    // console.log("[BiotimeSync][MAP]", {
      // employeeMap: employeeMap,
    // });

    const encontrados = new Array();
    const noEncontrados = new Array();

    for (const tx of uniqueTransactions) {
      try {
        const biotimeId = tx.id !== null && tx.id !== undefined ? String(tx.id) : null;

        if (!biotimeId) {
          skipped++;
          continue;
        }

        // Preservar hora local Perú
        const punchTime = new Date(tx.punch_time);

        // Recalcular aunque el log ya exista
        affectedDates.add(
          punchTime.toLocaleDateString("sv-SE", {
            timeZone: "America/Lima",
          })
        );

        if (seenBiotimeIds.has(biotimeId)) {
          skipped++;
          continue;
        }

        const empCode = normalizeDocumentNumber(tx.emp_code);

        if (!empCode) {
          skipped++;
          continue;
        }

        const employeeId = employeeMap.get(empCode);

        // console.log("[BiotimeSync][LOOKUP]", {
          // raw_emp_code: tx.emp_code,
          // normalized_emp_code: empCode,
          // employeeId: employeeId,
          // exists: !!employeeId,
        // });
        noEncontrados.push(tx.emp_code);

        if (!employeeId) {
          console.log("[BiotimeSync][EMPLOYEE NOT FOUND]", {
            biotime_id: tx.id,

            raw_emp_code: tx.emp_code,
            normalized_emp_code: empCode,

            available_matches: Array.from(employeeMap.keys())
              .filter(k =>
                k.includes(empCode) ||
                empCode.includes(k)
              )
              .slice(0, 10),

            punch_time: tx.punch_time,
            terminal: tx.terminal_alias,
          });

          skipped++;
          continue;
        }
        if(employeeId){encontrados.push(tx.emp_code);}

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
        if (err?.code === "P2002") {
          skipped++;
          continue;
        }
        errors++;
        errorDetails.push(`TX ${tx.id}: ${err.message}`);
      }
    }

    console.log("[BiotimeSync][Encontrados - No Encontrados]", {
      encontrados: encontrados,
      noEncontrados: noEncontrados,
    });

    console.log(
      `[BiotimeSync] Recalculando ${affectedDates.size} fechas`
    );

    for (const affectedDate of affectedDates) {
      await calcularAsistenciaDesdeLogs({
        date: affectedDate,
        force: true,
      });
    }

    const finishedAt = new Date();
    const durationMs = finishedAt - startedAt;

    console.log(`[BiotimeSync] Logs insertados: ${inserted}`);
    console.log(`[BiotimeSync] Logs omitidos: ${skipped}`);
    console.log(`[BiotimeSync] Errores: ${errors}`);
    console.log(`[BiotimeSync] Fechas recalculadas: ${affectedDates.size}`);
    console.log(`[BiotimeSync] Duración: ${durationMs} ms`);

    return {
      success: true,
      inserted,
      skipped,
      errors,
      recalculatedDates: affectedDates.size,
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
