/**
 * Utilidades centralizadas para manejo seguro de montos en planillas.
 * Evita Infinity, NaN, notación científica y valores absurdamente grandes.
 */

/** Monto máximo razonable por boleta (100 UIT ≈ S/ 515,000). */
const MAX_AMOUNT = 500_000;

/**
 * Convierte cualquier valor a un número seguro para planilla.
 * Devuelve 0 si el valor es NaN, Infinity, -Infinity o mayor al límite.
 * @param {*} value
 * @returns {number}
 */
export function safePayrollNumber(value) {
  if (value === null || value === undefined || value === "") return 0;
  const n = typeof value === "number" ? value : parseFloat(value);
  if (!Number.isFinite(n)) return 0;
  if (Math.abs(n) > MAX_AMOUNT) return 0;
  return n;
}

/**
 * Formatea un monto como moneda peruana con 2 decimales.
 * Nunca retorna Infinity, NaN ni notación científica.
 * @param {*} value
 * @param {string} [prefix="S/ "]
 * @returns {string}
 */
export function formatMoney(value, prefix = "S/ ") {
  return `${prefix}${safePayrollNumber(value).toFixed(2)}`;
}

/**
 * Redondea a 2 decimales de forma segura.
 * @param {*} value
 * @returns {number}
 */
export function roundMoney(value) {
  return Math.round(safePayrollNumber(value) * 100) / 100;
}

/**
 * Sanitiza un objeto de boleta (payslip) antes de guardarlo.
 * Reemplaza todos los campos monetarios no finitos por 0.
 * Lanza advertencia (no error) si algún campo fue corregido.
 * @param {object} payslip
 * @returns {{ sanitized: object, warnings: string[] }}
 */
export function sanitizePayslip(payslip) {
  const MONEY_FIELDS = [
    "base_salary", "family_allowance", "overtime_pay", "bonuses",
    "commissions", "other_income", "total_income",
    "pension_deduction", "health_insurance", "income_tax",
    "tardiness_discount", "absence_discount", "loan_deduction",
    "advance_deduction", "other_deductions", "total_deductions",
    "net_pay",
  ];

  const sanitized = { ...payslip };
  const warnings = [];

  for (const field of MONEY_FIELDS) {
    if (field in sanitized) {
      const original = sanitized[field];
      const safe = roundMoney(original);
      if (safe !== original && original !== undefined && original !== null) {
        warnings.push(`Campo "${field}" tenía valor inválido (${original}), reemplazado por ${safe}`);
      }
      sanitized[field] = safe;
    }
  }

  return { sanitized, warnings };
}