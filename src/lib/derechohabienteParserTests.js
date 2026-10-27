// Pruebas del parser y del plan de importación de derechohabientes.
// Datos 100 % ficticios (documentos, nombres y teléfonos inventados).
// Ejecutar desde la consola del navegador:
//   import('@/lib/derechohabienteParserTests').then(m => console.log(m.runDerechohabienteParserTests()))

import {
  decodeBufferToText,
  parseDerechohabienteFile,
  parseDateToISO,
  splitRecordFields,
} from "@/lib/derechohabienteParser";
import {
  buildDerechohabientePayload,
  classifyDerechohabienteRows,
} from "@/lib/derechohabienteImportPlan";

const HEADER_SIT = [
  "Doc.Titular",
  "N\uFFFDDoc.Titular",
  "Doc.DHabiente",
  "N\uFFFDDoc.DHabiente",
  "Cod.Pa\uFFFds",
  "Fec.Nac.",
  "Ape.Paterno",
  "Ape.Materno",
  "Nombres",
  "Sexo",
  "Tip.Vin.Fam.",
  "Tip.Doc.Sust.",
  "Num.Doc.Sust.",
  "Mes Concep.",
  "Descripci\uFFFDn Direcci\uFFFDn 1",
  "Referencia Direcci\uFFFDn 1",
  "Ubigeo Direcci\uFFFDn 1",
  "Descripci\uFFFDn Direcci\uFFFDn 2",
  "Referencia Direcci\uFFFDn 2",
  "Ubigeo Direcci\uFFFDn 2",
  "Ind.Centro Asistencial EsSalud",
  "Cod. Ciudad",
  "Tel\uFFFDfono",
  "Correo Electronico",
].join("|");

const HEADER_PLANTILLA =
  "doc_titular|num_titular|doc_dhabiente|num_dhabiente|cod_pais|fec_nac|ape_paterno|ape_materno|nombres|sexo|tip_vin_fam|tip_doc_sust|num_doc_sust|mes_concep|desc_dir1|ref_dir1|ubigeo_dir1|desc_dir2|ref_dir2|ubigeo_dir2|ind_centro|cod_ciudad|telefono|correo";

// 24 columnas + "|" final (como el archivo que descarga RR.HH.)
const ROW_A =
  "L.E / DNI|12345678|L.E / DNI|87654321|PERÚ|15/03/2010|GÓMEZ|MUÑOZ|LUCÍA MARÍA|FEMENINO|HIJO MENOR DE EDAD|ACTA/PARTIDA DE NACIMIENTO|001||AV. LOS OLIVOS 123||LIMA-LIMA-ATE||||DOMICILIO 1|1|987654321|lucia@example.com|";
const ROW_A_SIN_PIPE_FINAL = ROW_A.slice(0, -1);

// Carné de extranjería (doble espacio), ñ, año bisiesto, teléfono con cero inicial.
const ROW_CE =
  "L.E / DNI|12345678|CARNÉ  EXT|00123456|PERÚ|29/02/2012|TORRES|PEÑA|CARLOS EDUARDO|MASCULINO|CONCUBINA(O)|ESCRIT PÚB REC. UNIÓN HECHO LEY 29560|09823096||JR. ANCASH 456||LIMA-LIMA-LIMA||||DOMICILIO 1|1|0987654321||";

const withHeader = (...rows) => [HEADER_SIT, ...rows].join("\n");

const EMPLEADOS = [
  { id: "emp-1", document_type: "DNI", document_number: "12345678" },
  { id: "emp-2", document_type: "CE", document_number: "00123456" },
  { id: "emp-x", document_type: "DNI", document_number: "55667788" },
  { id: "emp-y", document_type: "CE", document_number: "55667788" },
];

const FECHA_ALTA = "2026-01-31";

export function runDerechohabienteParserTests() {
  const results = [];
  const check = (name, condition, detail = "") =>
    results.push({ name, ok: Boolean(condition), detail: condition ? "" : String(detail) });

  // ── Estructura ─────────────────────────────────────────────────────────────
  const conPipe = splitRecordFields(ROW_A);
  check(
    "25 elementos con | final → 24 campos, último con el correo",
    conPipe.fields?.length === 24 && conPipe.fields[23] === "lucia@example.com",
    JSON.stringify(conPipe)
  );
  check(
    "Los campos opcionales vacíos conservan su posición (mes concepción vacío)",
    conPipe.fields?.[13] === "" && conPipe.fields?.[17] === "" && conPipe.fields?.[20] === "DOMICILIO 1",
    JSON.stringify(conPipe.fields?.slice(13, 22))
  );
  const sinPipe = splitRecordFields(ROW_A_SIN_PIPE_FINAL);
  check("24 campos sin | final", sinPipe.fields?.length === 24, JSON.stringify(sinPipe));
  const columnaExtra = splitRecordFields(`${ROW_A}EXTRA|`);
  check(
    "Columna adicional con datos → error (no se trunca)",
    Boolean(columnaExtra.error) && columnaExtra.error.includes("columnas adicionales"),
    JSON.stringify(columnaExtra)
  );
  const pocosCampos = splitRecordFields("a|b|c");
  check(
    "Campos insuficientes → error",
    Boolean(pocosCampos.error) && pocosCampos.error.includes("insuficiente"),
    JSON.stringify(pocosCampos)
  );

  // ── Encabezado y líneas ────────────────────────────────────────────────────
  const archivoSit = parseDerechohabienteFile(withHeader(ROW_A, ROW_CE));
  check(
    "Encabezado del archivo de RR.HH. reconocido (aunque tenga caracteres �)",
    archivoSit.headerLineNumber === 1 && archivoSit.dataLineCount === 2,
    JSON.stringify({ h: archivoSit.headerLineNumber, n: archivoSit.dataLineCount })
  );
  const archivoPlantilla = parseDerechohabienteFile([HEADER_PLANTILLA, ROW_A].join("\n"));
  check(
    "Plantilla anterior (encabezado con nombres de campo) sigue funcionando",
    archivoPlantilla.headerLineNumber === 1 && archivoPlantilla.dataLineCount === 1,
    JSON.stringify({ h: archivoPlantilla.headerLineNumber, n: archivoPlantilla.dataLineCount })
  );
  const sinEncabezado = parseDerechohabienteFile(ROW_A);
  check(
    "Sin encabezado: la primera línea se procesa como registro",
    sinEncabezado.headerLineNumber === null && sinEncabezado.dataLineCount === 1,
    JSON.stringify(sinEncabezado.dataLineCount)
  );
  const conCrlf = parseDerechohabienteFile(`\uFEFF${HEADER_SIT}\r\n\r\n${ROW_A}\r\n${ROW_CE}\r\n`);
  check(
    "BOM + CRLF + línea vacía: se conservan los números de línea originales",
    conCrlf.dataLineCount === 2 &&
      conCrlf.rows[0].lineNumber === 3 &&
      conCrlf.rows[1].lineNumber === 4,
    JSON.stringify(conCrlf.rows.map((r) => r.lineNumber))
  );
  check("BOM + CRLF: sin errores de validación", conCrlf.errors.length === 0, conCrlf.errors[0]);

  // ── Codificación ──────────────────────────────────────────────────────────
  const utf8 = new TextEncoder().encode("PEÑA|PERÚ");
  check("UTF-8 conserva ñ y tildes", decodeBufferToText(utf8) === "PEÑA|PERÚ", decodeBufferToText(utf8));
  const latin1 = new Uint8Array([0x50, 0x45, 0xd1, 0x41, 0x7c, 0xd3]);
  check(
    "Windows-1252/Latin-1 conserva ñ y tildes",
    decodeBufferToText(latin1) === "PEÑA|Ó",
    decodeBufferToText(latin1)
  );
  check(
    "BOM UTF-8 descartado al decodificar",
    decodeBufferToText(new Uint8Array([0xef, 0xbb, 0xbf, 0x41, 0x42])) === "AB"
  );

  // ── Fechas ────────────────────────────────────────────────────────────────
  check("29/02/2012 es válida (bisiesto)", parseDateToISO("29/02/2012").value === "2012-02-29");
  check("31/02/2020 no existe → error", Boolean(parseDateToISO("31/02/2020").invalid));
  check("07/01/2026 es válida", parseDateToISO("07/01/2026").value === "2026-01-07");
  check("Sin desplazamiento por zona horaria", parseDateToISO("01/01/2026").value === "2026-01-01");

  // ── Normalización ─────────────────────────────────────────────────────────
  const filaCe = parseDerechohabienteFile(withHeader(ROW_CE)).rows[0];
  check("CARNÉ  EXT (doble espacio) → CE", filaCe.values?.docType === "CE", filaCe.values?.docType);
  check("CONCUBINA(O) → Concubino/a", filaCe.values?.relationship === "Concubino/a", filaCe.values?.relationship);
  check("MASCULINO → M", filaCe.values?.gender === "M", filaCe.values?.gender);
  const filaA = parseDerechohabienteFile(withHeader(ROW_A)).rows[0];
  check("HIJO MENOR DE EDAD → Hijo Menor de Edad", filaA.values?.relationship === "Hijo Menor de Edad");
  check("L.E / DNI se conserva (valor admitido)", filaA.values?.docType === "L.E / DNI", filaA.values?.docType);
  check("FEMENINO → F", filaA.values?.gender === "F", filaA.values?.gender);

  const filaSexoRaro = parseDerechohabienteFile(withHeader(ROW_A.replace("FEMENINO", "INDETERMINADO"))).rows[0];
  check(
    "Sexo desconocido no se convierte en una categoría incorrecta",
    filaSexoRaro.values?.gender === null && filaSexoRaro.errors.length > 0,
    JSON.stringify(filaSexoRaro.errors)
  );
  const filaVinculoRaro = parseDerechohabienteFile(withHeader(ROW_A.replace("HIJO MENOR DE EDAD", "SOBRINO"))).rows[0];
  check(
    "Vínculo desconocido no se convierte en una categoría incorrecta",
    filaVinculoRaro.values?.relationship === null && filaVinculoRaro.errors.length > 0
  );
  const filaFechaRara = parseDerechohabienteFile(withHeader(ROW_A.replace("15/03/2010", "31/02/2020"))).rows[0];
  check(
    "Fecha inexistente → error con número de línea",
    filaFechaRara.errors[0]?.startsWith("Línea 2") && filaFechaRara.errors[0].includes("no existe"),
    filaFechaRara.errors[0]
  );

  // ── Payload ───────────────────────────────────────────────────────────────
  const payload = buildDerechohabientePayload(filaCe, EMPLEADOS[0], FECHA_ALTA);
  check("Documento del derechohabiente se guarda como texto", payload.document_number === "00123456");
  check("Teléfono conserva el cero inicial", payload.phone === "0987654321", payload.phone);
  check("Mes de concepción se guarda como texto", payload.document_number_sustento === "09823096");
  check("Apellido materno con ñ se conserva", payload.last_name_materno === "PEÑA", payload.last_name_materno);
  check("País conservado como descripción", payload.country_code === "PERÚ", payload.country_code);
  check("Ubigeo conservado como descripción", payload.ubigeo === "LIMA-LIMA-LIMA", payload.ubigeo);
  check("Fecha de nacimiento en formato ISO", payload.birth_date === "2012-02-29", payload.birth_date);

  // ── Identificación del titular ────────────────────────────────────────────
  const clasificacionBase = classifyDerechohabienteRows({
    rows: parseDerechohabienteFile(withHeader(ROW_A, ROW_CE)).rows,
    employees: EMPLEADOS,
    existing: [],
  });
  check(
    "Titulares encontrados por documento",
    clasificacionBase.valid.length === 2 && clasificacionBase.valid.every((v) => v.titular.id === "emp-1"),
    JSON.stringify(clasificacionBase.valid.map((v) => v.titular.id))
  );

  const filaTipoCe = parseDerechohabienteFile(
    withHeader(ROW_CE.replace("L.E / DNI|12345678|", "CARNÉ EXT|55667788|"))
  ).rows[0];
  const clasificacionTipo = classifyDerechohabienteRows({
    rows: [filaTipoCe],
    employees: EMPLEADOS,
    existing: [],
  });
  check(
    "Mismo número con dos tipos: se desempata por tipo de documento",
    clasificacionTipo.valid[0]?.titular?.id === "emp-y",
    JSON.stringify(clasificacionTipo)
  );

  const filaAmbigua = parseDerechohabienteFile(
    withHeader(ROW_A.replace("|12345678|", "|55667788|"))
  ).rows[0];
  const clasificacionAmbigua = classifyDerechohabienteRows({
    rows: [filaAmbigua],
    employees: [
      { id: "emp-x", document_type: "DNI", document_number: "55667788" },
      { id: "emp-z", document_type: "DNI", document_number: "55667788" },
    ],
    existing: [],
  });
  check(
    "Coincidencia ambigua se informa y no se crea nada",
    clasificacionAmbigua.valid.length === 0 &&
      clasificacionAmbigua.missingTitular[0]?.reason.includes("ambigua"),
    JSON.stringify(clasificacionAmbigua.missingTitular)
  );

  const filaInexistente = parseDerechohabienteFile(
    withHeader(ROW_A.replace("|12345678|", "|99999999|"))
  ).rows[0];
  const clasificacionInexistente = classifyDerechohabienteRows({
    rows: [filaInexistente],
    employees: EMPLEADOS,
    existing: [],
  });
  check(
    "Titular inexistente se informa sin crear empleados",
    clasificacionInexistente.valid.length === 0 &&
      clasificacionInexistente.missingTitular[0]?.reason.includes("no existe"),
    JSON.stringify(clasificacionInexistente.missingTitular)
  );

  const filaCerosTitular = parseDerechohabienteFile(
    withHeader(ROW_A.replace("|12345678|", "|012345678|"))
  ).rows[0];
  const clasificacionCeros = classifyDerechohabienteRows({
    rows: [filaCerosTitular],
    employees: EMPLEADOS,
    existing: [],
  });
  check(
    "El documento del titular se empareja aunque difiera en ceros iniciales",
    clasificacionCeros.valid[0]?.titular?.id === "emp-1",
    JSON.stringify(clasificacionCeros)
  );

  // ── Duplicados ────────────────────────────────────────────────────────────
  const clasificacionDuplicada = classifyDerechohabienteRows({
    rows: parseDerechohabienteFile(withHeader(ROW_A, ROW_A)).rows,
    employees: EMPLEADOS,
    existing: [],
  });
  check(
    "Duplicado dentro del archivo: 1 válido y 1 omitido",
    clasificacionDuplicada.valid.length === 1 &&
      clasificacionDuplicada.duplicates.length === 1 &&
      clasificacionDuplicada.duplicates[0].reason.includes("duplicado en el archivo"),
    JSON.stringify(clasificacionDuplicada.duplicates)
  );
  const clasificacionExistente = classifyDerechohabienteRows({
    rows: parseDerechohabienteFile(withHeader(ROW_A)).rows,
    employees: EMPLEADOS,
    existing: [{ employee_id: "emp-1", document_number: "87654321" }],
  });
  check(
    "Ya registrado: se omite (reimportar no duplica)",
    clasificacionExistente.valid.length === 0 && clasificacionExistente.duplicates.length === 1,
    JSON.stringify(clasificacionExistente.duplicates)
  );

  const failed = results.filter((r) => !r.ok);
  return {
    passed: results.length - failed.length,
    failed: failed.length,
    results,
  };
}