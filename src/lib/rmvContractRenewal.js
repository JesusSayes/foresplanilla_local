import { base44 } from "@/api/base44Client";

// Todas las fechas se manejan como texto 'YYYY-MM-DD' y la aritmética se hace en UTC,
// para que ningún día se desplace por zona horaria.

const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})/;

function parseIso(value) {
  const match = ISO_RE.exec(value || "");
  if (!match) return null;
  return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
}

function toIso(date) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function todayIso() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

function addMonthsIso(isoDate, months) {
  const date = parseIso(isoDate);
  const day = date.getUTCDate();
  const target = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(day, lastDay));
  return toIso(target);
}

function nextDayIso(isoDate) {
  const date = parseIso(isoDate);
  date.setUTCDate(date.getUTCDate() + 1);
  return toIso(date);
}

// Ejecuta la aprobación: sueldo del empleado a la RMV activa + renovación del contrato.
export async function renewContractWithRmv({ contract, employee, activeRmv, months = 12, userEmail }) {
  const rmvAmount = Number(activeRmv?.amount);
  if (!Number.isFinite(rmvAmount) || rmvAmount <= 0) {
    throw new Error("No hay una RMV activa válida");
  }

  const today = todayIso();
  // Igual que el flujo de renovación existente: el nuevo contrato inicia el día
  // siguiente al vencimiento del anterior (o hoy si el contrato no tiene fin).
  const startDate = nextDayIso(contract.end_date || today);
  const newEndDate = addMonthsIso(startDate, months || 12);
  const stamp = today.replace(/-/g, "");

  const newContract = await base44.entities.Contract.create({
    employee_id: contract.employee_id,
    contract_number: `${contract.contract_number || employee?.employee_code || "CTR"}-REN-${stamp}`,
    contract_type: contract.contract_type,
    start_date: startDate,
    end_date: newEndDate,
    position: contract.position,
    department: contract.department,
    work_location: contract.work_location,
    salary: rmvAmount,
    activity_cost: contract.activity_cost ?? 0,
    food_cost: contract.food_cost ?? 0,
    transport_cost: contract.transport_cost ?? 0,
    work_schedule: contract.work_schedule,
    weekly_hours: contract.weekly_hours,
    functions: contract.functions,
    benefits: contract.benefits,
    trial_period_days: 0,
    renewable: contract.renewable,
    status: "Vigente",
    signed_date: today,
    notes: `[RENOVACIÓN POR RMV] Renovación del contrato ${contract.contract_number || contract.id}. Sueldo base actualizado a la RMV vigente (S/ ${rmvAmount.toFixed(2)})${userEmail ? ` · Aprobado por: ${userEmail}` : ""}.`,
  });

  await base44.entities.Contract.update(contract.id, { status: "Renovado" });
  await base44.entities.Employee.update(employee.id, { base_salary: rmvAmount });

  return { newContract, rmvAmount };
}