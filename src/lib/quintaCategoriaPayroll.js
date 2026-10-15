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
  // Suma de TODAS las retenciones de conceptos "Renta/Quinta" (puede haber más de una).
  const conceptIncomeTax = result.deductions
    .filter(d => /renta|quinta/i.test(d.concept_name || ""))
    .reduce((sum, d) => sum + safePayrollNumber(d.calculated_amount), 0);

  let retention = 0;
  let hasQuintaCalc = false;
  if (payrollType !== "Quincenal") {
    const qr = getQuintaRetention(quintaCategoriaCalculos, employeeId, month, year);
    retention = qr.amount;
    hasQuintaCalc = qr.hasCalc;
  }

  // Si existe cálculo de quinta (incluso con monto manual 0), usar esa retención.
  // Si no existe cálculo, conservar el descuento basado en conceptos.
  const finalIncomeTax = hasQuintaCalc ? retention : conceptIncomeTax;
  const adjustment = hasQuintaCalc ? roundMoney(retention - conceptIncomeTax) : 0;

  // Actualizar el breakdown del calculation_summary si la retención proviene del módulo.
  if (hasQuintaCalc && result.summary?.breakdown?.deductions) {
    const summaryDeductions = result.summary.breakdown.deductions;
    // Reemplazar TODOS los ítems de Renta/Quinta por uno solo del módulo (evita duplicados).
    const rentaIndices = summaryDeductions.items
      .map((item, i) => /renta|quinta/i.test(item.name || "") ? i : -1)
      .filter(i => i >= 0);
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
    if (rentaIndices.length > 0) {
      summaryDeductions.items[rentaIndices[0]] = { ...summaryDeductions.items[rentaIndices[0]], ...quintaItem };
      // Eliminar duplicados restantes (si había más de un concepto de Renta)
      for (let i = rentaIndices.length - 1; i >= 1; i--) {
        summaryDeductions.items.splice(rentaIndices[i], 1);
        summaryDeductions.count = Math.max(0, (summaryDeductions.count || 0) - 1);
      }
    } else {
      summaryDeductions.items.push(quintaItem);
      summaryDeductions.count = (summaryDeductions.count || 0) + 1;
    }
    summaryDeductions.total = roundMoney((summaryDeductions.total || 0) + adjustment);
  }

  return { retention, adjustment, finalIncomeTax, conceptIncomeTax, hasQuintaCalc };
}