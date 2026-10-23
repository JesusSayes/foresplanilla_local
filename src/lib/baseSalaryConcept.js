// Remuneración básica (concepto 00101) atada al contrato del período.
//
// La remuneración básica debe salir SIEMPRE del contrato aprobado que corresponde
// al período liquidado. Un concepto de Remuneración Base configurado como monto
// fijo (00101 / 0121 o categoría "Remuneración Base") conserva un importe que puede
// quedar obsoleto; antes de calcular, ese importe se reemplaza por el sueldo del
// contrato del período. Los conceptos dinámicos no se tocan: sus fórmulas ya leen
// la variable base_salary, que el cálculo ya enriquece con el contrato del período.

const BASE_SALARY_CODES = ["00101", "0121"];

/** ¿El concepto representa la remuneración básica con importe fijo? */
export const isFixedBaseSalaryConcept = (concept) => {
  if (!concept) return false;
  if (concept.system_logic_type || concept.is_dynamic) return false;
  const category = String(concept.concept_category || "").toLowerCase();
  const name = String(concept.concept_name || "").toLowerCase();
  if (category.includes("remuneración base") || category.includes("remuneracion base")) return true;
  if (/remuneraci[oó]n\s*b[aá]sica/.test(name)) return true;
  return BASE_SALARY_CODES.includes(String(concept.concept_code || "").trim());
};

/**
 * Reemplaza el importe fijo de los conceptos de Remuneración Base por el sueldo del
 * contrato del período. Sin sueldo contractual válido, los conceptos quedan intactos.
 */
export const applyContractSalaryToBaseConcepts = (concepts, contractSalary) => {
  const salary = Number(contractSalary) || 0;
  if (salary <= 0) return concepts || [];
  return (concepts || []).map((concept) =>
    isFixedBaseSalaryConcept(concept) ? { ...concept, amount: salary } : concept
  );
};