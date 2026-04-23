import fs from "fs";
import path from "path";
import readline from "readline";
import { PrismaClient } from "@prisma/client";
import { generate24HexId } from "../utils/idGenerator.js";

const prisma = new PrismaClient();

const MODE = process.argv[2] || "dry";

const CSV_PATH = "./data/papeletas_02.csv";
const LOG_DIR = "./logs";

const EMP_NOT_FOUND_LOG = path.join(LOG_DIR, "incident_employees_not_found.log");
const ERROR_LOG = path.join(LOG_DIR, "incident_errors.log");
const DUPLICATES_LOG = path.join(LOG_DIR, "incident_duplicates.log");
const ROLLBACK_FILE = path.join(LOG_DIR, "incident_rollback_data.json");

const BATCH_SIZE = 200;

if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR);
}

/* ================= HELPERS ================= */

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

/* ================= LOADERS ================= */

async function loadCSV() {
  const stream = fs.createReadStream(CSV_PATH);
  const rl = readline.createInterface({ input: stream });

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

  return rows;
}

async function loadEmployees() {
  const employees = await prisma.employee.findMany({
    select: { id: true, document_number: true }
  });

  const map = new Map();

  employees.forEach(e => {
    map.set(normalizeDoc(e.document_number), e.id);
  });

  return map;
}

async function loadAttendance() {
  const records = await prisma.attendance_record.findMany({
    select: { id: true, employee_id: true, date: true }
  });

  const map = new Map();

  records.forEach(r => {
    if (!r.employee_id || !r.date) return;

    const key = `${r.employee_id}_${r.date.toISOString().slice(0,10)}`;
    map.set(key, r.id);
  });

  return map;
}

async function loadExistingIncidents() {
  const incidents = await prisma.attendance_incident.findMany({
    select: {
      id: true,
      employee_id: true,
      incident_date: true,
      incident_type: true
    }
  });

  const map = new Map();

  incidents.forEach(i => {
    if (!i.employee_id || !i.incident_date) return;

    const key = `${i.employee_id}_${i.incident_date.toISOString().slice(0,10)}_${i.incident_type}`;
    map.set(key, i.id);
  });

  return map;
}

/* ================= CORE ================= */

async function processBatches(insertData) {
  for (let i = 0; i < insertData.length; i += BATCH_SIZE) {
    const batch = insertData.slice(i, i + BATCH_SIZE);

    try {
      await prisma.attendance_incident.createMany({
        data: batch
      });
    } catch (err) {
      fs.appendFileSync(ERROR_LOG, `INSERT ERROR: ${err.message}\n`);
    }
  }
}

async function rollback() {
  if (!fs.existsSync(ROLLBACK_FILE)) {
    console.log("No existe archivo de rollback");
    return;
  }

  const data = JSON.parse(fs.readFileSync(ROLLBACK_FILE));

  console.log("Registros a eliminar:", data.length);

  for (let i = 0; i < data.length; i += BATCH_SIZE) {
    const batch = data.slice(i, i + BATCH_SIZE);

    await prisma.$transaction(
      batch.map(r =>
        prisma.attendance_incident.delete({
          where: { id: r.id }
        })
      )
    );

    console.log(`Rollback batch ${i + 1}`);
  }

  console.log("Rollback completado");
}

async function migrate() {

  if (MODE === "rollback") {
    await rollback();
    return;
  }

  const csvData = await loadCSV();
  const employeesMap = await loadEmployees();
  const attendanceMap = await loadAttendance();
  const existingIncidents = await loadExistingIncidents();

  let inserted = 0;
  let duplicates = 0;
  let notFound = 0;

  const insertData = [];
  const rollbackData = [];

  const csvDuplicateSet = new Set();

  fs.writeFileSync(EMP_NOT_FOUND_LOG, "");
  fs.writeFileSync(ERROR_LOG, "");
  fs.writeFileSync(DUPLICATES_LOG, "doc|fecha|tipo|motivo\n");

  for (const row of csvData) {

    const doc = normalizeDoc(row.numero_documento);
    const employeeId = employeesMap.get(doc);

    if (!employeeId) {
      notFound++;
      fs.appendFileSync(EMP_NOT_FOUND_LOG, `${doc}\n`);
      continue;
    }

    const date = parseDate(row.fech_inic_ope);
    if (!date) continue;

    const incidentType = row.tipo_justificacion || "UNKNOWN";

    const key = `${employeeId}_${date.toISOString().slice(0,10)}_${incidentType}`;

    /* ===== DUPLICATE EN CSV ===== */
    if (csvDuplicateSet.has(key)) {
      duplicates++;

      fs.appendFileSync(
        DUPLICATES_LOG,
        `${doc}|${date.toISOString()}|${incidentType}|CSV_DUPLICATE\n`
      );

      continue;
    }

    csvDuplicateSet.add(key);

    /* ===== DUPLICATE EN BD ===== */
    if (existingIncidents.has(key)) {
      duplicates++;

      fs.appendFileSync(
        DUPLICATES_LOG,
        `${doc}|${date.toISOString()}|${incidentType}|DB_DUPLICATE\n`
      );

      continue;
    }

    const attendanceKey = `${employeeId}_${date.toISOString().slice(0,10)}`;
    const attendanceId = attendanceMap.get(attendanceKey) || null;

    const id = generate24HexId();

    insertData.push({
      id,
      employee_id: employeeId,
      attendance_record_id: attendanceId,
      incident_date: date,
      incident_type: incidentType,
      justification: row.obse_oper_ope || null,
      justified_time_start: row.horainicope || null,
      justified_time_end: row.horafinaope || null,
      full_day_justification: Number(row.nume_dias_ope) > 0,
      hours_to_adjust: Number(row.nume_dias_ope) || null,
      late_minutes_to_adjust: Number(row.nume_minut_ope) || null,
      status: row.esta_oper_ope || "PENDING",
      review_comments: row.obse_rrhh_ope || null,
      created_date: new Date()
    });

    rollbackData.push({ id });

    inserted++;
  }

  console.log("\nResumen:");
  console.log("Insertados:", inserted);
  console.log("Duplicados:", duplicates);
  console.log("No encontrados:", notFound);

  fs.writeFileSync(
    ROLLBACK_FILE,
    JSON.stringify(rollbackData, null, 2)
  );

  if (MODE !== "migrate") {
    console.log("Modo dry finalizado");
    return;
  }

  await processBatches(insertData);

  console.log("Migración completada");
}

/* ================= RUN ================= */

migrate()
  .catch(e => {
    console.error("ERROR GENERAL", e);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

/*
USO:

dry run:
node scripts/migrateAttendanceIncidents.js

migrar:
node scripts/migrateAttendanceIncidents.js migrate

rollback:
node scripts/migrateAttendanceIncidents.js rollback
*/
