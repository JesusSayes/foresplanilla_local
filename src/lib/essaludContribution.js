// ESSALUD (aportación del empleador).
//
//   base_essalud  = máximo(remuneración básica del período, RMV vigente del período)
//   aporte_essalud = base_essalud × porcentaje_essalud / 100
//
// El porcentaje NO se fija aquí: se mantiene el de la fórmula configurada en el
// concepto (ej. "base_salary * 0.09"), de modo que cambiarlo en Conceptos de
// Planilla basta y el código no impone ninguna tasa.
//
// Aplica exclusivamente a ESSALUD: no modifica el sueldo del trabajador ni las
// bases de AFP, ONP u otros conceptos.

const norm = (value) => String(value ?? "").trim().toLowerCase();

/** ¿El concepto es el aporte ESSALUD del empleador? */
export const isEssaludContribution = (concept) => {
  if (!concept) return false;
  // Se conserva su clasificación como aportación del empleador.
  if (norm(concept.concept_type) !== "aportación") return false;
  if (norm(concept.concept_category) === "essalud") return true;
  if (String(concept.concept_code || "").trim() === "0801") return true;
  return norm(concept.concept_name).includes("essalud");
};

/**
 * Base de cálculo: el mayor valor entre la remuneración básica y la RMV del período.
 *
 * Días subsidiados por incapacidad temporal (código 21): el subsidio no integra la
 * base y la base mínima (RMV) se prorratea por los días NO subsidiados del mes. Un mes
 * íntegramente subsidiado, sin otra remuneración afecta, no genera aporte mínimo.
 * Sin días subsidiados el resultado es idéntico al anterior.
 */
export const essaludBase = (baseRemuneration, rmvAmount, { subsidizedDays = 0, monthDays = 30 } = {}) => {
  const subsidized = Math.min(Math.max(0, Number(subsidizedDays) || 0), Math.max(1, Number(monthDays) || 30));
  const totalDays = Math.max(1, Number(monthDays) || 30);
  const proportionalRmv = (Number(rmvAmount) || 0) * ((totalDays - subsidized) / totalDays);
  return Math.max(Number(baseRemuneration) || 0, proportionalRmv);
};