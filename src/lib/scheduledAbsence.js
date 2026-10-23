import { ABSENCE_KIND, findAbsenceFindings } from "@/lib/attendanceReconciliation";

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
 * descuento aunque el trabajador estuviera programado y no haya asistido.
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
      return scheduleDay?.exempt_from_clocking ? null : scheduleDay;
    },
    isHoliday,
    isVacation,
  });

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
      (row.kind === ABSENCE_KIND.CONFIRMED || !row.hasMarkings);

    addDay(row.employeeId, discountable ? "absenceDays" : "reviewDays", row);
  }

  return result;
};