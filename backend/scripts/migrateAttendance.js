import fs from "fs";
import path from "path";
import readline from "readline";
import crypto from "crypto";
import { PrismaClient, Prisma } from "@prisma/client";

const prisma = new PrismaClient();

const MODE = process.argv[2] || "dry";

const CSV_PATH = "./data/asistencias.csv";
const LOG_DIR = "./logs";

const EMP_NOT_FOUND_LOG = path.join(LOG_DIR, "employees_not_found.log");
const DUPLICATES_LOG = path.join(LOG_DIR, "duplicates.log");
const ROLLBACK_FILE = path.join(LOG_DIR, "rollback_data.json");
const ERROR_LOG = path.join(LOG_DIR, "errors.log");

const BATCH_SIZE = 200;

if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR);
}

function detectSeparator(line) {
  if (line.includes("|")) return "|";
  if (line.includes(",")) return ",";
  return "|";
}

function normalizeDoc(doc) {
  if (!doc) return "";
  return doc.trim().replace(/\s+/g, "");
}

function parseDate(value) {
  if (!value) return null;

  const v = value.trim();

  if (v.includes("/")) {
    const [d, m, y] = v.split("/");
    return new Date(`${y}-${m}-${d}`);
  }

  return new Date(v);
}

function toBool(value) {
  if (!value) return false;
  const v = String(value).toLowerCase();
  return v === "1" || v === "true" || v === "si";
}

function calculateWorkedHours(clockIn, clockOut) {
  if (!clockIn || !clockOut) return 0;

  try {
    const [h1, m1, s1] = clockIn.split(":").map(Number);
    const [h2, m2, s2] = clockOut.split(":").map(Number);

    const start = h1 * 3600 + m1 * 60 + (s1 || 0);
    const end = h2 * 3600 + m2 * 60 + (s2 || 0);

    if (end <= start) return 0;

    const diff = end - start;
    return Number((diff / 3600).toFixed(2));
  } catch {
    return 0;
  }
}

async function loadCSV() {
  console.log("Leyendo CSV...");

  const stream = fs.createReadStream(CSV_PATH);
  const rl = readline.createInterface({
    input: stream,
    crlfDelay: Infinity
  });

  let separator = "|";
  let headers = [];
  let rows = [];
  let first = true;

  for await (const line of rl) {
    if (!line.trim()) continue;

    if (first) {
      separator = detectSeparator(line);
      headers = line.split(separator).map(h => h.trim());
      first = false;
      continue;
    }

    const values = line.split(separator);
    const obj = {};

    headers.forEach((h, i) => {
      obj[h] = values[i] ? values[i].trim() : "";
    });

    rows.push(obj);
  }

  console.log("Registros CSV:", rows.length);
  return rows;
}

async function loadEmployees() {
  console.log("Cargando empleados...");

  const employees = await prisma.employee.findMany({
    select: {
      id: true,
      document_number: true
    }
  });

  const map = new Map();

  employees.forEach(e => {
    if (e.document_number) {
      map.set(normalizeDoc(e.document_number), e.id);
    }
  });

  console.log("Empleados cargados:", map.size);
  return map;
}

async function loadAttendance() {
  console.log("Cargando asistencias existentes...");

  const records = await prisma.attendance_record.findMany({
    select: {
      id: true,
      employee_id: true,
      date: true,
      clock_in: true,
      clock_out: true,
      worked_hours: true
    }
  });

  const map = new Map();

  records.forEach(r => {
    if (!r.employee_id || !r.date) return;

    const key = `${r.employee_id}_${r.date.toISOString().slice(0,10)}`;
    map.set(key, r);
  });

  console.log("Asistencias existentes:", map.size);
  return map;
}

async function processBatches(insertData, updateData) {

  console.log("\nInsertando registros...");

  for (let i = 0; i < insertData.length; i += BATCH_SIZE) {

    const batch = insertData.slice(i, i + BATCH_SIZE);

    try {
      await prisma.attendance_record.createMany({
        data: batch
      });

      console.log(`Insert batch ${i + 1} / ${insertData.length}`);

    } catch (err) {

      fs.appendFileSync(
        ERROR_LOG,
        `INSERT ERROR: ${err.message}\n`
      );
    }
  }

  console.log("\nActualizando duplicados...");

  for (let i = 0; i < updateData.length; i += BATCH_SIZE) {

    const batch = updateData.slice(i, i + BATCH_SIZE);

    await prisma.$transaction(
      batch.map(upd =>
        prisma.attendance_record.update({
          where: { id: upd.id },
          data: upd.data
        })
      )
    );

    console.log(`Update batch ${i + 1} / ${updateData.length}`);
  }
}

async function migrate() {

  console.log("\nModo:", MODE);

  const csvData = await loadCSV();
  const employeesMap = await loadEmployees();
  const attendanceMap = await loadAttendance();

  let inserted = 0;
  let updated = 0;
  let notFound = 0;
  let duplicates = 0;

  const insertData = [];
  const updateData = [];
  const rollbackData = [];

  fs.writeFileSync(EMP_NOT_FOUND_LOG, "");
  fs.writeFileSync(ERROR_LOG, "");

  fs.writeFileSync(
    DUPLICATES_LOG,
    "Empleado|Fecha|Bd_ingreso|Bd_salida|Csv_ingreso|Csv_salida|Estado\n"
  );

  console.log("\nProcesando CSV...\n");

  for (const row of csvData) {

    const doc = normalizeDoc(row.numero_documento);
    const employeeId = employeesMap.get(doc);

    if (!employeeId) {

      notFound++;

      fs.appendFileSync(
        EMP_NOT_FOUND_LOG,
        `${doc}|${row.fech_regi_mar}\n`
      );

      continue;
    }

    const date = parseDate(row.fech_regi_mar);
    if (!date) continue;

    const key = `${employeeId}_${date.toISOString().slice(0,10)}`;

    const clockIn = row.hora_entrada?.trim() || null;
    const clockOut = row.hora_salida?.trim() || null;

    const scheduledStart = row.hora_entr_rel?.trim() || null;
    const scheduledEnd = row.hora_sali_rel?.trim() || null;

    const calculatedHours = calculateWorkedHours(clockIn, clockOut);
    const workedHours = new Prisma.Decimal(calculatedHours);

    const existing = attendanceMap.get(key);

    if (!existing) {

      insertData.push({
        id: crypto.randomUUID(),
        employee_id: employeeId,
        date,
        clock_in: clockIn,
        clock_out: clockOut,
        scheduled_start: scheduledStart,
        scheduled_end: scheduledEnd,
        worked_hours: workedHours,
        is_late: toBool(row.is_late),
        late_minutes: Number(row.minu_tard_eas) || 0,
        is_absent: toBool(row.is_absent),
        status: row.Status || "OK",
        created_date: new Date()
      });

      inserted++;

    } else {

      const bdClockIn = existing.clock_in || "";
      const bdClockOut = existing.clock_out || "";
      const bdHours = Number(existing.worked_hours || 0);

      if (
        bdClockIn !== clockIn ||
        bdClockOut !== clockOut ||
        bdHours !== calculatedHours
      ) {

        duplicates++;

        fs.appendFileSync(
          DUPLICATES_LOG,
          `${doc}|${row.fech_regi_mar}|${bdClockIn}|${bdClockOut}|${clockIn}|${clockOut}|REEMPLAZADO\n`
        );

        rollbackData.push({
          id: existing.id,
          clock_in: existing.clock_in,
          clock_out: existing.clock_out,
          worked_hours: existing.worked_hours
        });

        updateData.push({
          id: existing.id,
          data: {
            clock_in: clockIn,
            clock_out: clockOut,
            scheduled_start: scheduledStart,
            scheduled_end: scheduledEnd,
            worked_hours: workedHours,
            is_late: toBool(row.is_late),
            late_minutes: Number(row.minu_tard_eas) || 0,
            is_absent: toBool(row.is_absent),
            status: row.Status || "OK",
            updated_date: new Date()
          }
        });

        updated++;
      }
    }
  }

  console.log("\nResumen:");
  console.log("Insertados:", inserted);
  console.log("Actualizados:", updated);
  console.log("Duplicados detectados:", duplicates);
  console.log("No encontrados:", notFound);

  fs.writeFileSync(
    ROLLBACK_FILE,
    JSON.stringify(rollbackData, null, 2)
  );

  if (MODE !== "migrate") {
    console.log("\nModo dry finalizado");
    return;
  }

  await processBatches(insertData, updateData);

  console.log("\nMigración finalizada correctamente");
}

migrate()
  .catch(e => {
    console.error("\nERROR GENERAL");
    console.error(e);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

// Execution mode:
// ---------------
// node scripts/migrateAttendance.js migrate
// node scripts/migrateAttendance.js rollback
// node scripts/migrateAttendance.js dry
