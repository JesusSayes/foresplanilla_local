import "dotenv/config";
import pg from "pg";

const { Pool } = pg;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const LIMA_TIME_ZONE = "America/Lima";

const parseArgs = argv => {
  const args = {};
  for (const argument of argv.slice(2)) {
    const [key, ...valueParts] = argument.split("=");
    if (key?.startsWith("--") && valueParts.length > 0) {
      args[key.slice(2)] = valueParts.join("=");
    }
  }
  return args;
};

const validateDate = (value, name) => {
  if (!DATE_PATTERN.test(value || "")) {
    throw new Error(`${name} debe tener formato YYYY-MM-DD`);
  }

  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new Error(`${name} no es una fecha válida`);
  }

  return value;
};

const nextDate = dateStr => {
  const date = new Date(`${dateStr}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
};

const normalizeDocumentNumber = value => {
  const digits = String(value || "")
    .trim()
    .replace(/\.0$/, "")
    .replace(/\D/g, "");

  if (!digits) {
    throw new Error("--document_number debe contener al menos un dígito");
  }

  return digits.padStart(8, "0");
};

const formatInLima = (value, options) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: LIMA_TIME_ZONE,
    ...options,
  }).format(new Date(value));

const serializePunch = punch => ({
  id: punch.id != null ? String(punch.id) : null,
  emp_code: punch.emp_code,
  punch_time: punch.punch_time,
  punch_date_lima: formatInLima(punch.punch_time, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }),
  punch_time_lima: formatInLima(punch.punch_time, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }),
  punch_state: punch.punch_state,
  verify_type: punch.verify_type,
  terminal_alias: punch.terminal_alias,
  area_alias: punch.area_alias,
  upload_time: punch.upload_time,
});

export async function getEmployeeAttendance({
  document_number,
  date,
  date_from,
  date_to,
} = {}) {
  if (!process.env.BIOTIME_DATABASE_URL) {
    throw new Error("BIOTIME_DATABASE_URL no está configurado");
  }

  const documentNumber = normalizeDocumentNumber(document_number);
  const startDateStr = validateDate(date || date_from, date ? "--date" : "--date_from");
  const endDateStr = validateDate(date || date_to, date ? "--date" : "--date_to");

  if (startDateStr > endDateStr) {
    throw new Error("--date_from no puede ser posterior a --date_to");
  }

  const pool = new Pool({
    connectionString: process.env.BIOTIME_DATABASE_URL,
    max: 1,
    connectionTimeoutMillis: 5000,
  });

  try {
    const { rows } = await pool.query(
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
      CROSS JOIN LATERAL (
        SELECT REGEXP_REPLACE(
          REGEXP_REPLACE(TRIM(t.emp_code::text), '\\.0$', ''),
          '\\D',
          '',
          'g'
        ) AS digits
      ) normalized
      WHERE LPAD(
        normalized.digits,
        GREATEST(8, LENGTH(normalized.digits)),
        '0'
      ) = $1
      AND t.punch_time >= $2::date
      AND t.punch_time < $3::date
      ORDER BY t.punch_time ASC
      `,
      [documentNumber, startDateStr, nextDate(endDateStr)]
    );

    return {
      source: "biotime",
      document_number: documentNumber,
      range: {
        date_from: startDateStr,
        date_to: endDateStr,
      },
      punches_found: rows.length,
      punches: rows.map(serializePunch),
    };
  } finally {
    await pool.end();
  }
}

if (process.argv[1]?.endsWith("getEmployeeAttendance.js")) {
  const args = parseArgs(process.argv);
  getEmployeeAttendance(args)
    .then(result => console.log(JSON.stringify(result, null, 2)))
    .catch(error => {
      console.error(error.message);
      process.exitCode = 1;
    });
}
