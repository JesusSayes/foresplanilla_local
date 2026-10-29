// Regla de contratos: sueldo base del empleado (Financiero) menor que la RMV activa.

export const BELOW_RMV_RULE_TYPE = "below_rmv";

export function ruleTypeOf(rule) {
  return rule?.rule_type || "expiration";
}

export function isBelowRmvRule(rule) {
  return ruleTypeOf(rule) === BELOW_RMV_RULE_TYPE;
}

// RMV vigente: la activa con la fecha de vigencia más reciente.
export function getActiveRmv(rmvs) {
  const active = (rmvs || []).filter(r => r.is_active && Number(r.amount) > 0);
  if (active.length === 0) return null;
  return [...active].sort((a, b) =>
    String(b.effective_date || "").localeCompare(String(a.effective_date || ""))
  )[0];
}

/**
 * Contratos vigentes cuyo sueldo base en la ficha del empleado es menor a la RMV activa.
 * Se toma un solo contrato por trabajador (el de inicio más reciente).
 */
export function findContractsBelowRmv({ contracts, employees, activeRmv, rule }) {
  if (!activeRmv || rule?.is_active === false) return [];
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Lima", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  if (!activeRmv.effective_date || String(activeRmv.effective_date).slice(0, 10) > today) return [];

  const rmvAmount = Number(activeRmv.amount);
  const employeeById = new Map((employees || []).map(e => [e.id, e]));
  const types = rule?.contract_types || [];
  const seenEmployees = new Set();
  const matches = [];

  const vigentes = (contracts || [])
    .filter(c => c.status === "Vigente" && c.employee_id)
    .filter(c => ["Indeterminado", "Plazo Fijo"].includes(c.contract_type))
    .filter(c => c.start_date && String(c.start_date).slice(0, 10) <= today)
    .filter(c => types.length === 0 || types.includes(c.contract_type))
    .sort((a, b) => String(b.start_date || "").localeCompare(String(a.start_date || "")));

  vigentes.forEach(contract => {
    const employee = employeeById.get(contract.employee_id);
    if (!employee || seenEmployees.has(employee.id)) return;
    seenEmployees.add(employee.id);
    if (employee.status === "Cesado" || (employee.termination_date && String(employee.termination_date).slice(0, 10) <= today)) return;
    if (Number(contract.salary) >= rmvAmount) return;

    // Sin sueldo base registrado en la ficha financiera no se puede evaluar la regla.
    if (employee.base_salary === null || employee.base_salary === undefined || employee.base_salary === "") return;

    const baseSalary = Number(employee.base_salary);
    if (!Number.isFinite(baseSalary) || baseSalary >= rmvAmount) return;

    matches.push({ contract, employee, baseSalary, rmvAmount });
  });

  return matches;
}