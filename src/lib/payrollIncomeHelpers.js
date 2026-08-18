// Helpers para identificar conceptos calculados dentro de result.incomes.
// Extraídos de PayrollManagement para reutilización y para mantener el
// archivo principal por debajo del límite de líneas.
import { safePayrollNumber, roundMoney } from "@/lib/payrollUtils";

export const _normStr = (s) => String(s || "").toLowerCase().trim();

// Suma los calculated_amount de los ingresos cuya categoría coincide (normalizada).
export const sumIncomesByCategory = (incomes, category) => {
  if (!Array.isArray(incomes)) return 0;
  const cat = _normStr(category);
  return incomes
    .filter(c => _normStr(c.concept_category) === cat)
    .reduce((sum, c) => sum + safePayrollNumber(c.calculated_amount), 0);
};

// Suma los calculated_amount de los ingresos de horas extras reconocidos por
// categoría, nombre o fórmula. Un concepto se considera de horas extras cuando
// cumple CUALQUIERA de estas condiciones:
//   - concept_category normalizado es "horas extras".
//   - concept_name corresponde a "Horas Extras al 25%" o "Horas Extras al 35%".
//   - calculation_formula contiene horas_extras_25 u horas_extras_35.
// Evita que un concepto quede fuera del campo overtime_pay solo porque su
// concept_category no sea exactamente "Horas Extras".
export const sumOvertimeIncomes = (incomes) => {
  if (!Array.isArray(incomes)) return 0;
  return incomes
    .filter(c => {
      const cat = _normStr(c.concept_category);
      const name = _normStr(c.concept_name);
      const formula = _normStr(c.calculation_formula);
      return cat === "horas extras"
        || name === "horas extras al 25%"
        || name === "horas extras al 35%"
        || formula.includes("horas_extras_25")
        || formula.includes("horas_extras_35");
    })
    .reduce((sum, c) => sum + safePayrollNumber(c.calculated_amount), 0);
};

// Remuneración base calculada: suma de ingresos con categoría "Remuneración Base".
// Si no existe el concepto, conserva el salario nominal del contrato (fallback).
export const getCalculatedBaseSalary = (incomes, fallback) => {
  if (!Array.isArray(incomes)) return safePayrollNumber(fallback);
  const baseConcepts = incomes.filter(c => _normStr(c.concept_category) === "remuneración base");
  if (baseConcepts.length === 0) return safePayrollNumber(fallback);
  return roundMoney(baseConcepts.reduce((s, c) => s + safePayrollNumber(c.calculated_amount), 0));
};

// Encuentra el monto calculado de un concepto de costo.
// Primario: la fórmula contiene la variable (activity_cost, food_cost, transport_cost).
// Respaldo: el nombre del concepto coincide con palabras clave.
export const findCalculatedCost = (incomes, varName, nameKeywords) => {
  if (!Array.isArray(incomes)) return 0;
  let match = incomes.find(c => {
    const f = _normStr(c.calculation_formula);
    return f && f.includes(varName);
  });
  if (match) return safePayrollNumber(match.calculated_amount);
  match = incomes.find(c => {
    const n = _normStr(c.concept_name);
    return nameKeywords.some(kw => n.includes(kw));
  });
  return match ? safePayrollNumber(match.calculated_amount) : 0;
};

// Encuentra la asignación familiar calculada (lógica del sistema o nombre).
export const findCalculatedFamilyAllowance = (incomes) => {
  if (!Array.isArray(incomes)) return 0;
  let match = incomes.find(c => c.system_logic_type === "family_allowance");
  if (!match) match = incomes.find(c => _normStr(c.concept_name).includes("asignación familiar"));
  return match ? safePayrollNumber(match.calculated_amount) : 0;
};
