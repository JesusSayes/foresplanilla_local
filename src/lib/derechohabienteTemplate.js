// Especificación del formato TXT de derechohabientes (separador |, 24 columnas).
// Es el mismo formato del archivo que descarga RR.HH.: el encabezado del archivo
// real y el de esta plantilla se reconocen y se omiten al importar.
// El orden y los nombres coinciden exactamente con el parser (derechohabienteParser).

export const EXPECTED_FIELD_COUNT = 24;

// pos = posición 1-based (para mostrar al usuario). Índice 0-based = pos - 1.
export const FIELD_SPECS = [
  { pos: 1,  key: "doc_titular",    name: "Tipo Doc. Titular",        req: "Opcional",    format: "L.E / DNI, CARNÉ EXT, DNI, CE",            example: "L.E / DNI" },
  { pos: 2,  key: "num_titular",    name: "N° Doc. Titular",          req: "Obligatorio", format: "Texto (conserva ceros iniciales)",          example: "12345678" },
  { pos: 3,  key: "doc_dhabiente",  name: "Tipo Doc. Derechohab.",   req: "Opcional",    format: "L.E / DNI, CARNÉ EXT, DNI, CE",            example: "L.E / DNI" },
  { pos: 4,  key: "num_dhabiente",  name: "N° Doc. Derechohab.",     req: "Obligatorio", format: "Texto (conserva ceros iniciales)",          example: "87654321" },
  { pos: 5,  key: "cod_pais",       name: "País",                    req: "Opcional",    format: "Descripción (PERÚ) o código",               example: "PERÚ" },
  { pos: 6,  key: "fec_nac",        name: "Fecha Nacimiento",        req: "Obligatorio", format: "DD/MM/YYYY (fecha real)",                   example: "15/03/2010" },
  { pos: 7,  key: "ape_paterno",    name: "Apellido Paterno",        req: "Opcional",    format: "Texto",                                     example: "GÓMEZ" },
  { pos: 8,  key: "ape_materno",    name: "Apellido Materno",        req: "Opcional",    format: "Texto",                                     example: "MUÑOZ" },
  { pos: 9,  key: "nombres",        name: "Nombres",                req: "Obligatorio", format: "Texto",                                     example: "LUCÍA MARÍA" },
  { pos: 10, key: "sexo",           name: "Sexo",                   req: "Opcional",    format: "MASCULINO / FEMENINO (o M / F)",            example: "FEMENINO" },
  { pos: 11, key: "tip_vin_fam",    name: "Tipo Vínculo Familiar",   req: "Obligatorio", format: "CONYUGE, CONCUBINA(O), HIJO MENOR DE EDAD", example: "HIJO MENOR DE EDAD" },
  { pos: 12, key: "tip_doc_sust",   name: "Tipo Doc. Sustento",      req: "Opcional",    format: "Texto",                                     example: "ACTA/PARTIDA DE NACIMIENTO" },
  { pos: 13, key: "num_doc_sust",   name: "N° Doc. Sustento",        req: "Opcional",    format: "Texto (conserva ceros iniciales)",          example: "001" },
  { pos: 14, key: "mes_concep",     name: "Mes Concepción",          req: "Opcional",    format: "Texto",                                     example: "" },
  { pos: 15, key: "desc_dir1",      name: "Dirección 1",             req: "Opcional",    format: "Texto",                                     example: "AV. LOS OLIVOS 123" },
  { pos: 16, key: "ref_dir1",       name: "Referencia Dir. 1",       req: "Opcional",    format: "Texto",                                     example: "" },
  { pos: 17, key: "ubigeo_dir1",    name: "Ubigeo Dir. 1",          req: "Opcional",    format: "DEPARTAMENTO-PROVINCIA-DISTRITO (o código)", example: "LIMA-LIMA-ATE" },
  { pos: 18, key: "desc_dir2",      name: "Dirección 2",             req: "Opcional",    format: "Texto",                                     example: "" },
  { pos: 19, key: "ref_dir2",       name: "Referencia Dir. 2",       req: "Opcional",    format: "Texto",                                     example: "" },
  { pos: 20, key: "ubigeo_dir2",    name: "Ubigeo Dir. 2",          req: "Opcional",    format: "DEPARTAMENTO-PROVINCIA-DISTRITO (o código)", example: "" },
  { pos: 21, key: "ind_centro",     name: "Ind. Centro Salud",      req: "Opcional",    format: "Texto",                                     example: "DOMICILIO 1" },
  { pos: 22, key: "cod_ciudad",     name: "Código Ciudad",          req: "Opcional",    format: "Texto",                                     example: "1" },
  { pos: 23, key: "telefono",       name: "Teléfono",               req: "Opcional",    format: "Texto (conserva ceros iniciales)",          example: "987654321" },
  { pos: 24, key: "correo",         name: "Correo",                 req: "Opcional",    format: "Texto",                                     example: "" },
];

export const DOC_TYPE_CODES = [
  { code: "L.E / DNI", desc: "Libreta electoral / DNI (se guarda tal cual)" },
  { code: "CARNÉ EXT", desc: "Carné de extranjería (se guarda como CE, admite ceros iniciales)" },
  { code: "DNI",       desc: "Documento Nacional de Identidad" },
  { code: "PAS",       desc: "Pasaporte (se guarda como Pasaporte)" },
  { code: "PARTIDA",   desc: "Partida de nacimiento" },
];

export const SEX_CODES = [
  { code: "MASCULINO", desc: "Masculino (se guarda como M)" },
  { code: "FEMENINO",  desc: "Femenino (se guarda como F)" },
  { code: "M / F",     desc: "También se aceptan las iniciales" },
];

export const RELATIONSHIP_CODES = [
  { code: "CONYUGE",            desc: "Cónyuge" },
  { code: "CONCUBINA(O)",       desc: "Concubino/a" },
  { code: "HIJO MENOR DE EDAD", desc: "Hijo Menor de Edad" },
  { code: "HIJO / HIJA",        desc: "Hijo/a" },
  { code: "PADRE / MADRE",      desc: "Padre / Madre" },
  { code: "OTRO",               desc: "Otro" },
];

// Encabezado con las mismas columnas del archivo que descarga RR.HH.
const TEMPLATE_HEADER = [
  "Doc.Titular",
  "N°Doc.Titular",
  "Doc.DHabiente",
  "N°Doc.DHabiente",
  "Cod.País",
  "Fec.Nac.",
  "Ape.Paterno",
  "Ape.Materno",
  "Nombres",
  "Sexo",
  "Tip.Vin.Fam.",
  "Tip.Doc.Sust.",
  "Num.Doc.Sust.",
  "Mes Concep.",
  "Descripción Dirección 1",
  "Referencia Dirección 1",
  "Ubigeo Dirección 1",
  "Descripción Dirección 2",
  "Referencia Dirección 2",
  "Ubigeo Dirección 2",
  "Ind.Centro Asistencial EsSalud",
  "Cod. Ciudad",
  "Teléfono",
  "Correo Electronico",
].join("|");

// Filas de ejemplo con datos ficticios (ceros iniciales, tildes y ñ incluidos).
const TEMPLATE_SAMPLE_ROWS = [
  "L.E / DNI|12345678|L.E / DNI|87654321|PERÚ|15/03/2010|GÓMEZ|MUÑOZ|LUCÍA MARÍA|FEMENINO|HIJO MENOR DE EDAD|ACTA/PARTIDA DE NACIMIENTO|001||AV. LOS OLIVOS 123||LIMA-LIMA-ATE||||DOMICILIO 1|1|987654321|lucia@example.com|",
  "CARNÉ EXT|12345678|CARNÉ EXT|00123456|PERÚ|22/08/1985|TORRES|SOTO|CARLOS EDUARDO|MASCULINO|CONCUBINA(O)|ESCRIT PÚB REC. UNIÓN HECHO LEY 29560|09823096||JR. ANCASH 456||LIMA-LIMA-LIMA||||DOMICILIO 1|1|999888777||",
];

export function buildTemplateContent() {
  return [TEMPLATE_HEADER, ...TEMPLATE_SAMPLE_ROWS].join("\n") + "\n";
}

// Descarga la plantilla codificada en UTF-8 (el importador detecta UTF-8 y Latin-1).
export function downloadTemplate() {
  const blob = new Blob([buildTemplateContent()], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "plantilla_derechohabientes.txt";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
