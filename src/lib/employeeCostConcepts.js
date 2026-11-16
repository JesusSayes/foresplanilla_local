// Conceptos de bono del período generados desde la ficha/contrato del trabajador:
// costo de actividad, costo de alimento y costo de movilidad. Son importes FIJOS
// del período: su proporcionalidad por días trabajados se aplica después, al
// importe calculado para la boleta (src/lib/proratedBonuses.js), nunca sobre el
// dato original del contrato.

export const buildEmployeeCostConcepts = (employee) => {
  const emp = employee || {};
  const concepts = [];
  if (emp.activity_cost > 0) {
    concepts.push({ employee_id: emp.id, concept_type: "Ingreso", concept_category: "Bonificaciones", concept_name: "Costo Actividad", amount: emp.activity_cost, is_dynamic: false, applies_to_payroll_types: ["Quincenal", "Mensual", "Adicional", "SNP"] });
  }
  if (emp.food_cost > 0) {
    concepts.push({ employee_id: emp.id, concept_type: "Ingreso", concept_category: "Bonificaciones", concept_name: "Costo Alimento", amount: emp.food_cost, is_dynamic: false, applies_to_payroll_types: ["Quincenal", "Mensual", "Adicional", "SNP"] });
  }
  if (emp.transport_cost > 0) {
    concepts.push({ employee_id: emp.id, concept_type: "Ingreso", concept_category: "Asignaciones", concept_name: "Costo Movilidad", amount: emp.transport_cost, is_dynamic: false, applies_to_payroll_types: ["Quincenal", "Mensual", "Adicional", "SNP"] });
  }
  return concepts;
};

// Los conceptos fijos autogenerados desde el contrato SOLO se incluyen si NO existe
// un concepto configurado que cubra el mismo costo (por variable de fórmula o por
// nombre), para no pagar dos veces el mismo bono.
export const filterCoveredCostConcepts = (fixedConcepts, configuredConcepts) => {
  const coversCost = (costVariable, nameRegex) =>
    (configuredConcepts || []).some((c) => {
      const formula = String(c.calculation_formula || "").toLowerCase();
      const name = (c.concept_name || "").toLowerCase().trim();
      return formula.includes(costVariable) || nameRegex.test(name);
    });
  const coverage = {
    activity_cost: coversCost("activity_cost", /actividad/i),
    food_cost: coversCost("food_cost", /alimentaci[oó]n|alimento/i),
    transport_cost: coversCost("transport_cost", /movilidad|transporte/i),
  };
  return (fixedConcepts || []).filter((c) => {
    if (c.concept_name === "Costo Actividad") return !coverage.activity_cost;
    if (c.concept_name === "Costo Alimento") return !coverage.food_cost;
    if (c.concept_name === "Costo Movilidad") return !coverage.transport_cost;
    return true;
  });
};