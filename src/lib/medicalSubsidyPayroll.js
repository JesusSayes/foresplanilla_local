// Puente entre la planilla y el motor de descanso médico (src/lib/medicalSubsidy.js).
//
// Concentra aquí lo que la página de planilla necesita por trabajador: la instantánea
// de días 20/21, el concepto de ingreso 0916, los días de remuneración y de asistencia
// ajustados, y los mensajes de validación. Así la página solo aplica resultados.

import {
  buildMedicalSubsidySnapshot,
  buildSubsidyConcept,
} from "@/lib/medicalSubsidy";

const EMPTY = (contractualWorkedDays, workedDays) => ({
  snapshot: null,
  subsidizedDays: 0,
  employerDays: 0,
  subsidyConcept: null,
  remunerationDays: contractualWorkedDays,
  attendedDays: workedDays,
  messages: [],
});

/**
 * @param {Object} params
 * @param {string} params.employeeId
 * @param {Array} params.medicalRestIncidents - Descansos médicos aprobados del año.
 * @param {Array} params.approvedIncidents - Justificaciones aprobadas (para conflictos).
 * @param {Array<string>} params.conflictDates - Fechas con vacaciones, faltas o sin goce.
 * @param {string} params.periodStart / params.periodEnd - Período de cómputo.
 * @param {Array} params.payslips - Boletas del trabajador (historial de base y continuidad).
 * @param {string} params.payrollType
 * @param {number} params.contractualWorkedDays - Días contractuales del mes.
 * @param {number} params.workedDays - Días trabajados ya descontadas faltas y sin goce.
 */
export const computeEmployeeMedicalSubsidy = ({
  employeeId,
  medicalRestIncidents = [],
  approvedIncidents = [],
  conflictDates = [],
  periodStart,
  periodEnd,
  payslips = [],
  payrollType,
  contractualWorkedDays = 0,
  workedDays = 0,
}) => {
  // La planilla quincenal es un adelanto: no liquida subsidios.
  if (payrollType === "Quincenal") return EMPTY(contractualWorkedDays, workedDays);

  const periodYear = Number(String(periodStart || "").slice(0, 4));
  const periodMonth = Number(String(periodStart || "").slice(5, 7));
  const employeePayslips = (payslips || []).filter(
    (p) =>
      p?.employee_id === employeeId &&
      p.payroll_type !== "Quincenal" &&
      !(Number(p.year) === periodYear && Number(p.month) === periodMonth)
  );

  // Días ya subsidiados en OTRA planilla del mismo mes (adicional): no se pagan dos veces.
  const alreadySubsidizedDates = (payslips || [])
    .filter(
      (p) =>
        p?.employee_id === employeeId &&
        Number(p.year) === periodYear &&
        Number(p.month) === periodMonth &&
        p.payroll_type !== payrollType &&
        p.payroll_type !== "Quincenal"
    )
    .flatMap((p) =>
      (p.calculation_summary?.medical_subsidy?.days || [])
        .filter((d) => d.segment === "subsidiado")
        .map((d) => d.date)
    );

  const snapshot = buildMedicalSubsidySnapshot({
    incidents: (medicalRestIncidents || []).filter((i) => i.employee_id === employeeId),
    otherIncidents: (approvedIncidents || []).filter((i) => i.employee_id === employeeId),
    conflictDates,
    alreadySubsidizedDates,
    periodStart,
    periodEnd,
    payslips: employeePayslips,
  });
  if (!snapshot) return EMPTY(contractualWorkedDays, workedDays);

  const subsidizedDays = Math.max(0, snapshot.subsidized_days || 0);
  const employerDays = Math.max(0, snapshot.employer_days || 0);
  // Solo se descuentan de la remuneración los días subsidiados cuyo importe se pudo
  // calcular: con la base pendiente de validación no se reduce la remuneración ni se
  // agrega un subsidio de cero (el trabajador no pierde el día mientras se regulariza).
  const payableSubsidizedDays = Number(snapshot.subsidy_amount) > 0 ? subsidizedDays : 0;

  return {
    snapshot,
    subsidizedDays,
    employerDays,
    subsidyConcept: buildSubsidyConcept({ employeeId, snapshot }),
    // Días que se remuneran por la básica: los días subsidiados los reemplaza el subsidio.
    remunerationDays: Math.max(0, contractualWorkedDays - payableSubsidizedDays),
    // Días efectivamente laborados: ni los del empleador (código 20) ni los subsidiados
    // (código 21) son días trabajados.
    attendedDays: Math.max(0, workedDays - subsidizedDays - employerDays),
    messages: snapshot.validation?.messages || [],
  };
};