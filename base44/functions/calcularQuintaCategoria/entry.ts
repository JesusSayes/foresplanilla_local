import { createClientFromRequest } from "npm:@base44/sdk@0.8.52";

/**
 * Calcula la retención de Impuesto a la Renta de Quinta Categoría para un empleado
 * en un período específico, usando la configuración tributaria vigente del ejercicio.
 *
 * Parámetros esperados en el body:
 *   - employee_id: string (requerido)
 *   - year: number (requerido)
 *   - month: number 1-12 (requerido)
 *   - payroll_type: string (opcional, default "Mensual")
 *   - monthly_remuneration: number (opcional, si no se pasa se calcula desde contrato/empleado)
 *
 * Retorna el desglose del cálculo: proyección anual, deducción, base imponible,
 * impuesto anual, retenciones previas, retención del mes y detalle por tramos.
 */
export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const { employee_id, year, month, payroll_type = "Mensual", monthly_remuneration } = body;

    if (!employee_id || !year || !month) {
      return Response.json({ error: "employee_id, year y month son obligatorios" }, { status: 400 });
    }

    // 1. Cargar configuración tributaria del ejercicio
    const configs = await base44.entities.QuintaCategoriaConfig.filter({ year, is_active: true });
    if (!configs || configs.length === 0) {
      return Response.json({
        error: `No hay configuración de Quinta Categoría activa para el ejercicio ${year}. Configure los parámetros (UIT, escalas) antes de calcular.`
      }, { status: 400 });
    }
    const config = configs[0];

    // 2. Determinar remuneración mensual gravable
    let remuneracionMensual = 0;
    if (monthly_remuneration != null && !isNaN(monthly_remuneration)) {
      remuneracionMensual = Number(monthly_remuneration);
    } else {
      // Cargar empleado y contrato vigente
      const employee = await base44.entities.Employee.get(employee_id);
      if (!employee) {
        return Response.json({ error: "Empleado no encontrado" }, { status: 404 });
      }

      // Buscar contrato vigente para el período
      const periodStart = `${year}-${String(month).padStart(2, "0")}-01`;
      const lastDay = new Date(year, month, 0).getDate();
      const periodEnd = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;

      const contracts = await base44.entities.Contract.filter({ employee_id }, "-start_date", 100);
      const empContracts = (contracts.items || contracts).filter(c => c.employee_id === employee_id);

      const periodStartObj = new Date(periodStart);
      const periodEndObj = new Date(periodEnd);

      const overlapping = empContracts.find(c => {
        if (!c.start_date) return false;
        const startDate = new Date(c.start_date.split("T")[0]);
        const endDate = c.end_date ? new Date(c.end_date.split("T")[0]) : null;
        return startDate <= periodEndObj && (!endDate || endDate >= periodStartObj);
      });

      const contractSalary = overlapping?.salary || employee.base_salary || 0;
      remuneracionMensual = Number(contractSalary) || 0;
    }

    if (remuneracionMensual <= 0) {
      return Response.json({
        error: "No se pudo determinar una remuneración mensual gravable mayor a 0 para el empleado."
      }, { status: 400 });
    }

    // 3. Proyección de remuneración anual
    // Remuneración proyectada = remuneración mensual × 12 (incluye gratificaciones)
    const projectedAnnualIncome = Math.round(remuneracionMensual * 12 * 100) / 100;

    // 4. Deducción anual (UIT × número de UIT deducibles)
    const uitAmount = Number(config.uit_amount) || 0;
    const uitDeduction = Number(config.annual_deduction_uit) || 7;
    const annualDeduction = Math.round(uitAmount * uitDeduction * 100) / 100;

    // 5. Base imponible anual
    const projectedTaxableBase = Math.max(0, Math.round((projectedAnnualIncome - annualDeduction) * 100) / 100);

    // 6. Cálculo de impuesto anual por tramos
    const brackets = config.tax_brackets || [];
    let projectedAnnualTax = 0;
    const bracketDetails = [];

    if (brackets.length === 0 || projectedTaxableBase <= 0) {
      projectedAnnualTax = 0;
    } else {
      // Convertir tramos de UIT a soles
      for (const bracket of brackets) {
        const fromSoles = (Number(bracket.from_uit) || 0) * uitAmount;
        const toSoles = (Number(bracket.to_uit) || 999) * uitAmount;
        const rate = (Number(bracket.rate) || 0) / 100;

        if (projectedTaxableBase > fromSoles) {
          const taxableInBracket = Math.min(projectedTaxableBase, toSoles) - fromSoles;
          const taxInBracket = Math.round(taxableInBracket * rate * 100) / 100;
          projectedAnnualTax += taxInBracket;
          bracketDetails.push({
            from_uit: bracket.from_uit,
            to_uit: bracket.to_uit,
            from_soles: Math.round(fromSoles * 100) / 100,
            to_soles: Math.round(toSoles * 100) / 100,
            rate: bracket.rate,
            taxable_amount: Math.round(taxableInBracket * 100) / 100,
            tax_amount: taxInBracket,
          });
        } else {
          bracketDetails.push({
            from_uit: bracket.from_uit,
            to_uit: bracket.to_uit,
            from_soles: Math.round(fromSoles * 100) / 100,
            to_soles: Math.round(toSoles * 100) / 100,
            rate: bracket.rate,
            taxable_amount: 0,
            tax_amount: 0,
          });
        }
      }
      projectedAnnualTax = Math.round(projectedAnnualTax * 100) / 100;
    }

    // 7. Retenciones previas del ejercicio (meses anteriores al actual)
    const priorCalculos = await base44.entities.QuintaCategoriaCalculo.filter({
      employee_id,
      year,
      status: { $in: ["Aplicada", "Aprobada"] },
    });
    const priorRetentions = Math.round(
      priorCalculos
        .filter(c => c.month < month)
        .reduce((sum, c) => sum + Number(c.current_month_retention || c.manual_amount || 0), 0) * 100
    ) / 100;

    // 8. Retención del mes actual
    // Método de proyección: (Impuesto anual proyectado - retenciones previas) / meses restantes
    const remainingMonths = 12 - month + 1;
    let currentMonthRetention = 0;
    if (projectedAnnualTax > 0) {
      const remainingTax = projectedAnnualTax - priorRetentions;
      if (remainingTax > 0 && remainingMonths > 0) {
        currentMonthRetention = Math.round((remainingTax / remainingMonths) * 100) / 100;
      }
    }

    // 9. Construir detalle del cálculo
    const calculationDetail = {
      remuneracion_mensual: Math.round(remuneracionMensual * 100) / 100,
      projected_annual_income: projectedAnnualIncome,
      uit_amount: uitAmount,
      uit_deduction_count: uitDeduction,
      annual_deduction: annualDeduction,
      projected_taxable_base: projectedTaxableBase,
      bracket_details: bracketDetails,
      projected_annual_tax: projectedAnnualTax,
      prior_retentions: priorRetentions,
      remaining_months: remainingMonths,
      current_month_retention: currentMonthRetention,
      calculation_method: "auto_projection",
      config_id: config.id,
    };

    return Response.json({
      status: "success",
      calculation: {
        employee_id,
        year,
        month,
        payroll_type,
        projected_annual_income: projectedAnnualIncome,
        annual_deduction: annualDeduction,
        projected_taxable_base: projectedTaxableBase,
        projected_annual_tax: projectedAnnualTax,
        prior_retentions: priorRetentions,
        current_month_retention: currentMonthRetention,
        calculation_mode: "auto",
        status: "Pendiente",
        calculation_detail: calculationDetail,
        config_id: config.id,
      },
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}