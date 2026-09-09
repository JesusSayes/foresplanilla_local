// Definiciones de secciones de cláusulas de contrato y lógica de numeración automática.
// Compartido entre ContractTemplateConfig (editor/vista previa) y ContractTemplate (PDF).

export const STANDARD_SECTIONS = [
  { id: "object", titleField: "section_object_title", defaultTitle: "OBJETO DEL CONTRATO:" },
  { id: "functions", titleField: "section_functions_title", defaultTitle: "FUNCIONES Y RESPONSABILIDADES:" },
  { id: "duration", titleField: "section_duration_title", defaultTitle: "VIGENCIA DEL CONTRATO:" },
  { id: "salary", titleField: "section_salary_title", defaultTitle: "REMUNERACIÓN:" },
  { id: "schedule", titleField: "section_schedule_title", defaultTitle: "JORNADA Y HORARIO DE TRABAJO:" },
];

export const FINAL_SECTIONS = [
  { id: "obligations", titleField: "section_obligations_title", defaultTitle: "OBLIGACIONES DEL TRABAJADOR:" },
  { id: "benefits", titleField: "section_benefits_title", defaultTitle: "BENEFICIOS SOCIALES:" },
  { id: "termination", titleField: "section_termination_title", defaultTitle: "TÉRMINO DEL CONTRATO:" },
  { id: "domicile", titleField: "section_domicile_title", defaultTitle: "DOMICILIO:" },
];

export const DEFAULT_STANDARD_ORDER = ["object", "functions", "duration", "salary", "schedule"];
export const DEFAULT_FINAL_ORDER = ["obligations", "benefits", "termination", "domicile"];

// Elimina el numeral romano o arábigo inicial de un título (ej: "III. OBJETO" → "OBJETO")
export const stripNumeral = (title) => {
  if (!title) return "";
  return title
    .replace(/^\s*[IVXLCDM]+\.\s*/i, "")
    .replace(/^\s*\d+\.\s*/, "")
    .trim();
};

// Devuelve el título de una sección con el numeral automático prepended
export const numberedTitle = (number, title) => {
  return `${number}. ${stripNumeral(title)}`;
};

// Construye la lista ordenada completa de secciones con numeración automática continua.
// Orden: Empleador (sin número) → Trabajador (sin número) → Cláusulas estándar (1..N) →
// Cláusulas personalizadas (N+1..) → Textos finales (continúa).
export const buildOrderedSections = (template, customClauses = []) => {
  const standardOrder =
    template?.standard_clause_order?.length > 0
      ? template.standard_clause_order
      : DEFAULT_STANDARD_ORDER;
  const finalOrder =
    template?.final_text_order?.length > 0
      ? template.final_text_order
      : DEFAULT_FINAL_ORDER;

  const sections = [];
  let num = 1;

  // Empleador y Trabajador: secciones de datos (sin número)
  sections.push({
    type: "employer",
    id: "employer",
    title: stripNumeral(template?.employer_section_title || "DATOS DEL EMPLEADOR:"),
    number: null,
  });
  sections.push({
    type: "worker",
    id: "worker",
    title: stripNumeral(template?.worker_section_title || "DATOS DEL TRABAJADOR:"),
    number: null,
  });

  // Cláusulas estándar (numeradas desde 1, ordenadas)
  for (const sid of standardOrder) {
    const sec = STANDARD_SECTIONS.find((s) => s.id === sid);
    if (sec) {
      sections.push({
        type: "standard",
        id: sec.id,
        title: stripNumeral(template?.[sec.titleField] || sec.defaultTitle),
        number: num++,
      });
    }
  }

  // Cláusulas personalizadas (continúan la numeración)
  for (const clause of customClauses) {
    sections.push({
      type: "custom",
      id: clause.id,
      title: clause.title,
      content: clause.content,
      number: num++,
    });
  }

  // Textos finales (continúan la numeración)
  for (const fid of finalOrder) {
    const sec = FINAL_SECTIONS.find((s) => s.id === fid);
    if (sec) {
      sections.push({
        type: "final",
        id: sec.id,
        title: stripNumeral(template?.[sec.titleField] || sec.defaultTitle),
        number: num++,
      });
    }
  }

  return sections;
};

// Mueve un elemento dentro de un array de IDs (helper para reordenar)
export const moveItem = (arr, fromIndex, toIndex) => {
  if (toIndex < 0 || toIndex >= arr.length) return arr;
  const result = [...arr];
  const [item] = result.splice(fromIndex, 1);
  result.splice(toIndex, 0, item);
  return result;
};