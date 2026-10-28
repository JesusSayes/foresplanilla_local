// Clasificación de conceptos pensionarios (AFP/ONP) y validación de la afiliación.
//
// Regla única del sistema: el aporte del trabajador (AFP u ONP) se calcula SIEMPRE de
// forma centralizada en PayrollCalculator.calculatePensionContribution, según su
// afiliación (pension_system, afp_id y afp_commission_type) y sobre la base previsional
// (remuneración afecta). Ningún concepto de planilla reemplaza ese cálculo en silencio,
// de modo que nunca se descuentan AFP y ONP a la vez en una misma boleta.
//
// Por eso:
//   - Un concepto GENERAL (employee_id "general" o vacío) con categoría "AFP/ONP" o
//     nombre pensionario se IGNORA: no puede decidir el aporte de todos los trabajadores.
//   - Un concepto DEL TRABAJADOR que duplica lo que el sistema ya calcula (nombres
//     heredados "AFP - Comisión", "AFP - Aporte Obligatorio", "AFP - Seguro", "ONP", o
//     cualquier variante de aporte obligatorio / prima de seguro / comisión) se IGNORA,
//     para no duplicar el descuento.
//   - Un concepto DEL TRABAJADOR con categoría "AFP/ONP" que no corresponde al cálculo
//     automático (monto propio, o de un régimen distinto al del trabajador) es un ajuste
//     ambiguo: BLOQUEA la generación de la boleta y se informa el motivo.
//
// Los conceptos heredados fueron creados automáticamente por versiones anteriores de
// EmployeeManagement con nombres "AFP - Comisión", "AFP - Aporte Obligatorio",
// "AFP - Seguro" y "ONP": is_dynamic=true y fórmulas basadas en base_salary.

const LEGACY_PENSION_NAMES = [
  "afp - comisión",
  "afp - aporte obligatorio",
  "afp - seguro",
  "onp",
];

const norm = (s) => (s == null ? "" : String(s).toLowerCase().trim());

// Identifica un nombre pensionario (AFP, ONP, SNP o sus componentes).
const PENSION_NAME_RE =
  /\bafp\b|\bonp\b|\bsnp\b|aporte obligatorio|prima de seguro|previsional|sistema nacional de pensiones|comisi[oó]n (afp|mixta|flujo)/;

// Componentes que el cálculo automático ya genera (aporte obligatorio, prima de seguro,
// comisión y ONP). Un concepto del trabajador con estos nombres duplica el descuento:
// el sistema aplica el importe vigente de la AFP/ONP configurada.
const STANDARD_PENSION_COMPONENT_RES = [
  /^onp$/,
  /^snp$/,
  /sistema nacional de pensiones/,
  /aporte obligatorio/,
  /prima de seguro/,
  /seguro afp/,
  /comisi[oó]n (afp|mixta|flujo|sobre flujo|sobre saldo)/,
];

// True si el concepto es un descuento pensionario autogenerado heredado (a ignorar).
export const isLegacyAutoPensionConcept = (concept) => {
  if (!concept) return false;
  if (concept.concept_type !== "Descuento") return false;
  // Una sobrescritura manual explícita tiene categoría AFP/ONP: no es legacy.
  if (concept.concept_category === "AFP/ONP") return false;
  return LEGACY_PENSION_NAMES.includes(norm(concept.concept_name));
};

// True si el concepto es una sobrescritura manual explícita del cálculo pensionario.
export const isManualPensionOverride = (concept) => {
  if (!concept) return false;
  return concept.concept_category === "AFP/ONP" && !isLegacyAutoPensionConcept(concept);
};

// True si existe al menos una sobrescritura manual en la lista de conceptos.
export const hasManualPensionOverride = (concepts = []) =>
  concepts.some(isManualPensionOverride);

// True si el concepto es pensionario (descuento o aportación AFP/ONP).
export const isPensionConcept = (concept) => {
  if (!concept) return false;
  if (concept.concept_type === "Ingreso") return false;
  if (concept.concept_category === "AFP/ONP") return true;
  if (concept.system_logic_type === "pension_contribution") return true;
  if (norm(concept.calculation_formula) === "pension_contribution") return true;
  const name = norm(concept.concept_name);
  if (!name) return false;
  return PENSION_NAME_RE.test(name);
};

// True si el concepto duplica un componente que el sistema calcula automáticamente.
export const isStandardPensionComponent = (concept) => {
  if (isLegacyAutoPensionConcept(concept)) return true;
  const name = norm(concept?.concept_name);
  if (!name) return false;
  return STANDARD_PENSION_COMPONENT_RES.some((re) => re.test(name));
};

// Concepto global: aplica a todos los trabajadores, nunca a uno en particular.
export const isGeneralConceptScope = (concept) => {
  const id = norm(concept?.employee_id);
  return !id || id === "general";
};

// Clave estable para reconocer el mismo concepto en distintas listas.
export const pensionConceptKey = (concept) =>
  concept?.id ||
  [norm(concept?.concept_name), norm(concept?.concept_category), concept?.concept_type, norm(concept?.calculation_formula)].join("|");

// True si el trabajador tiene comisión AFP mixta.
export const isMixtaCommission = (employee) => norm(employee?.afp_commission_type) === "mixta";

// Clasifica los conceptos pensionarios de la lista:
//   ignored → conceptos que NO deben aplicarse (generales, heredados, duplicados).
//   issues  → ajustes ambiguos: bloquean la boleta y se informa el motivo.
export const classifyPensionConcepts = (employee, concepts = []) => {
  const ignored = [];
  const issues = [];
  const employeeId = employee?.id || "";
  const system = norm(employee?.pension_system);

  for (const concept of concepts || []) {
    if (!isPensionConcept(concept)) continue;
    const name = concept.concept_name || "(sin nombre)";

    // Concepto global: el aporte de cada trabajador depende de su propia afiliación.
    if (isGeneralConceptScope(concept)) {
      ignored.push({
        concept,
        name,
        reason: "Concepto general: el aporte AFP/ONP se calcula por trabajador según su afiliación",
      });
      continue;
    }

    // Concepto de otro trabajador: nunca debe afectar a este.
    if (employeeId && concept.employee_id && concept.employee_id !== employeeId) {
      ignored.push({ concept, name, reason: "Concepto de otro trabajador" });
      continue;
    }

    // Duplica un componente que el sistema ya calcula automáticamente.
    if (isStandardPensionComponent(concept)) {
      ignored.push({ concept, name, reason: "Duplicado del cálculo automático AFP/ONP" });
      continue;
    }

    const looksONP = /\bonp\b|\bsnp\b|sistema nacional de pensiones/.test(norm(name));
    const looksAFP = /\bafp\b|aporte obligatorio|prima de seguro/.test(norm(name));

    if (system === "afp" && looksONP && !looksAFP) {
      issues.push({
        concept,
        name,
        reason: `El concepto "${name}" corresponde a ONP pero el trabajador está afiliado a una AFP`,
      });
      continue;
    }
    if (system === "onp" && looksAFP && !looksONP) {
      issues.push({
        concept,
        name,
        reason: `El concepto "${name}" corresponde a AFP pero el trabajador está afiliado a ONP`,
      });
      continue;
    }

    issues.push({
      concept,
      name,
      reason: `El concepto "${name}" (categoría AFP/ONP) tiene un importe propio y no corresponde al cálculo automático: revise la afiliación del trabajador o elimine el concepto`,
    });
  }

  return { ignored, issues };
};

// Valida que la afiliación del trabajador alcance para calcular su aporte.
// Devuelve la lista de motivos que impiden generar la boleta (vacía si todo está bien).
export const getPensionAffiliationIssues = (employee, afp) => {
  const issues = [];
  if (!employee) return issues;

  const system = norm(employee.pension_system);
  if (!system) {
    issues.push("El trabajador no tiene sistema de pensiones definido (AFP, ONP o Ninguno)");
    return issues;
  }
  if (!["afp", "onp", "ninguno"].includes(system)) {
    issues.push(`Sistema de pensiones no reconocido: "${employee.pension_system}"`);
    return issues;
  }

  if (system === "afp") {
    if (!employee.afp_id) {
      issues.push("El trabajador está afiliado a una AFP pero no tiene AFP asignada");
    } else if (!afp) {
      issues.push("La AFP asignada al trabajador no existe en Datos Maestros");
    }
    // Con comisión Mixta la boleta solo descuenta aporte obligatorio y prima de seguro,
    // por lo que el % de comisión mixta no es un dato necesario para calcular: su ausencia
    // (o valor 0) no bloquea la generación de la boleta.
  }

  return issues;
};