/**
 * Módulo de cálculo automático de conceptos de planilla
 * Evalúa fórmulas dinámicas y aplica conceptos según periodicidad
 */

export class PayrollCalculator {
  constructor(employee, month, year, payrollType = "Mensual") {
    this.employee = employee;
    this.month = month;
    this.year = year;
    this.payrollType = payrollType;
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
        worked_days: context.worked_days || 30,
        regular_hours: context.regular_hours || 0,
        overtime_hours: context.overtime_hours || 0,
        rmv: context.rmv || 1025, // RMV actual
        horas_extras_25: context.horas_extras_25 || 0,
        horas_extras_35: context.horas_extras_35 || 0,
        horas_nocturnas: context.horas_nocturnas || 0,
        total_income: context.total_income || 0,
        total_deductions: context.total_deductions || 0,
      };

      // Reemplazar variables en la fórmula
      let evaluatedFormula = formula;
      Object.keys(variables).forEach(key => {
        const regex = new RegExp(key, 'g');
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
    // Permitir solo operaciones matemáticas básicas
    const allowedChars = /^[0-9+\-*/.() ]+$/;
    
    if (!allowedChars.test(expression)) {
      throw new Error('Fórmula contiene caracteres no permitidos');
    }

    try {
      // Usar Function para evaluar de forma segura
      return Function('"use strict"; return (' + expression + ')')();
    } catch (error) {
      throw new Error('Error al evaluar la fórmula: ' + error.message);
    }
  }

  /**
   * Calcula todos los conceptos de planilla para el empleado
   */
  async calculatePayroll(concepts, attendanceData, rmvAmount) {
    const context = this.buildContext(attendanceData, rmvAmount);
    
    // Separar conceptos por tipo
    const incomes = [];
    const deductions = [];
    const contributions = [];

    for (const concept of concepts) {
      // Verificar si el concepto aplica según su periodicidad y fechas
      if (!this.shouldApplyConcept(concept)) {
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

    // Calcular totales
    const totalIncome = incomes.reduce((sum, c) => sum + c.calculated_amount, 0);
    const totalDeductions = deductions.reduce((sum, c) => sum + c.calculated_amount, 0);
    const totalContributions = contributions.reduce((sum, c) => sum + c.calculated_amount, 0);
    const netPay = totalIncome - totalDeductions;

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
  buildContext(attendanceData, rmvAmount) {
    const baseSalary = this.payrollType === "Quincenal" 
      ? (this.employee.base_salary || 0) / 2 
      : (this.employee.base_salary || 0);

    const workedDays = attendanceData?.worked_days || 
      (this.payrollType === "Quincenal" ? 15 : 30);

    const regularHours = attendanceData?.regular_hours || 0;
    const overtimeHours = attendanceData?.overtime_hours || 0;

    return {
      base_salary: baseSalary,
      worked_days: workedDays,
      regular_hours: regularHours,
      overtime_hours: overtimeHours,
      rmv: rmvAmount || 1025,
      horas_extras_25: attendanceData?.horas_extras_25 || 0,
      horas_extras_35: attendanceData?.horas_extras_35 || 0,
      horas_nocturnas: attendanceData?.horas_nocturnas || 0,
      total_income: 0, // Se actualizará después
      total_deductions: 0, // Se actualizará después
    };
  }

  /**
   * Calcula un concepto individual
   */
  calculateConcept(concept, context) {
    let calculatedAmount = 0;

    if (concept.is_dynamic && concept.calculation_formula) {
      // Cálculo dinámico usando fórmula
      calculatedAmount = this.evaluateFormula(concept.calculation_formula, context);
    } else {
      // Monto fijo
      calculatedAmount = parseFloat(concept.amount) || 0;
    }

    return {
      ...concept,
      calculated_amount: Math.round(calculatedAmount * 100) / 100, // Redondear a 2 decimales
      calculation_method: concept.is_dynamic ? 'dynamic' : 'fixed',
      applied_date: new Date().toISOString()
    };
  }

  /**
   * Determina si un concepto debe aplicarse según periodicidad y fechas
   */
  shouldApplyConcept(concept) {
    // Verificar si es recurrente o específico del mes/año
    if (concept.is_recurring) {
      return true; // Los conceptos recurrentes siempre se aplican
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
          items: incomes.map(c => ({
            name: c.concept_name,
            amount: c.calculated_amount,
            method: c.calculation_method,
            formula: c.is_dynamic ? c.calculation_formula : null
          })),
          total: totalIncome
        },
        deductions: {
          count: deductions.length,
          items: deductions.map(c => ({
            name: c.concept_name,
            amount: c.calculated_amount,
            method: c.calculation_method,
            formula: c.is_dynamic ? c.calculation_formula : null
          })),
          total: totalDeductions
        },
        contributions: {
          count: contributions.length,
          items: contributions.map(c => ({
            name: c.concept_name,
            amount: c.calculated_amount,
            method: c.calculation_method,
            formula: c.is_dynamic ? c.calculation_formula : null
          })),
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
  const calculateEmployeePayroll = async (employee, month, year, payrollType, concepts, attendanceData, rmvAmount) => {
    const calculator = new PayrollCalculator(employee, month, year, payrollType);
    return await calculator.calculatePayroll(concepts, attendanceData, rmvAmount);
  };

  return { calculateEmployeePayroll };
}