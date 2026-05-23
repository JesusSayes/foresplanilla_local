import fs from "fs";
import path from "path";
import readline from "readline";
import { PrismaClient, Prisma } from "@prisma/client";
import { generate24HexId } from "../utils/idGenerator.js";

const prisma = new PrismaClient();

const MODE = process.argv[2] || "dry";

const CSV_PATH = "./data/asistencias_03.csv";
const LOG_DIR = "./logs";

const EMP_NOT_FOUND_LOG = path.join(LOG_DIR, "employees_not_found.log");
const DUPLICATES_LOG = path.join(LOG_DIR, "duplicates.log");
const ROLLBACK_FILE = path.join(LOG_DIR, "rollback_data.json");
const ERROR_LOG = path.join(LOG_DIR, "errors.log");

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

/* ================= SCHEDULE ================= */

async function loadEmployeeSchedules() {
  console.log("Cargando work_schedule...");

  const schedules = await prisma.work_schedule.findMany({
    where: { is_active: true },
    select: {
      employee_id: true,
      effective_from: true,

      monday_start: true,
      monday_end: true,
      tuesday_start: true,
      tuesday_end: true,
      wednesday_start: true,
      wednesday_end: true,
      thursday_start: true,
      thursday_end: true,
      friday_start: true,
      friday_end: true,
      saturday_start: true,
      saturday_end: true,
      sunday_start: true,
      sunday_end: true
    }
  });

  const map = new Map();

  schedules.forEach(s => {
    if (!s.employee_id) return;

    if (!map.has(s.employee_id)) {
      map.set(s.employee_id, []);
    }

    map.get(s.employee_id).push(s);
  });

  // ordenar por vigencia (más reciente primero)
  map.forEach(arr => {
    arr.sort((a, b) => {
      const da = a.effective_from ? new Date(a.effective_from).getTime() : 0;
      const db = b.effective_from ? new Date(b.effective_from).getTime() : 0;
      return db - da;
    });
  });

  return map;
}

function getApplicableSchedule(schedules, date) {
  if (!schedules || schedules.length === 0) return null;

  for (const s of schedules) {
    if (!s.effective_from) return s;

    if (new Date(s.effective_from) <= date) {
      return s;
    }
  }

  return null;
}

function resolveSchedule(schedule, date) {
  const day = date.getDay(); // 0 domingo - 6 sábado

  switch (day) {
    case 1:
      return { start: schedule.monday_start, end: schedule.monday_end };
    case 2:
      return { start: schedule.tuesday_start, end: schedule.tuesday_end };
    case 3:
      return { start: schedule.wednesday_start, end: schedule.wednesday_end };
    case 4:
      return { start: schedule.thursday_start, end: schedule.thursday_end };
    case 5:
      return { start: schedule.friday_start, end: schedule.friday_end };
    case 6:
      return { start: schedule.saturday_start, end: schedule.saturday_end };
    case 0:
      return { start: schedule.sunday_start, end: schedule.sunday_end };
    default:
      return { start: null, end: null };
  }
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
    if (e.document_number) {
      map.set(normalizeDoc(e.document_number), e.id);
    }
  });

  return map;
}

async function loadAttendance() {
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

    const key = `${r.employee_id}_${r.date.toISOString().slice(0, 10)}`;
    map.set(key, r);
  });

  return map;
}

/* ================= DB OPS ================= */

async function processBatches(insertData, updateData) {

  for (let i = 0; i < insertData.length; i += BATCH_SIZE) {
    const batch = insertData.slice(i, i + BATCH_SIZE);

    try {
      await prisma.attendance_record.createMany({ data: batch });
    } catch (err) {
      fs.appendFileSync(ERROR_LOG, `INSERT ERROR: ${err.message}\n`);
    }
  }

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
  }
}

/* ================= MAIN ================= */

async function migrate() {

  console.log("Modo:", MODE);

  const csvData = await loadCSV();
  const employeesMap = await loadEmployees();
  const attendanceMap = await loadAttendance();
  const schedulesMap = await loadEmployeeSchedules();

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

  for (const row of csvData) {

    const doc = normalizeDoc(row.numero_documento);
    const employeeId = employeesMap.get(doc);

    if (!employeeId) {
      notFound++;
      fs.appendFileSync(EMP_NOT_FOUND_LOG, `${doc}|${row.fech_regi_mar}\n`);
      continue;
    }

    const date = parseDate(row.fech_regi_mar);
    if (!date) continue;

    const key = `${employeeId}_${date.toISOString().slice(0,10)}`;

    const clockIn = row.hora_entrada?.trim() || null;
    const clockOut = row.hora_salida?.trim() || null;

    /* ===== SCHEDULE ===== */
    const employeeSchedules = schedulesMap.get(employeeId);
    const applicableSchedule = getApplicableSchedule(employeeSchedules, date);

    const resolved = applicableSchedule
      ? resolveSchedule(applicableSchedule, date)
      : { start: null, end: null };

    const scheduledStart =
      resolved.start || row.hora_entr_rel?.trim() || null;

    const scheduledEnd =
      resolved.end || row.hora_sali_rel?.trim() || null;

    const workedHours = new Prisma.Decimal(
      calculateWorkedHours(clockIn, clockOut)
    );

    const existing = attendanceMap.get(key);

    if (!existing) {

      insertData.push({
        id: generate24HexId(),
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
        status: row.Status || "Completo",
        created_date: new Date()
      });

      inserted++;

    } else {

      const bdClockIn = existing.clock_in || "";
      const bdClockOut = existing.clock_out || "";
      const bdHours = Number(existing.worked_hours || 0);

      const calcHours = Number(workedHours);

      if (
        bdClockIn !== clockIn ||
        bdClockOut !== clockOut ||
        bdHours !== calcHours
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
            status: row.Status || "Completo",
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
  console.log("Duplicados:", duplicates);
  console.log("No encontrados:", notFound);

  fs.writeFileSync(ROLLBACK_FILE, JSON.stringify(rollbackData, null, 2));

  if (MODE !== "migrate") {
    console.log("Modo dry finalizado");
    return;
  }

  await processBatches(insertData, updateData);

  console.log("Migración finalizada");
}

migrate()
  .catch(e => {
    console.error("ERROR GENERAL", e);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
