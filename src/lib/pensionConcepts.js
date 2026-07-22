// Identificación de conceptos pensionarios heredados (autogenerados) vs. sobrescritura manual.
//
// Los conceptos heredados fueron creados automáticamente por versiones anteriores de
// EmployeeManagement con nombres "AFP - Comisión", "AFP - Aporte Obligatorio",
// "AFP - Seguro" y "ONP": is_dynamic=true y fórmulas basadas en base_salary.
// No tenían asignada concept_category === "AFP/ONP" al crearse.
//
// Una sobrescritura manual explícita se identifica por concept_category === "AFP/ONP".
// El cálculo centralizado en PayrollCalculator.calculatePensionContribution es la
// única fuente automática; los conceptos heredados se ignoran y los manuales la reemplazan.

const LEGACY_PENSION_NAMES = [
  "afp - comisión",
  "afp - aporte obligatorio",
  "afp - seguro",
  "onp",
];

const norm = (s) => (s == null ? "" : String(s).toLowerCase().trim());

// True si el concepto es un descuento pensionario autogenerado heredado (a ignorar).
export const isLegacyAutoPensionConcept = (concept) => {
  if (!concept) return false;
  if (concept.concept_type !== "Descuento") return false;
  // Una sobrescritura manual explícita tiene categoría AFP/ONP: no es legacy.
  if (concept.concept_category === "AFP/ONP") return false;
  const name = norm(concept.concept_name);
  return LEGACY_PENSION_NAMES.includes(name);
};

// True si el concepto es una sobrescritura manual explícita del cálculo pensionario.
export const isManualPensionOverride = (concept) => {
  if (!concept) return false;
  return concept.concept_category === "AFP/ONP" && !isLegacyAutoPensionConcept(concept);
};

// True si existe al menos una sobrescritura manual en la lista de conceptos.
export const hasManualPensionOverride = (concepts = []) =>
  concepts.some(isManualPensionOverride);