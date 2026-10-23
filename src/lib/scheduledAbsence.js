import { ABSENCE_KIND, findAbsenceFindings } from "./attendanceReconciliation.js";

/**
 * Estados de asistencia que no generan descuento por falta: la jornada ya está
 * cubierta por una justificación aprobada, vacaciones, compensación o permiso
 * sin goce de haber (este último se descuenta de los días trabajados).
 */
const NO_DISCOUNT_STATUSES = ["Justificado", "Vacaciones", "Compensación", "Permiso sin goce"];

/**
 * Jornadas del período de planilla que deben descontarse como inasistencia.
 *
 * Una jornada se descuenta como falta cuando es laborable según el horario
 * vigente del trabajador y NO tiene ninguna marcación, sin justificación
 * aprobada, vacación, feriado ni permiso sin goce. Incluye las jornadas en las
 * que ni siquiera se generó el registro de asistencia: antes no generaban
 * descuento aunque el trabajador estuviera programado y no haya asistido. Una
 * jornada sin registro solo se descuenta si el trabajador tiene asistencia
 * registrada en el período.
 *
 * No se descuentan como falta completa las jornadas con marcación incompleta
 * (una entrada sin salida) ni los registros que declaran una falta con
 * marcaciones: quedan para regularización (reviewDays).
 *
 * Devuelve Map<employeeId, { absenceDays, reviewDays }>, cada día como
 * { date, reason }, para que la planilla muestre y verifique el detalle.
 */
export const buildPayrollAbsenceDays = ({
  employees = [],
  records = [],
  getScheduleDay,
  approvedIncidentsByKey = new Map(),
  periodStart,
  periodEnd,
  isHoliday = () => false,
  isVacation = () => false,
}) => {
  const findings = findAbsenceFindings({
    employees,
    records,
    periodStart,
    periodEnd,
    approvedIncidentsByKey,
    employeeNameById: new Map(),
    // Un trabajador exonerado de marcación física no genera faltas por no marcar.
    getScheduleDay: (employeeId, dateStr) => {
      const scheduleDay = getScheduleDay ? getScheduleDay(employeeId, dateStr) : null;
      return scheduleDay?.exempt_from_clocking ? {} : scheduleDay;
    },
    isHoliday,
    isVacation,
  });

  // Trabajadores con asistencia registrada en el período: solo para ellos se puede
  // atribuir una falta a una jornada sin registro. Si el trabajador no tiene ningún
  // registro en el período, la ausencia de registros puede deberse a que las
  // marcaciones no se generaron, así que no se descuenta de forma automática.
  const trackedEmployees = new Set(
    records
      .filter((record) => {
        const day = String(record.date || "").slice(0, 10);
        return day && day >= periodStart && day <= periodEnd;
      })
      .map((record) => record.employee_id)
  );

  const result = new Map();
  const addDay = (employeeId, bucket, row) => {
    if (!result.has(employeeId)) result.set(employeeId, { absenceDays: [], reviewDays: [] });
    result.get(employeeId)[bucket].push({ date: row.date, reason: row.reason });
  };

  for (const row of findings) {
    const isAbsenceKind = row.kind === ABSENCE_KIND.CONFIRMED || row.kind === ABSENCE_KIND.REVIEW;
    if (!isAbsenceKind) continue;

    const discountable =
      !NO_DISCOUNT_STATUSES.includes(row.recordStatus) &&
      row.kind === ABSENCE_KIND.CONFIRMED &&
      (row.hasRecord || trackedEmployees.has(row.employeeId));

    addDay(row.employeeId, discountable ? "absenceDays" : "reviewDays", row);
  }

  return result;
};