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
 * @returns {number} - Importe de la retención (0 si no hay cálculo aplicable).
 */
export function getQuintaRetention(quintaCategoriaCalculos, employeeId, month, year) {
  const calc = (quintaCategoriaCalculos || []).find(
    c => c.employee_id === employeeId &&
         Number(c.month) === Number(month) &&
         Number(c.year) === Number(year)
  );
  if (!calc) return 0;
  const calcMode = calc.calculation_mode || "auto";
  const rawAmount = calcMode === "manual"
    ? safePayrollNumber(calc.manual_amount)
    : safePayrollNumber(calc.current_month_retention);
  return roundMoney(rawAmount);
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
  const conceptIncomeTax = safePayrollNumber(
    result.deductions.find(d => d.concept_name.includes("Renta"))?.calculated_amount
  );

  let retention = 0;
  if (payrollType !== "Quincenal") {
    retention = getQuintaRetention(quintaCategoriaCalculos, employeeId, month, year);
  }

  const finalIncomeTax = retention > 0 ? retention : conceptIncomeTax;
  const adjustment = retention > 0 ? roundMoney(retention - conceptIncomeTax) : 0;

  // Actualizar el breakdown del calculation_summary si la retención proviene del módulo.
  if (retention > 0 && result.summary?.breakdown?.deductions) {
    const summaryDeductions = result.summary.breakdown.deductions;
    const existingRentaIdx = summaryDeductions.items.findIndex(
      item => /renta|quinta/i.test(item.name || "")
    );
    const quintaItem = {
      name: "Retención 5ta Categoría",
      concept_code: "",
      concept_id: null,
      amount: retention,
      method: "system_logic",
      formula: null,
      system_logic_type: "quinta_categoria",
      concept_category: "Impuestos",
      is_worker_contribution: true,
    };
    if (existingRentaIdx >= 0) {
      summaryDeductions.items[existingRentaIdx] = { ...summaryDeductions.items[existingRentaIdx], ...quintaItem };
    } else {
      summaryDeductions.items.push(quintaItem);
      summaryDeductions.count = (summaryDeductions.count || 0) + 1;
    }
    summaryDeductions.total = roundMoney((summaryDeductions.total || 0) + adjustment);
  }

  return { retention, adjustment, finalIncomeTax, conceptIncomeTax };
}