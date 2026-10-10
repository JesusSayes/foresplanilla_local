// Helpers para exportación de planillas a Excel.
// Extraídos de PayrollManagement para reducir el tamaño del archivo.
import { safePayrollNumber as safeNum, roundMoney } from "@/lib/payrollUtils";
import { _normStr } from "@/lib/payrollIncomeHelpers";

// Extrae un costo desde el breakdown de ingresos de la boleta.
export const getCostFromSummary = (payslip, varName, nameKeywords) => {
  const items = payslip?.calculation_summary?.breakdown?.incomes?.items;
  if (!Array.isArray(items)) return null;
  let match = items.find(it => {
    const f = _normStr(it.formula);
    return f && f.includes(varName);
  });
  if (match) return safeNum(match.amount);
  match = items.find(it => {
    const n = _normStr(it.name);
    return nameKeywords.some(kw => n.includes(kw));
  });
  return match ? safeNum(match.amount) : null;
};

// Deduplica conceptos de costo en el breakdown de ingresos.
export const dedupeIncomesByCost = (payslip) => {
  const items = payslip?.calculation_summary?.breakdown?.incomes?.items;
  if (!Array.isArray(items)) return null;
  const costVars = ["activity_cost", "food_cost", "transport_cost"];
  const groups = {};
  items.forEach(it => {
    const f = _normStr(it.calculation_formula || it.formula || "");
    const cv = costVars.find(v => f.includes(v));
    if (!cv) return;
    if (!groups[cv]) groups[cv] = [];
    groups[cv].push(it);
  });
  const keepSet = new Set();
  Object.values(groups).forEach(arr => {
    const preferred = arr.find(it => /worked_days/i.test(it.calculation_formula || it.formula || "")) || arr[0];
    keepSet.add(preferred);
  });
  return items.filter(it => {
    const f = _normStr(it.calculation_formula || it.formula || "");
    const cv = costVars.find(v => f.includes(v));
    if (!cv) return true;
    return keepSet.has(it);
  });
};

export const computeDedupedTotalIncome = (payslip) => {
  const deduped = dedupeIncomesByCost(payslip);
  if (!deduped) return null;
  return deduped.reduce((sum, it) => sum + safeNum(it.amount), 0);
};

// Extrae el desglose de AFP/ONP desde el breakdown de descuentos.
export const getAfpBreakdown = (payslip) => {
  const items = payslip?.calculation_summary?.breakdown?.deductions?.items;
  if (!Array.isArray(items)) return null;
  const pensionItems = items.filter(it =>
    it.concept_category === "AFP/ONP" || it.system_logic_type === "pension_contribution"
  );
  if (pensionItems.length === 0) return null;
  const find = (re) => {
    const m = pensionItems.find(it => re.test(it.name || ""));
    return m ? safeNum(m.amount) : 0;
  };
  return {
    aporte: find(/aporte obligatorio/i),
    prima: find(/prima de seguro|prima seguro/i),
    comision: find(/comisi[oó]n/i),
    onp: find(/^onp\b|snp/i),
  };
};

// Extrae el desglose del pago de horas extras al 25% y 35%.
export const getOvertimePaySplit = (payslip) => {
  const items = payslip?.calculation_summary?.breakdown?.incomes?.items;
  if (!Array.isArray(items)) return null;
  const heItems = items.filter(it =>
    _normStr(it.concept_category) === "horas extras" ||
    /horas?\s*extras?\s*(al\s*)?25/i.test(it.name || "") ||
    /horas?\s*extras?\s*(al\s*)?35/i.test(it.name || "")
  );
  if (heItems.length === 0) return null;
  let pay25 = 0, pay35 = 0;
  heItems.forEach(it => {
    const name = _normStr(it.name || "");
    if (/25/.test(name)) pay25 += safeNum(it.amount);
    else if (/35/.test(name)) pay35 += safeNum(it.amount);
  });
  return { pay25: roundMoney(pay25), pay35: roundMoney(pay35) };
};