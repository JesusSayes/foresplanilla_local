/**
 * Módulo de cálculo automático de conceptos de planilla
 * Evalúa fórmulas dinámicas, aplica lógica del sistema y maneja montos fijos
 */

import { getFamilyAllowanceEligibility } from "@/lib/familyAllowance";

// Catálogo de lógicas del sistema disponibles
export const SYSTEM_LOGIC_TYPES = {
  family_allowance: {
    label: "Asignación Familiar",
    description: "Calcula automáticamente según derechohabientes (10% RMV si tiene hijos elegibles)",
    concept_type: "Ingreso",
    concept_category: "Asignaciones",
  },
  tardiness_discount: {
    label: "Descuento por Tardanzas",
    description: "Calcula descuento según minutos de tardanza (reglamento interno)",
    concept_type: "Descuento",
    concept_category: "Descuentos Varios",
  },
  absence_discount: {
    label: "Descuento por Inasistencias",
    description: "Calcula descuento proporcional por días de inasistencia",
    concept_type: "Descuento",
    concept_category: "Descuentos Varios",
  },
  salary_advance: {
    label: "Adelanto Quincenal",
    description: "Monto del adelanto de sueldo quincenal según configuración",
    concept_type: "Descuento",
    concept_category: "Descuentos Varios",
  },
  loan_installment: {
    label: "Cuota de Préstamo",
    description: "Cuota mensual de préstamo según tabla de amortización",
    concept_type: "Descuento",
    concept_category: "Préstamos",
  },
  pension_contribution: {
    label: "Aporte AFP/ONP",
    description: "Calcula automáticamente el descuento al sistema de pensiones (AFP u ONP) según la configuración del empleado",
    concept_type: "Descuento",
    concept_category: "AFP/ONP",
  },
};

export class PayrollCalculator {
  constructor(employee, month, year, payrollType = "Mensual", quincenalPct = 0.40) {
    this.employee = employee;
    this.month = month;
    this.year = year;
    this.payrollType = payrollType;
    // Porcentaje decimal a aplicar en planillas quincenales (ej: 0.40 = 40%)
    this.quincenalPct = quincenalPct;
    this.calculationLog = [];
    this.errors = [];
  }

  /**
   * Evalúa una fórmula de cálculo con variables del empleado
   */
  evaluateFormula(formula, context) {
    try {
      // Variables disponibles en las fórmulas
      const variables = {
        base_salary: context.base_salary || 0,
        quincenal_amount: context.quincenal_amount || 0,
        worked_days: context.worked_days || 30,
        regular_hours: context.regular_hours || 0,
        overtime_hours: context.overtime_hours || 0,
        rmv: context.rmv || 1130,
        horas_extras_25: context.horas_extras_25 || 0,
        horas_extras_35: context.horas_extras_35 || 0,
        horas_nocturnas: context.horas_nocturnas || 0,
        total_income: context.total_income || 0,
        total_deductions: context.total_deductions || 0,
        transport_cost: context.transport_cost || 0,
        food_cost: context.food_cost || 0,
        activity_cost: context.activity_cost || 0,
      };

      // Reemplazar variables en la fórmula (con límites de palabra para evitar sustituciones parciales)
      let evaluatedFormula = formula;
      Object.keys(variables).forEach(key => {
        const regex = new RegExp('\\b' + key + '\\b', 'g');
        evaluatedFormula = evaluatedFormula.replace(regex, variables[key]);
      });

      // Evaluar la expresión matemática
      const result = this.safeEval(evaluatedFormula);
      
      this.logCalculation({
        formula: formula,
        evaluatedFormula: evaluatedFormula,
        result: result,
        variables: variables,
        status: 'success'
      });

      return result;
    } catch (error) {
      this.errors.push({
        formula: formula,
        error: error.message,
        context: context
      });
      
      this.logCalculation({
        formula: formula,
        error: error.message,
        status: 'error'
      });

      return 0;
    }
  }

  /**
   * Evaluación segura de expresiones matemáticas
   */
  safeEval(expression) {
    // Convertir la expresión a string y limpiar espacios extras
    const expr = String(expression).trim();

    // Permitir solo operaciones matemáticas básicas (números, operadores, paréntesis, punto decimal)
    const allowedChars = /^[0-9+\-*/.() ]+$/;
    
    if (!allowedChars.test(expr)) {
      throw new Error(`Fórmula contiene caracteres no permitidos tras reemplazar variables: "${expr}"`);
    }

    try {
      // Usar Function para evaluar de forma segura
      const result = Function('"use strict"; return (' + expr + ')')();
      if (typeof result !== 'number' || !Number.isFinite(result) || Math.abs(result) > 500_000) return 0;
      return result;
    } catch (error) {
      throw new Error('Error al evaluar la fórmula: ' + error.message);
    }
  }

  /**
   * Aplica la lógica del sistema según el tipo configurado en el concepto
   */
  applySystemLogic(concept, context) {
    const logicType = concept.system_logic_type;

    try {
      let result = 0;
      let detail = "";

      switch (logicType) {
        case "family_allowance": {
          // Asignación familiar: 10% RMV si tiene hijos elegibles (menores de 18 o estudiantes 18-24)
          const info = getFamilyAllowanceEligibility(
            context.derechohabientes || [],
            context.rmv || 1130
          );
          result = info.amount;
          detail = info.qualifies
            ? `Califica: ${info.eligibleCount} hijo(s) elegible(s)`
            : "No califica (sin hijos elegibles)";
          break;
        }

        case "tardiness_discount": {
          // Descuento por tardanzas: (salario_diario / 8) * minutos_tardanza / 60
          // Aplica para tardanzas mayores a 10 minutos (tolerancia)
          const lateRecords = context.late_records || [];
          const totalLateMinutes = lateRecords.reduce((sum, r) => sum + (r.late_minutes || 0), 0);
          const dailySalary = (context.base_salary || 0) / 30;
          const hourlyRate = dailySalary / 8;
          result = -(hourlyRate * (totalLateMinutes / 60));
          detail = `${totalLateMinutes} min de tardanza en ${lateRecords.length} día(s)`;
          break;
        }

        case "absence_discount": {
          // Descuento por inasistencias: salario_diario * días_falta
          const absentRecords = context.absent_records || [];
          const dailySalary = (context.base_salary || 0) / 30;
          result = -(dailySalary * absentRecords.length);
          detail = `${absentRecords.length} día(s) de inasistencia`;
          break;
        }

        case "salary_advance": {
          // Adelanto quincenal: base_salary * porcentaje quincenal
          result = -(context.quincenal_amount || 0);
          detail = `Adelanto quincenal`;
          break;
        }

        case "loan_installment": {
          // Cuota de préstamo: suma de cuotas pendientes del mes
          const installments = context.loan_installments || [];
          result = -(installments.reduce((sum, i) => sum + (i.amount || 0), 0));
          detail = `${installments.length} cuota(s) de préstamo`;
          break;
        }

        default:
          detail = `Lógica del sistema no reconocida: "${logicType}"`;
          this.errors.push({ concept: concept.concept_name, error: detail });
      }

      this.logCalculation({
        concept: concept.concept_name,
        system_logic_type: logicType,
        result: result,
        detail: detail,
        status: 'success'
      });

      return result;
    } catch (error) {
      this.errors.push({
        concept: concept.concept_name,
        system_logic_type: logicType,
        error: error.message
      });

      this.logCalculation({
        concept: concept.concept_name,
        system_logic_type: logicType,
        error: error.message,
        status: 'error'
      });

      return 0;
    }
  }

  /**
   * Calcula el descuento automático al sistema de pensiones (AFP u ONP)
   * según la configuración del empleado y su AFP asignada.
   * @param {number} totalIncome - Total de ingresos computables
   * @param {Object} context - Contexto de cálculo (incluye afp)
   */
  calculatePensionContribution(totalIncome, context) {
    const employee = this.employee;
    const pensionSystem = employee.pension_system;

    if (!pensionSystem || pensionSystem === "Ninguno") {
      return { items: [], totalAmount: 0, name: "", code: "", detail: "Sin sistema de pensiones configurado" };
    }

    // Devuelve { items: [{name, code, amount, detail}], totalAmount, name, code, detail }
    // Cada item se agrega como un descuento independiente en la boleta (según ley peruana:
    // aporte obligatorio, comisión y prima de seguro se muestran por separado).

    if (pensionSystem === "ONP") {
      const amount = totalIncome * 0.13;
      const rounded = Math.round(amount * 100) / 100;
      return {
        items: [{ name: "ONP", code: "0602", amount: rounded, detail: `ONP 13% de S/${totalIncome.toFixed(2)}` }],
        totalAmount: rounded,
        name: "ONP",
        code: "0602",
        detail: `ONP 13% de S/${totalIncome.toFixed(2)}`,
      };
    }

    if (pensionSystem === "AFP") {
      const afp = context.afp;
      if (!afp) {
        this.errors.push({ concept: "AFP", error: `Empleado ${employee.employee_code} tiene sistema AFP pero no tiene AFP asignada` });
        return { items: [], totalAmount: 0, name: "AFP", code: "", detail: "AFP no configurada para el empleado" };
      }
      const commission = Number(afp.commission_percentage) || 0;
      const obligatory = Number(afp.obligatory_contribution_percentage) || 10;
      const insurance = Number(afp.insurance_percentage) || 0;
      // Comisión Mixta: la comisión se cobra sobre el fondo acumulado, no sobre el flujo mensual
      const isMixta = employee.afp_commission_type === "Mixta";
      const round2 = (v) => Math.round(v * 100) / 100;

      const items = [];
      // 1) Aporte obligatorio (10% de la remuneración asegurable)
      const aporteAmount = round2(totalIncome * (obligatory / 100));
      items.push({
        name: `Aporte Obligatorio AFP ${afp.name}`,
        code: "0601",
        amount: aporteAmount,
        detail: `Aporte obligatorio ${obligatory}% de S/${totalIncome.toFixed(2)}`,
      });
      // 2) Prima de seguro (seguro)
      const seguroAmount = round2(totalIncome * (insurance / 100));
      items.push({
        name: `Prima de Seguro AFP ${afp.name}`,
        code: "0601",
        amount: seguroAmount,
        detail: `Prima de seguro ${insurance}% de S/${totalIncome.toFixed(2)}`,
      });
      // 3) Comisión (solo en régimen de Flujo; en Mixta se cobra sobre el saldo, no sobre el flujo)
      if (!isMixta && commission > 0) {
        const comisionAmount = round2(totalIncome * (commission / 100));
        items.push({
          name: `Comisión AFP ${afp.name}`,
          code: "0601",
          amount: comisionAmount,
          detail: `Comisión flujo ${commission}% de S/${totalIncome.toFixed(2)}`,
        });
      }

      const totalAmount = round2(items.reduce((s, i) => s + i.amount, 0));
      return {
        items,
        totalAmount,
        name: `AFP ${afp.name}`,
        code: "0601",
        detail: `AFP ${afp.name} (${isMixta ? "Mixta" : "Flujo"}): ${isMixta ? `${obligatory}%+${insurance}%` : `${commission}%+${obligatory}%+${insurance}%`} de S/${totalIncome.toFixed(2)}`,
      };
    }

    return { items: [], totalAmount: 0, name: "", code: "", detail: `Sistema de pensiones no reconocido: "${pensionSystem}"` };
  }

  /**
   * Calcula todos los conceptos de planilla para el empleado
   * @param {Array} concepts - Lista de conceptos
   * @param {Object} attendanceData - Datos de asistencia
   * @param {number} rmvAmount - RMV vigente
   * @param {Object} extraContext - Datos adicionales para lógica del sistema:
   *   - derechohabientes: lista de derechohabientes del empleado
   *   - late_records: registros de tardanza
   *   - absent_records: registros de inasistencia
   *   - loan_installments: cuotas de préstamo pendientes
   */
  async calculatePayroll(concepts, attendanceData, rmvAmount, extraContext = {}) {
    const context = this.buildContext(attendanceData, rmvAmount, extraContext);
    
    // Separar conceptos por tipo
    const incomes = [];
    const deductions = [];
    const contributions = [];

    for (const concept of concepts) {
      // Verificar si el concepto aplica según su periodicidad y fechas
      if (!this.shouldApplyConcept(concept)) {
        continue;
      }

      // Este concepto depende del total de ingresos y se calcula después del bucle.
      const formula = String(concept.calculation_formula || "").trim().toLowerCase();
      if (concept.system_logic_type === "pension_contribution" || formula === "pension_contribution") {
        continue;
      }

      const calculatedConcept = this.calculateConcept(concept, context);
      
      if (calculatedConcept.concept_type === "Ingreso") {
        incomes.push(calculatedConcept);
      } else if (calculatedConcept.concept_type === "Descuento") {
        deductions.push(calculatedConcept);
      } else if (calculatedConcept.concept_type === "Aportación") {
        contributions.push(calculatedConcept);
      }
    }

    // Calcular totales — sanitizar cada acumulador para evitar Infinity/NaN propagado
    const safe = (v) => (Number.isFinite(v) && Math.abs(v) <= 500_000 ? v : 0);
    const totalIncome = safe(incomes.reduce((sum, c) => sum + c.calculated_amount, 0));

    // Auto-calcular descuento de AFP/ONP según el sistema de pensiones del empleado.
    // Se calcula DESPUÉS de procesar todos los ingresos para usar el total real.
    // Se omite si ya existe un concepto manual con categoría AFP/ONP configurado.
    const pensionSystemConcept = concepts.find(c => {
      const formula = String(c.calculation_formula || "").trim().toLowerCase();
      return this.shouldApplyConcept(c) &&
        (c.system_logic_type === "pension_contribution" || formula === "pension_contribution");
    });
    const hasManualPensionConcept = concepts.some(c =>
      this.shouldApplyConcept(c) &&
      c !== pensionSystemConcept &&
      (c.concept_category === "AFP/ONP" ||
        String(c.concept_name || "").includes("AFP") ||
        String(c.concept_name || "") === "ONP")
    );
    if ((pensionSystemConcept || !hasManualPensionConcept) && this.payrollType !== "Quincenal" && totalIncome > 0) {
      const pensionCalc = this.calculatePensionContribution(totalIncome, context);
      // Agregar cada componente (aporte obligatorio, prima de seguro, comisión) como
      // un descuento independiente, según la ley peruana.
      (pensionCalc.items || []).forEach((item) => {
        if (item.amount > 0) {
          deductions.push({
            ...(pensionSystemConcept || {}),
            concept_type: "Descuento",
            concept_category: "AFP/ONP",
            concept_name: item.name,
            concept_code: item.code,
            is_dynamic: true,
            system_logic_type: "pension_contribution",
            calculated_amount: item.amount,
            calculation_method: "system_logic",
            applied_date: new Date().toISOString(),
          });
          this.logCalculation({
            concept: item.name,
            system_logic_type: "pension_contribution",
            result: item.amount,
            detail: item.detail,
            status: "success",
          });
        }
      });
    }

    const totalDeductions = safe(deductions.reduce((sum, c) => sum + c.calculated_amount, 0));
    const totalContributions = safe(contributions.reduce((sum, c) => sum + c.calculated_amount, 0));
    const netPay = safe(totalIncome - totalDeductions);

    return {
      employee: this.employee,
      period: `${this.month}/${this.year}`,
      payrollType: this.payrollType,
      context: context,
      incomes: incomes,
      deductions: deductions,
      contributions: contributions,
      totals: {
        totalIncome,
        totalDeductions,
        totalContributions,
        netPay
      },
      calculationLog: this.calculationLog,
      errors: this.errors,
      summary: this.generateSummary(incomes, deductions, contributions, totalIncome, totalDeductions, netPay)
    };
  }

  /**
   * Construye el contexto de variables para cálculos
   */
  buildContext(attendanceData, rmvAmount, extraContext = {}) {
    // base_salary SIEMPRE es el salario del contrato (sin modificar)
    // Para fórmulas dinámicas en quincenal, el contexto expone quincenal_amount = base_salary * pct
    const rawSalary = this.employee.base_salary || 0;
    const baseSalary = rawSalary; // Siempre el salario completo del contrato

    const workedDays = attendanceData?.worked_days || 
      (this.payrollType === "Quincenal" ? 15 : 30);

    const regularHours = attendanceData?.regular_hours || 0;
    const overtimeHours = attendanceData?.overtime_hours || 0;

    // quincenal_amount: monto del adelanto = base_salary * porcentaje quincenal
    // Disponible como variable en fórmulas dinámicas
    const quincenalAmount = this.payrollType === "Quincenal"
      ? rawSalary * (this.quincenalPct ?? 0.40)
      : rawSalary;

    return {
      base_salary: baseSalary,            // Siempre el salario del contrato
      quincenal_amount: quincenalAmount,  // base_salary * % quincenal (útil en fórmulas)
      worked_days: workedDays,
      regular_hours: regularHours,
      overtime_hours: overtimeHours,
      rmv: rmvAmount || 1130,
      horas_extras_25: attendanceData?.horas_extras_25 || 0,
      horas_extras_35: attendanceData?.horas_extras_35 || 0,
      horas_nocturnas: attendanceData?.horas_nocturnas || 0,
      total_income: 0,
      total_deductions: 0,
      transport_cost: this.employee.transport_cost || 0,
      food_cost: this.employee.food_cost || 0,
      activity_cost: this.employee.activity_cost || 0,
      // Datos adicionales para lógica del sistema
      derechohabientes: extraContext.derechohabientes || [],
      late_records: extraContext.late_records || [],
      absent_records: extraContext.absent_records || [],
      loan_installments: extraContext.loan_installments || [],
      afp: extraContext.afp || null,
    };
  }

  /**
   * Calcula un concepto individual
   */
  calculateConcept(concept, context) {
    let calculatedAmount = 0;
    let method = 'fixed';

    if (concept.system_logic_type) {
      // Lógica del sistema: el sistema calcula según la lógica implementada
      calculatedAmount = this.applySystemLogic(concept, context);
      method = 'system_logic';
    } else if (concept.is_dynamic && concept.calculation_formula) {
      // Verificar si la fórmula es en realidad una referencia a una lógica del sistema
      // (ej: calculation_formula = "tardiness_discount" sin system_logic_type configurado)
      const formulaTrimmed = String(concept.calculation_formula).trim().toLowerCase();
      if (SYSTEM_LOGIC_TYPES[formulaTrimmed]) {
        calculatedAmount = this.applySystemLogic({ ...concept, system_logic_type: formulaTrimmed }, context);
        method = 'system_logic';
      } else {
        // Cálculo dinámico usando fórmula matemática
        calculatedAmount = this.evaluateFormula(concept.calculation_formula, context);
        method = 'dynamic';
      }
    } else {
      // Monto fijo
      calculatedAmount = parseFloat(concept.amount) || 0;
      method = 'fixed';
    }

    // Sanitizar resultado: evitar Infinity, NaN y valores absurdos
    const safeAmount = (typeof calculatedAmount === 'number' && Number.isFinite(calculatedAmount) && Math.abs(calculatedAmount) <= 500_000)
      ? calculatedAmount
      : 0;

    return {
      ...concept,
      calculated_amount: Math.round(safeAmount * 100) / 100,
      calculation_method: method,
      applied_date: new Date().toISOString()
    };
  }

  /**
   * Determina si un concepto debe aplicarse según periodicidad y fechas
   */
  shouldApplyConcept(concept) {
    // REGLA ESPECIAL: En planillas quincenales NO aplicar descuentos
    if (this.payrollType === "Quincenal" && concept.concept_type === "Descuento") {
      return false;
    }

    // REGLA: Verificar applies_to_payroll_types si está configurado en el concepto
    if (concept.applies_to_payroll_types && concept.applies_to_payroll_types.length > 0) {
      if (!concept.applies_to_payroll_types.includes(this.payrollType)) {
        return false; // El concepto NO aplica a este tipo de planilla
      }
    }

    // Verificar si es recurrente o específico del mes/año
    if (concept.is_recurring) {
      return true; // Los conceptos recurrentes siempre se aplican (ya pasaron el filtro de tipo arriba)
    }

    // Verificar si el concepto es para este mes/año específico
    if (concept.month && concept.year) {
      return concept.month === this.month && concept.year === this.year;
    }

    // Verificar fechas de inicio/fin si existen
    if (concept.start_date && concept.end_date) {
      const currentDate = new Date(this.year, this.month - 1, 1);
      const startDate = new Date(concept.start_date);
      const endDate = new Date(concept.end_date);
      
      return currentDate >= startDate && currentDate <= endDate;
    }

    return true; // Por defecto, aplicar el concepto
  }

  /**
   * Registra un cálculo para auditoría
   */
  logCalculation(log) {
    this.calculationLog.push({
      timestamp: new Date().toISOString(),
      ...log
    });
  }

  /**
   * Genera un resumen legible de los cálculos
   */
  generateSummary(incomes, deductions, contributions, totalIncome, totalDeductions, netPay) {
    const mapItem = (c) => ({
      name: c.concept_name,
      concept_code: c.concept_code || "",
      concept_id: c.id || null,
      amount: c.calculated_amount,
      method: c.calculation_method,
      formula: c.is_dynamic && !c.system_logic_type ? c.calculation_formula : null,
      system_logic_type: c.system_logic_type || null,
    });

    return {
      employee: {
        code: this.employee.employee_code,
        name: `${this.employee.first_name} ${this.employee.last_name}`,
        position: this.employee.position,
        department: this.employee.department_name
      },
      period: {
        month: this.month,
        year: this.year,
        type: this.payrollType
      },
      breakdown: {
        incomes: {
          count: incomes.length,
          items: incomes.map(mapItem),
          total: totalIncome
        },
        deductions: {
          count: deductions.length,
          items: deductions.map(c => ({
            ...mapItem(c),
            is_worker_contribution: c.concept_category === "AFP/ONP" || c.concept_category === "Impuestos" || c.is_worker_contribution
          })),
          total: totalDeductions
        },
        contributions: {
          count: contributions.length,
          items: contributions.map(mapItem),
          total: contributions.reduce((sum, c) => sum + c.calculated_amount, 0)
        }
      },
      result: {
        totalIncome: totalIncome,
        totalDeductions: totalDeductions,
        netPay: netPay
      },
      validation: {
        hasErrors: this.errors.length > 0,
        errorCount: this.errors.length,
        errors: this.errors
      }
    };
  }

  /**
   * Exporta el resumen en formato JSON
   */
  exportSummary() {
    return JSON.stringify(this.generateSummary(), null, 2);
  }
}

/**
 * Hook para usar el calculador de planilla
 */
export function usePayrollCalculator() {
  const calculateEmployeePayroll = async (employee, month, year, payrollType, concepts, attendanceData, rmvAmount, quincenalPct = 0.40, extraContext = {}) => {
    const calculator = new PayrollCalculator(employee, month, year, payrollType, quincenalPct);
    return await calculator.calculatePayroll(concepts, attendanceData, rmvAmount, extraContext);
  };

  return { calculateEmployeePayroll };
}
