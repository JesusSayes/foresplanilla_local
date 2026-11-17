// Bonos proporcionales a los días trabajados.
//
//   factor      = dias_trabajados / (dias_trabajados + dias_no_trabajados)
//   bono_pagado = bono_base_del_periodo × factor
//
// Solo se prorratean los bonos que hoy se suman como importe COMPLETO del período
// (importe fijo): costo de actividad, movilidad, alimentación y bonos equivalentes
// de la misma naturaleza. Los conceptos cuya fórmula ya considera los días
// trabajados (ej. "(activity_cost / 30) * worked_days") no se vuelven a prorratear.
//
// El importe original del bono (contrato o ficha del trabajador) no se modifica:
// la proporcionalidad se aplica una sola vez al importe calculado para la boleta.

const norm = (value) => String(value ?? "").trim().toLowerCase();

const BONUS_NAME_RE = /(actividad|alimento|alimentaci[oó]n|movilidad|transporte)/;

/** ¿El concepto es un bono del período con importe fijo (no prorrateado aún)? */
export const isProratableBonus = (concept) => {
  if (!concept) return false;
  if (concept.concept_type !== "Ingreso") return false;
  // Lógicas del sistema (asignación familiar, etc.): importe propio, no bono del período.
  if (concept.system_logic_type) return false;
  // Fórmula configurada: ya prorratea por días trabajados o define su propio importe.
  if (concept.is_dynamic && String(concept.calculation_formula || "").trim()) return false;
  if (norm(concept.concept_category) === "bonificaciones") return true;
  return BONUS_NAME_RE.test(norm(concept.concept_name));
};

/**
 * Factor de prorrateo. Devuelve null si el total de días es cero: no se divide entre
 * cero y el llamador informa la inconsistencia.
 */
export const bonusProrationFactor = (workedDays, nonWorkedDays) => {
  const worked = Math.max(0, Number(workedDays) || 0);
  const notWorked = Math.max(0, Number(nonWorkedDays) || 0);
  const total = worked + notWorked;
  if (total <= 0) return null;
  return worked / total;
};

/** Aplica el factor a los bonos fijos del período (una sola vez). */
export const applyBonusProration = (concepts, factor) => {
  const list = Array.isArray(concepts) ? concepts : [];
  if (factor == null) return list;
  const safeFactor = Math.min(1, Math.max(0, Number(factor) || 0));
  return list.map((concept) => {
    if (!isProratableBonus(concept)) return concept;
    const base = parseFloat(concept.amount) || 0;
    if (base === 0) return concept;
    return { ...concept, amount: Math.round(base * safeFactor * 100) / 100 };
  });
};