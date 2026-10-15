/**
 * Helpers para integrar la retención de Quinta Categoría en el cálculo de planilla.
 *
 * La retención vigente (aprobada/aplicada) del módulo de Quinta Categoría se incorpora
 * como descuento (income_tax) en la boleta del empleado para el período correspondiente,
 * respetando el modo manual autorizado sobre el cálculo automático.
 */
import { safePayrollNumber, roundMoney } from "@/lib/payrollUtils";

/**
 * Determina el importe de retención de Quinta Categoría para un empleado y período.
 *
 * @param {Array} quintaCategoriaCalculos - Cálculos aprobados/aplicados del ejercicio.
 * @param {string} employeeId - ID del empleado.
 * @param {number} month - Mes del período.
 * @param {number} year - Año del período.
 * @returns {Object|undefined} - Cálculo vigente para el empleado, período y tipo.
 */
function findQuintaCalculation(quintaCategoriaCalculos, employeeId, month, year, payrollType) {
  return (quintaCategoriaCalculos || []).filter(
    c => c.employee_id === employeeId &&
         Number(c.month) === Number(month) &&
         Number(c.year) === Number(year) &&
         (c.payroll_type || "Mensual") === payrollType &&
         ["Aprobada", "Aplicada"].includes(c.status)
  ).sort((a, b) => String(b.created_date || "").localeCompare(String(a.created_date || "")))[0];
}

// Distingue una retención explícita de cero de la ausencia de cálculo.
export function getQuintaRetention(quintaCategoriaCalculos, employeeId, month, year, payrollType = "Mensual") {
  const calc = findQuintaCalculation(quintaCategoriaCalculos, employeeId, month, year, payrollType);
  if (!calc) return { amount: 0, hasCalc: false };
  const calcMode = calc.calculation_mode || "auto";
  const rawAmount = calcMode === "manual"
    ? safePayrollNumber(calc.manual_amount)
    : safePayrollNumber(calc.current_month_retention);
  return { amount: roundMoney(rawAmount), hasCalc: true };
}

/**
 * Aplica la retención de Quinta Categoría al resultado del cálculo de planilla.
 *
 * Reemplaza el descuento de renta basado en conceptos por la retención vigente del
 * módulo de Quinta Categoría. Actualiza el breakdown del calculation_summary para
 * que la boleta y los reportes muestren el concepto.
 *
 * @param {Object} result - Resultado del PayrollCalculator.
 * @param {Array} quintaCategoriaCalculos - Cálculos aprobados/aplicados del ejercicio.
 * @param {string} employeeId - ID del empleado.
 * @param {number} month - Mes del período.
 * @param {number} year - Año del período.
 * @param {string} payrollType - Tipo de planilla (no aplica en Quincenal).
 * @returns {{ retention: number, adjustment: number, finalIncomeTax: number, conceptIncomeTax: number }}
 */
export function applyQuintaRetentionToResult(result, quintaCategoriaCalculos, employeeId, month, year, payrollType) {
  const isQuinta = name => /renta|quinta|5ta/i.test(name || "");
  const conceptIncomeTax = roundMoney(result.deductions
    .filter(d => isQuinta(d.concept_name))
    .reduce((sum, d) => sum + safePayrollNumber(d.calculated_amount), 0));

  let retention = 0;
  let hasQuintaCalc = false;
  if (payrollType !== "Quincenal") {
    const qr = getQuintaRetention(quintaCategoriaCalculos, employeeId, month, year, payrollType);
    retention = qr.amount;
    hasQuintaCalc = qr.hasCalc;
  }

  const finalIncomeTax = hasQuintaCalc ? retention : conceptIncomeTax;
  const adjustment = hasQuintaCalc ? roundMoney(retention - conceptIncomeTax) : 0;

  // Actualizar el breakdown del calculation_summary si la retención proviene del módulo.
  if (hasQuintaCalc && result.summary?.breakdown?.deductions) {
    const summaryDeductions = result.summary.breakdown.deductions;
    const existingRentaIdx = summaryDeductions.items.findIndex(
      item => isQuinta(item.name)
    );
    const quintaItem = {
      name: summaryDeductions.items[existingRentaIdx]?.name || "Impuesto a la Renta 5ta Categoría",
      concept_code: summaryDeductions.items[existingRentaIdx]?.concept_code || "",
      concept_id: summaryDeductions.items[existingRentaIdx]?.concept_id || null,
      amount: retention,
      method: "system_logic",
      formula: null,
      system_logic_type: "quinta_categoria",
      concept_category: "Impuestos",
      is_worker_contribution: true,
    };
    summaryDeductions.items = summaryDeductions.items.filter(item => !isQuinta(item.name));
    summaryDeductions.items.push(quintaItem);
    summaryDeductions.count = summaryDeductions.items.length;
    summaryDeductions.total = roundMoney((summaryDeductions.total || 0) + adjustment);
  }

  return { retention, adjustment, finalIncomeTax, conceptIncomeTax, hasQuintaCalc };
}
