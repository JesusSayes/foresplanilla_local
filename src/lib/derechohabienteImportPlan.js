// ─────────────────────────────────────────────────────────────────────────────
// Clasificación de los registros leídos antes de importarlos:
//   válidos · duplicados (en el archivo o ya registrados) · titular no encontrado · errores
// Todo se resuelve en memoria contra los empleados y los derechohabientes existentes.
// ─────────────────────────────────────────────────────────────────────────────

import { normalizeDocType, normalizeDocumentNumber, normalizeDocumentNumberLoose } from "./derechohabienteParser";

/** Índice de empleados por documento (exacto y sin ceros iniciales). */
export function buildEmployeeDocumentIndex(employees) {
  const byNumber = new Map();
  const byLooseNumber = new Map();
  (employees || []).forEach((employee) => {
    const number = normalizeDocumentNumber(employee?.document_number);
    if (!number) return;
    if (!byNumber.has(number)) byNumber.set(number, []);
    byNumber.get(number).push(employee);
    const loose = normalizeDocumentNumberLoose(number);
    if (!loose) return;
    if (!byLooseNumber.has(loose)) byLooseNumber.set(loose, []);
    byLooseNumber.get(loose).push(employee);
  });
  return { byNumber, byLooseNumber };
}

/**
 * Busca el empleado titular por documento. Si hay varios empleados con el mismo
 * número, desempata por tipo de documento; si sigue siendo ambiguo, lo informa.
 */
export function matchTitular(index, documentNumber, documentType) {
  const number = normalizeDocumentNumber(documentNumber);
  if (!number) return { reason: "el titular no tiene número de documento" };

  let candidates = index.byNumber.get(number) || [];
  if (candidates.length === 0) {
    const loose = normalizeDocumentNumberLoose(number);
    candidates = loose ? index.byLooseNumber.get(loose) || [] : [];
  }
  if (candidates.length === 0) {
    return { reason: `titular con documento ${number} no existe en el sistema` };
  }
  if (candidates.length === 1) return { employee: candidates[0] };

  const family = normalizeDocType(documentType).family;
  if (family) {
    const byType = candidates.filter(
      (employee) => normalizeDocType(employee?.document_type).family === family
    );
    if (byType.length === 1) return { employee: byType[0] };
    if (byType.length > 1) {
      return {
        reason: `coincidencia ambigua: ${byType.length} empleados con documento ${number} y tipo ${family}`,
      };
    }
  }
  return { reason: `coincidencia ambigua: ${candidates.length} empleados con documento ${number}` };
}

/** Clave de unicidad: un derechohabiente se identifica por titular + documento. */
export const derechohabienteKey = (employeeId, documentNumber) =>
  `${employeeId}|${normalizeDocumentNumber(documentNumber)}`;

/**
 * Clasifica las filas del archivo. `existing` son los derechohabientes ya
 * registrados de los titulares involucrados (todos, sin límite fijo).
 */
export function classifyDerechohabienteRows({ rows, employees, existing }) {
  const index = buildEmployeeDocumentIndex(employees);
  const existingKeys = new Set(
    (existing || []).map((record) => derechohabienteKey(record.employee_id, record.document_number))
  );

  const seenInFile = new Map();
  const valid = [];
  const invalid = [];
  const duplicates = [];
  const missingTitular = [];

  (rows || []).forEach((row) => {
    if (!row.raw || row.errors.length > 0) {
      invalid.push({ row, reason: row.errors[0] || `Línea ${row.lineNumber}: registro inválido.` });
      return;
    }

    const match = matchTitular(index, row.raw.num_titular, row.raw.doc_titular);
    if (!match.employee) {
      missingTitular.push({ row, reason: match.reason });
      return;
    }

    const key = derechohabienteKey(match.employee.id, row.raw.num_dhabiente);
    if (seenInFile.has(key)) {
      duplicates.push({
        row,
        reason: `duplicado en el archivo: ya aparece en la línea ${seenInFile.get(key)}`,
      });
      return;
    }
    if (existingKeys.has(key)) {
      duplicates.push({ row, reason: "ya está registrado para este titular" });
      seenInFile.set(key, row.lineNumber);
      return;
    }

    seenInFile.set(key, row.lineNumber);
    valid.push({ row, titular: match.employee });
  });

  return { valid, invalid, duplicates, missingTitular };
}

/** Payload del derechohabiente: documentos, teléfonos y códigos se guardan como texto. */
export function buildDerechohabientePayload(row, titular, registrationDate) {
  const { raw, values } = row;
  const payload = {
    employee_id: titular.id,
    document_number: raw.num_dhabiente,
    first_name: raw.nombres,
    last_name: [raw.ape_paterno, raw.ape_materno].filter(Boolean).join(" "),
    last_name_paterno: raw.ape_paterno,
    last_name_materno: raw.ape_materno,
    birth_date: values.birthDate,
    relationship: values.relationship,
    registration_date: registrationDate,
    is_active: true,
  };
  if (values.docType) payload.document_type = values.docType;
  if (values.gender) payload.gender = values.gender;

  // País y ubigeo se conservan tal como vienen (descripción), sin inventar códigos.
  const optional = {
    country_code: raw.cod_pais,
    document_type_sustento: raw.tip_doc_sust,
    document_number_sustento: raw.num_doc_sust,
    conception_month: raw.mes_concep,
    address: raw.desc_dir1,
    address_reference: raw.ref_dir1,
    ubigeo: raw.ubigeo_dir1,
    address2: raw.desc_dir2,
    address_reference2: raw.ref_dir2,
    ubigeo2: raw.ubigeo_dir2,
    health_center_indicator: raw.ind_centro,
    city_code: raw.cod_ciudad,
    phone: raw.telefono,
    email: raw.correo,
  };
  Object.entries(optional).forEach(([field, value]) => {
    if (value) payload[field] = value;
  });

  return payload;
}