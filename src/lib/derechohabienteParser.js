// ─────────────────────────────────────────────────────────────────────────────
// Lectura y normalización del archivo TXT de derechohabientes (separador "|").
//
// El archivo que descarga RR.HH. trae 24 columnas y termina cada registro con un
// "|" adicional, por lo que split("|") devuelve 25 elementos con el último vacío:
// ese elemento se descarta y se conservan las 24 posiciones (incluidas las vacías).
// Si la columna adicional trae datos, la fila NO se trunca: se informa el error.
// ─────────────────────────────────────────────────────────────────────────────

import { EXPECTED_FIELD_COUNT, FIELD_SPECS } from "./derechohabienteTemplate";

const FIELD_KEYS = FIELD_SPECS.map((field) => field.key);

const collapseSpaces = (value) => String(value ?? "").replace(/\s+/g, " ").trim();

const stripAccents = (value) =>
  collapseSpaces(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "");

/** Decodifica el archivo: UTF-8 (con o sin BOM) y, si no es UTF-8 válido, Windows-1252/Latin-1. */
export function decodeBufferToText(buffer) {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return new TextDecoder("utf-8").decode(bytes.subarray(3));
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    // No es UTF-8 válido: se decodifica como Windows-1252 / Latin-1.
    return new TextDecoder("windows-1252").decode(bytes);
  }
}

/** Divide el texto en líneas conservando el número de línea original (1-based). */
export function splitFileLines(text) {
  const clean = String(text ?? "").replace(/^\uFEFF/, "");
  return clean.split(/\r\n|\n|\r/).map((raw, index) => ({ lineNumber: index + 1, raw }));
}

// Encabezado del archivo que descarga RR.HH. o de la plantilla del sistema.
// Los títulos pueden traer caracteres de reemplazo (�): solo se buscan las
// palabras clave, nunca el valor exacto del título.
const HEADER_HINTS = [
  "doc.titular",
  "doc_titular",
  "doc.dhabiente",
  "doc_dhabiente",
  "fec.nac",
  "fec_nac",
  "ape.paterno",
  "ape_paterno",
  "tip.vin.fam",
  "tip_vin_fam",
];

export function isImportHeader(lineText) {
  const text = stripAccents(String(lineText ?? "").toLowerCase());
  return HEADER_HINTS.some((hint) => text.includes(hint));
}

/**
 * Separa un registro en campos tolerando el separador final.
 * 24 campos → válido. 25 con el último vacío → se descarta solo ese elemento.
 * Cualquier otra cantidad (o un último campo con datos) → error, sin truncar.
 */
export function splitRecordFields(lineText) {
  const parts = String(lineText ?? "").split("|").map((part) => part.trim());
  if (parts.length === EXPECTED_FIELD_COUNT) return { fields: parts };
  if (parts.length === EXPECTED_FIELD_COUNT + 1 && parts[EXPECTED_FIELD_COUNT] === "") {
    return { fields: parts.slice(0, EXPECTED_FIELD_COUNT) };
  }
  if (parts.length < EXPECTED_FIELD_COUNT) {
    return {
      error: `cantidad de campos insuficiente (se encontraron ${parts.length}, se esperan ${EXPECTED_FIELD_COUNT})`,
    };
  }
  return {
    error: `columnas adicionales con datos (se encontraron ${parts.length}, se esperan ${EXPECTED_FIELD_COUNT} más el separador final)`,
  };
}

/** Tipo de documento → valor admitido por el sistema + familia para vincular al titular. */
export function normalizeDocType(rawValue) {
  const value = collapseSpaces(rawValue);
  if (!value) return { value: null, family: null };
  const key = stripAccents(value).toUpperCase();
  if (key === "DNI") return { value: "DNI", family: "DNI" };
  if (key.includes("DNI") || key === "LE" || key.startsWith("LIBRETA")) {
    return { value: "L.E / DNI", family: "DNI" };
  }
  if (key.startsWith("CARN") || key === "CE" || key.includes("EXTRANJER")) {
    return { value: "CE", family: "CE" };
  }
  if (key === "PAS" || key.startsWith("PASAPORTE")) return { value: "Pasaporte", family: "PASAPORTE" };
  if (key.startsWith("PARTIDA")) return { value: "Partida de Nacimiento", family: "PARTIDA" };
  if (key === "CPP") return { value: "Otro", family: "CPP" };
  if (key === "OTRO" || key === "OTROS") return { value: "Otro", family: "OTRO" };
  return { value: null, family: null, unknown: value };
}

/** Sexo → M / F. Un valor desconocido se informa, nunca se adivina. */
export function normalizeGender(rawValue) {
  const value = collapseSpaces(rawValue);
  if (!value) return { value: null };
  const key = stripAccents(value).toUpperCase();
  if (["M", "MASC", "MASCULINO", "HOMBRE"].includes(key)) return { value: "M" };
  if (["F", "FEM", "FEMENINO", "MUJER"].includes(key)) return { value: "F" };
  return { value: null, unknown: value };
}

/** Vínculo familiar → valor admitido por la entidad. */
export function normalizeRelationship(rawValue) {
  const value = collapseSpaces(rawValue);
  if (!value) return { value: null };
  const key = stripAccents(value).toUpperCase().replace(/[\s()\/.-]/g, "");
  if (key.startsWith("CONYUGE") || key.startsWith("ESPOS")) return { value: "Cónyuge" };
  if (key.startsWith("CONCUBIN")) return { value: "Concubino/a" };
  if (key.startsWith("HIJOMENOR")) return { value: "Hijo Menor de Edad" };
  if (key.startsWith("HIJO") || key.startsWith("HIJA")) return { value: "Hijo/a" };
  if (key.startsWith("PADRE")) return { value: "Padre" };
  if (key.startsWith("MADRE")) return { value: "Madre" };
  if (key.startsWith("OTRO") || key.startsWith("OTRA")) return { value: "Otro" };
  return { value: null, unknown: value };
}

/**
 * Fecha DD/MM/YYYY → "YYYY-MM-DD" validando que exista en el calendario.
 * Se construye como texto para no desplazar el día por zona horaria.
 */
export function parseDateToISO(rawValue) {
  const value = collapseSpaces(rawValue);
  if (!value) return { value: null };
  const match = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) return { value: null, invalid: value };
  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  const exists =
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
  if (!exists) return { value: null, invalid: value };
  return {
    value: `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
  };
}

/** Documentos y teléfonos se tratan siempre como texto (conservan ceros iniciales). */
export const normalizeDocumentNumber = (value) => collapseSpaces(value).toUpperCase();

/** Variante sin ceros iniciales, solo para emparejar titulares con el mismo documento. */
export const normalizeDocumentNumberLoose = (value) =>
  normalizeDocumentNumber(value).replace(/^0+/, "");

/**
 * Parsea y valida un registro completo.
 * Devuelve { lineNumber, raw, values, errors }.
 */
export function parseDerechohabienteLine(lineText, lineNumber) {
  const { fields, error } = splitRecordFields(lineText);
  if (error) {
    return { lineNumber, raw: null, values: null, errors: [`Línea ${lineNumber}: ${error}.`] };
  }

  const raw = {};
  FIELD_KEYS.forEach((key, index) => {
    raw[key] = fields[index] ?? "";
  });

  const errors = [];
  const pushError = (position, name, message) =>
    errors.push(`Línea ${lineNumber}, campo "${name}" (posición ${position}): ${message}.`);

  if (!raw.num_titular) pushError(2, "N° Doc. Titular", "obligatorio, no puede estar vacío");
  if (!raw.num_dhabiente) pushError(4, "N° Doc. Derechohab.", "obligatorio, no puede estar vacío");
  if (!raw.nombres) pushError(9, "Nombres", "obligatorio, no puede estar vacío");

  const birthDate = parseDateToISO(raw.fec_nac);
  if (!raw.fec_nac) pushError(6, "Fecha Nacimiento", "obligatorio, no puede estar vacío");
  else if (birthDate.invalid) {
    pushError(
      6,
      "Fecha Nacimiento",
      `la fecha "${birthDate.invalid}" no existe o no usa el formato DD/MM/YYYY`
    );
  }

  const docType = normalizeDocType(raw.doc_dhabiente);
  if (docType.unknown) {
    pushError(3, "Tipo Doc. Derechohab.", `valor no reconocido "${docType.unknown}"`);
  }

  const gender = normalizeGender(raw.sexo);
  if (gender.unknown) pushError(10, "Sexo", `valor no reconocido "${gender.unknown}"`);

  const relationship = normalizeRelationship(raw.tip_vin_fam);
  if (!raw.tip_vin_fam) pushError(11, "Tipo Vínculo Familiar", "obligatorio, no puede estar vacío");
  else if (relationship.unknown) {
    pushError(11, "Tipo Vínculo Familiar", `valor no reconocido "${relationship.unknown}"`);
  }

  return {
    lineNumber,
    raw,
    values: {
      docType: docType.value,
      gender: gender.value,
      relationship: relationship.value,
      birthDate: birthDate.value,
    },
    errors,
  };
}

/**
 * Lee el archivo completo: salta el encabezado (si existe), ignora líneas vacías
 * y conserva el número de línea original de cada registro.
 */
export function parseDerechohabienteFile(text) {
  const lines = splitFileLines(text);
  const rows = [];
  const errors = [];
  let headerLineNumber = null;
  let isFirstContentLine = true;

  lines.forEach(({ lineNumber, raw }) => {
    if (!raw.trim()) return;
    if (isFirstContentLine) {
      isFirstContentLine = false;
      if (isImportHeader(raw)) {
        headerLineNumber = lineNumber;
        return;
      }
    }
    const parsed = parseDerechohabienteLine(raw, lineNumber);
    if (parsed.errors.length > 0) errors.push(...parsed.errors);
    rows.push(parsed);
  });

  return {
    totalLines: lines.length,
    headerLineNumber,
    dataLineCount: rows.length,
    rows,
    errors,
  };
}