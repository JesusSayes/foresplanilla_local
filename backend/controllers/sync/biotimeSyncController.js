import pg from 'pg';
import { PrismaClient } from '@prisma/client';
import { generate24HexId } from '../../utils/idGenerator.js';

const { Pool } = pg;
const prisma = new PrismaClient();

let biotimePool = null;

function getBiotimePool() {
  if (!biotimePool) {
    biotimePool = new Pool({
      connectionString: process.env.BIOTIME_DATABASE_URL,
    });
  }
  return biotimePool;
}

export async function syncBiotimeAttendance({ startDate, endDate } = {}) {
  const startedAt = new Date();
  let inserted = 0;
  let updated = 0;
  let errors = 0;
  let errorDetails = [];

  const dateFrom = startDate ? new Date(startDate) : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const dateTo = endDate ? new Date(endDate) : new Date();

  if (isNaN(dateFrom.getTime()) || isNaN(dateTo.getTime())) {
    return { success: false, error: 'Fechas inválidas. Use formato YYYY-MM-DD.' };
  }

  console.log(`[BiotimeSync] Iniciando sincronización: ${startedAt.toISOString()}`);
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
        t.upload_time,
        e.first_name,
        e.last_name
      FROM iclock_transaction t
      LEFT JOIN personnel_employee e ON e.emp_code = t.emp_code
      WHERE t.punch_time >= $1 AND t.punch_time <= $2
      ORDER BY t.emp_code, t.punch_time ASC
      `,
      [dateFrom, dateTo]
    );

    console.log(`[BiotimeSync] ${transactions.length} marcaciones obtenidas de biotime`);

    const grouped = {};
    for (const tx of transactions) {
      const empCode = tx.emp_code?.padStart(8, '0');
      if (!empCode) continue;

      const punchTime = new Date(tx.punch_time);
      const dateKey = punchTime.toISOString().slice(0, 10);
      const key = `${empCode}__${dateKey}`;

      if (!grouped[key]) {
        grouped[key] = {
          empCode,
          dateKey,
          punches: [],
        };
      }
      grouped[key].punches.push(punchTime);
    }

    const employees = await prisma.employee.findMany({
      select: { id: true, document_number: true },
    });
    const employeeMap = {};
    for (const emp of employees) {
      if (emp.document_number) {
        employeeMap[emp.document_number.padStart(8, '0')] = emp.id;
      }
    }

    for (const key of Object.keys(grouped)) {
      const { empCode, dateKey, punches } = grouped[key];

      const employeeId = employeeMap[empCode];
      if (!employeeId) continue;

      punches.sort((a, b) => a - b);
      const clockIn = punches[0];
      const clockOut = punches.length > 1 ? punches[punches.length - 1] : null;

      const clockInStr = clockIn.toTimeString().slice(0, 5);
      const clockOutStr = clockOut ? clockOut.toTimeString().slice(0, 5) : null;

      let workedHours = null;
      if (clockOut) {
        const diffMs = clockOut - clockIn;
        workedHours = parseFloat((diffMs / 3600000).toFixed(2));
      }

      const recordDate = new Date(dateKey);

      try {
        const existing = await prisma.attendance_record.findFirst({
          where: { employee_id: employeeId, date: recordDate },
        });

        if (existing) {
          await prisma.attendance_record.update({
            where: { id: existing.id },
            data: {
              clock_in: clockInStr,
              clock_out: clockOutStr,
              worked_hours: workedHours,
              updated_date: new Date(),
              status: 'present',
              is_absent: false,
            },
          });
          updated++;
        } else {
          await prisma.attendance_record.create({
            data: {
              id: generate24HexId(),
              employee_id: employeeId,
              date: recordDate,
              clock_in: clockInStr,
              clock_out: clockOutStr,
              worked_hours: workedHours,
              status: 'present',
              is_absent: false,
              created_date: new Date(),
              updated_date: new Date(),
              created_by: 'biotime_sync',
              is_sample: false,
            },
          });
          inserted++;
        }
      } catch (err) {
        errors++;
        errorDetails.push(`${empCode} ${dateKey}: ${err.message}`);
      }
    }

    const finishedAt = new Date();
    const durationMs = finishedAt - startedAt;

    console.log(`[BiotimeSync] Finalizado: ${inserted} insertados, ${updated} actualizados, ${errors} errores. Duración: ${durationMs}ms`);

    return { success: true, inserted, updated, errors, errorDetails, durationMs };
  } catch (err) {
    console.error('[BiotimeSync] Error general:', err.message);
    return { success: false, error: err.message, inserted, updated, errors };
  } finally {
    client.release();
  }
}

export async function triggerSync(req, res) {
  try {
    const startDate = req.body?.startDate || req.query?.startDate;
    const endDate = req.body?.endDate || req.query?.endDate;

    const result = await syncBiotimeAttendance({ startDate, endDate });
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

const controller = { triggerSync };
export default controller;
