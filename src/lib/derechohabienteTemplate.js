// Especificación del formato TXT de derechohabientes (separador |, 24 campos, codificación latin1).
// El orden y los nombres coinciden exactamente con el parser del importador (ImportDerechohabientesModal).

export const EXPECTED_FIELD_COUNT = 24;

// pos = posición 1-based (para mostrar al usuario). Índice 0-based = pos - 1.
export const FIELD_SPECS = [
  { pos: 1,  key: "doc_titular",    name: "Tipo Doc. Titular",        req: "Opcional",    format: "Texto",              example: "DNI" },
  { pos: 2,  key: "num_titular",    name: "N° Doc. Titular",          req: "Obligatorio", format: "Texto numérico",     example: "12345678" },
  { pos: 3,  key: "doc_dhabiente",  name: "Tipo Doc. Derechohab.",   req: "Opcional",    format: "Texto",              example: "DNI" },
  { pos: 4,  key: "num_dhabiente",  name: "N° Doc. Derechohab.",     req: "Obligatorio", format: "Texto numérico",     example: "87654321" },
  { pos: 5,  key: "cod_pais",       name: "Código de País",          req: "Opcional",    format: "Texto",              example: "604" },
  { pos: 6,  key: "fec_nac",        name: "Fecha Nacimiento",        req: "Obligatorio", format: "DD/MM/YYYY",         example: "15/03/2010" },
  { pos: 7,  key: "ape_paterno",    name: "Apellido Paterno",        req: "Opcional",    format: "Texto",              example: "GOMEZ" },
  { pos: 8,  key: "ape_materno",    name: "Apellido Materno",        req: "Opcional",    format: "Texto",              example: "RUIZ" },
  { pos: 9,  key: "nombres",        name: "Nombres",                req: "Obligatorio", format: "Texto",              example: "LUCIA MARIA" },
  { pos: 10, key: "sexo",           name: "Sexo",                   req: "Opcional",    format: "M / F",              example: "F" },
  { pos: 11, key: "tip_vin_fam",    name: "Tipo Vínculo Familiar",   req: "Obligatorio", format: "Texto (ver códigos)", example: "HIJO" },
  { pos: 12, key: "tip_doc_sust",   name: "Tipo Doc. Sustento",      req: "Opcional",    format: "Texto",              example: "" },
  { pos: 13, key: "num_doc_sust",   name: "N° Doc. Sustento",        req: "Opcional",    format: "Texto",              example: "" },
  { pos: 14, key: "mes_concep",     name: "Mes Concepción",          req: "Opcional",    format: "Texto",              example: "" },
  { pos: 15, key: "desc_dir1",      name: "Dirección 1",             req: "Opcional",    format: "Texto",              example: "AV. LOS OLIVOS 123" },
  { pos: 16, key: "ref_dir1",       name: "Referencia Dir. 1",       req: "Opcional",    format: "Texto",              example: "" },
  { pos: 17, key: "ubigeo_dir1",    name: "Ubigeo Dir. 1",          req: "Opcional",    format: "6 dígitos",           example: "150101" },
  { pos: 18, key: "desc_dir2",      name: "Dirección 2",             req: "Opcional",    format: "Texto",              example: "" },
  { pos: 19, key: "ref_dir2",       name: "Referencia Dir. 2",       req: "Opcional",    format: "Texto",              example: "" },
  { pos: 20, key: "ubigeo_dir2",    name: "Ubigeo Dir. 2",          req: "Opcional",    format: "6 dígitos",           example: "" },
  { pos: 21, key: "ind_centro",     name: "Ind. Centro Salud",      req: "Opcional",    format: "Texto",              example: "" },
  { pos: 22, key: "cod_ciudad",     name: "Código Ciudad",          req: "Opcional",    format: "Texto",              example: "" },
  { pos: 23, key: "telefono",       name: "Teléfono",               req: "Opcional",    format: "Texto",              example: "987654321" },
  { pos: 24, key: "correo",         name: "Correo",                 req: "Opcional",    format: "Texto",              example: "" },
];

export const DOC_TYPE_CODES = [
  { code: "DNI", desc: "Documento Nacional de Identidad" },
  { code: "CE",  desc: "Carné de Extranjería (admite ceros iniciales)" },
  { code: "PAS", desc: "Pasaporte" },
];

export const SEX_CODES = [
  { code: "M",        desc: "Masculino" },
  { code: "F",        desc: "Femenino" },
  { code: "MASCULINO", desc: "Masculino (texto completo)" },
  { code: "FEMENINO", desc: "Femenino (texto completo)" },
];

export const RELATIONSHIP_CODES = [
  { code: "CONYUGE",    desc: "Cónyuge" },
  { code: "CONCUBINA",  desc: "Concubina/o" },
  { code: "CONCUBINO",  desc: "Concubino/a" },
  { code: "HIJO",       desc: "Hijo/a" },
  { code: "HIJO MENOR", desc: "Hijo Menor de Edad" },
  { code: "PADRE",      desc: "Padre" },
  { code: "MADRE",      desc: "Madre" },
];

// Encabezado: nombres de campos separados por | (el importador ignora la línea 1)
const TEMPLATE_HEADER = FIELD_SPECS.map((f) => f.key).join("|");

// Filas de ejemplo con datos ficticios válidos (ceros iniciales preservados en N° doc.)
const TEMPLATE_SAMPLE_ROWS = [
  "DNI|12345678|DNI|87654321|604|15/03/2010|GOMEZ|RUIZ|LUCIA MARIA|F|HIJO||||AV. LOS OLIVOS 123||150101||||||987654321|",
  "DNI|12345678|DNI|00123456|604|22/08/1985|TORRES|SOTO|CARLOS EDUARDO|M|CONYUGE||||JR. ANCASH 456||150101||||||999888777|",
];

export function buildTemplateContent() {
  return [TEMPLATE_HEADER, ...TEMPLATE_SAMPLE_ROWS].join("\n") + "\n";
}

// Descarga la plantilla codificada en latin1 (ISO-8859-1), igual que reader.readAsText(f, "latin1")
export function downloadTemplate() {
  const content = buildTemplateContent();
  const bytes = new Uint8Array(content.length);
  for (let i = 0; i < content.length; i++) {
    bytes[i] = content.charCodeAt(i) & 0xff;
  }
  const blob = new Blob([bytes], { type: "text/plain;charset=latin1" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "plantilla_derechohabientes.txt";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// Valida una línea (ya separada en parts) y devuelve una lista de mensajes de error.
// lineNumber = número de línea en el archivo original (1-based, incluyendo encabezado).
export function validateRow(parts, lineNumber) {
  const errors = [];
  if (parts.length !== EXPECTED_FIELD_COUNT) {
    errors.push(
      `Línea ${lineNumber}: cantidad de campos incorrecta (se esperaban ${EXPECTED_FIELD_COUNT}, se encontraron ${parts.length}).`
    );
    return errors; // no se puede validar el resto si la cantidad es incorrecta
  }
  const fecNac = (parts[5] || "").trim();
  if (fecNac && !/^\d{2}\/\d{2}\/\d{4}$/.test(fecNac)) {
    errors.push(
      `Línea ${lineNumber}, campo "Fecha Nacimiento" (posición 6): formato inválido "${fecNac}", se espera DD/MM/YYYY.`
    );
  }
  for (const field of FIELD_SPECS) {
    if (field.req === "Obligatorio" && !parts[field.pos - 1].trim()) {
      errors.push(`Línea ${lineNumber}, campo "${field.name}" (posición ${field.pos}): obligatorio, no puede estar vacío.`);
    }
  }
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(fecNac)) {
    const [day, month, year] = fecNac.split("/").map(Number);
    const date = new Date(`${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}T00:00:00Z`);
    if (year === 0 || date.getUTCFullYear() !== year || date.getUTCMonth() + 1 !== month || date.getUTCDate() !== day) {
      errors.push(`Línea ${lineNumber}, campo "Fecha Nacimiento" (posición 6): fecha inválida "${fecNac}".`);
    }
  }
  return errors;
}
