import { calcEffectiveMetrics, getSegmentClockTimes } from "@/lib/attendanceMetrics";

// ─────────────────────────────────────────────────────────────────────────────
// Reconciliación de asistencia: tardanzas y inasistencias.
//
// Reglas centralizadas para que asistencia, filtros, planilla y boleta usen el
// MISMO resultado. Ninguna función de este módulo escribe en la base de datos:
// devuelven el detalle calculado para que la vista previa lo muestre y el
// usuario confirme la regularización.
// ─────────────────────────────────────────────────────────────────────────────

/** Tolerancia de tardanza por defecto cuando el horario no la define. */
export const DEFAULT_LATE_TOLERANCE_MINUTES = 10;

/** Aplica la tolerancia del horario: dentro de la tolerancia no hay minutos descontables. */
export const applyLateTolerance = (rawLateMinutes, toleranceMinutes = DEFAULT_LATE_TOLERANCE_MINUTES) => {
  const raw = Math.max(0, Number(rawLateMinutes) || 0);
  const tol = Math.max(0, Number(toleranceMinutes) ?? DEFAULT_LATE_TOLERANCE_MINUTES);
  return raw > tol ? raw : 0;
};

const hasAnyClockIn = (record) =>
  ["clock_in", "clock_in_2", "clock_in_3", "clock_in_4"].some((k) => !!record?.[k]);

/**
 * Minutos de tardanza que respaldan las marcaciones reales del registro,
 * usando el horario aplicable (tolerancia incluida) y las incidencias aprobadas.
 * Devuelve { markedMinutes, toleranceMinutes, needsReview, reason }.
 * markedMinutes = null cuando faltan datos para determinarla (revisión manual).
 */
export const computeMarkedLateMinutes = ({ record, scheduleDay, approvedIncidents = [] }) => {
  if (!record) return { markedMinutes: 0, toleranceMinutes: DEFAULT_LATE_TOLERANCE_MINUTES, needsReview: true, reason: "Sin registro de asistencia" };

  const toleranceMinutes = scheduleDay?.tolerance_minutes ?? DEFAULT_LATE_TOLERANCE_MINUTES;
  const schedStart = scheduleDay?.start || record.scheduled_start || null;
  const schedEnd = scheduleDay?.end || record.scheduled_end || schedStart;
  const isUnscheduledDay = !scheduleDay?.start || !scheduleDay?.end;
  const breakMinutes = scheduleDay?.breakMinutes ?? 0;
  const breakStart = scheduleDay?.breakStart ?? null;

  if (!hasAnyClockIn(record)) {
    // Sin marcación de entrada: no hay tardanza calculable. Si además el registro
    // no está marcado como ausencia, el caso queda para revisión.
    const needsReview = !record.is_absent && record.status !== "Ausente" && record.status !== "Justificado";
    return {
      markedMinutes: 0,
      toleranceMinutes,
      needsReview,
      reason: needsReview ? "Sin marcación de entrada ni ausencia declarada" : "Sin marcación de entrada",
    };
  }

  if (!schedStart) {
    return {
      markedMinutes: null,
      toleranceMinutes,
      needsReview: true,
      reason: "Sin horario aplicable para la jornada",
    };
  }

  const metrics = calcEffectiveMetrics({
    record,
    approvedIncidents,
    schedStart,
    schedEnd: schedEnd || schedStart,
    breakMinutes,
    breakStart,
    isUnscheduledDay,
  });

  return {
    markedMinutes: applyLateTolerance(metrics.remainingLateMinutes, toleranceMinutes),
    toleranceMinutes,
    needsReview: false,
    reason: "",
  };
};

/**
 * Estado de tardanza de un registro, comparando lo almacenado (resultado del motor,
 * que además ya refleja las compensaciones aprobadas) con lo que respaldan las
 * marcaciones y las compensaciones aprobadas del día.
 *
 * - effectiveMinutes: minutos descontables hoy (mismo resultado que muestra asistencia).
 * - isInconsistent: lo almacenado no coincide con el cálculo → requiere regularización.
 */
export const recomputeLateState = ({
  record,
  scheduleDay,
  approvedIncidents = [],
  approvedCompensationMinutes = 0,
  recordActiveCompensationMinutes = 0,
}) => {
  if (!record) return null;

  const { markedMinutes, toleranceMinutes, needsReview, reason } = computeMarkedLateMinutes({
    record,
    scheduleDay,
    approvedIncidents,
  });

  const storedMinutes = Math.max(0, Number(record.late_minutes) || 0);
  const storedIsLate = !!record.is_late;

  if (markedMinutes === null || needsReview) {
    return {
      storedMinutes,
      storedIsLate,
      markedMinutes,
      toleranceMinutes,
      effectiveMinutes: storedMinutes,
      appliedCompensationMinutes: approvedCompensationMinutes,
      isInconsistent: false,
      needsReview: true,
      reason,
    };
  }

  const applied = Math.max(0, approvedCompensationMinutes) + Math.max(0, recordActiveCompensationMinutes);
  const appliedNotReflected = applied > 0 && storedMinutes >= markedMinutes;
  const effectiveMinutes = appliedNotReflected
    ? Math.max(0, markedMinutes - applied)
    : Math.min(storedMinutes, markedMinutes);

  const expectedIsLate = effectiveMinutes > 0;

  return {
    storedMinutes,
    storedIsLate,
    markedMinutes,
    toleranceMinutes,
    effectiveMinutes,
    appliedCompensationMinutes: applied,
    appliedNotReflected,
    isInconsistent: storedMinutes !== effectiveMinutes || storedIsLate !== expectedIsLate,
    needsReview: false,
    reason: "",
  };
};

/**
 * Minutos de tardanza descontables en planilla. Usa exactamente el mismo cálculo
 * que asistencia: respaldo de marcaciones con tolerancia del horario, y la
 * compensación aprobada descontada UNA sola vez.
 */
export const resolveDiscountLateMinutes = ({
  storedMinutes,
  storedIsLate,
  markedMinutes,
  appliedCompensationMinutes = 0,
}) => {
  const stored = Math.max(0, Number(storedMinutes) || 0);
  const applied = Math.max(0, Number(appliedCompensationMinutes) || 0);

  if (markedMinutes === null || markedMinutes === undefined) {
    return Math.max(0, stored);
  }

  const marked = Math.max(0, Number(markedMinutes) || 0);
  if (!storedIsLate && stored <= 0 && marked <= 0) return 0;

  // Si lo almacenado no refleja la compensación aprobada (quedó igual o mayor que
  // lo que respaldan las marcaciones), se descuenta aquí una sola vez.
  if (applied > 0 && stored >= marked) {
    return Math.max(0, marked - applied);
  }
  return Math.min(stored, marked);
};

// ── Inasistencias ────────────────────────────────────────────────────────────

export const ABSENCE_KIND = {
  CONFIRMED: "confirmed",
  COVERED: "covered",
  NOT_WORKABLE: "notWorkable",
  SIN_GOCE: "sinGoce",
  REVIEW: "pendingReview",
  NONE: "none",
};

const FULL_DAY_COVERING_TYPES = [
  "Descanso Médico",
  "Licencia por Maternidad",
  "Licencia por Paternidad",
  "Vacaciones",
  "Descanso Vacacional",
  "Feriado",
  "Onomástico",
  "Licencia sin Goce de Haber",
  "Compensación de Tardanza",
];

/** Incidente aprobado que cubre la jornada completa (día completo o tipo que cubre el día). */
const findFullDayCover = (approvedIncidents = []) =>
  (approvedIncidents || []).find(
    (i) => i.full_day_justification || FULL_DAY_COVERING_TYPES.includes(i.incident_type)
  );

/** ¿La jornada está cubierta por una justificación aprobada? */
export const isCoveredByApprovedIncident = (approvedIncidents = []) =>
  !!findFullDayCover(approvedIncidents);

/** ¿La jornada tiene alguna marcación real (entrada o salida)? */
export const hasClockMarkings = (record) => {
  const { firstClockIn, lastClockOut } = getSegmentClockTimes(record);
  return !!(firstClockIn || lastClockOut);
};

/**
 * Clasifica una jornada del trabajador dentro del período de asistencia.
 * No escribe nada: devuelve el tipo y el motivo concreto.
 */
export const classifyAbsenceDay = ({
  date,
  record,
  scheduleDay,
  approvedIncidents = [],
  hasRecord = !!record,
  isVacation = false,
  isHoliday = false,
}) => {
  const isWorkable = !!(scheduleDay?.start && scheduleDay?.end);

  if (isHoliday) {
    return { kind: ABSENCE_KIND.NOT_WORKABLE, reason: "Feriado" };
  }
  if (isVacation) {
    return { kind: ABSENCE_KIND.COVERED, reason: "Vacaciones aprobadas" };
  }

  const fullDayCover = findFullDayCover(approvedIncidents);
  if (fullDayCover) {
    return { kind: ABSENCE_KIND.COVERED, reason: `Cubierta por ${fullDayCover.incident_type}` };
  }

  if (record?.status === "Permiso sin goce") {
    return { kind: ABSENCE_KIND.SIN_GOCE, reason: "Permiso sin goce de haber" };
  }

  const markings = getSegmentClockTimes(record);

  if (!isWorkable) {
    return markings.firstClockIn
      ? { kind: ABSENCE_KIND.NONE, reason: "Día no laborable con marcaciones" }
      : { kind: ABSENCE_KIND.NOT_WORKABLE, reason: "Día no laborable según horario" };
  }

  if (!hasRecord && !markings.firstClockIn) {
    return { kind: ABSENCE_KIND.CONFIRMED, reason: "Jornada laborable sin registro de asistencia" };
  }

  if (markings.firstClockIn && !markings.lastClockOut) {
    return { kind: ABSENCE_KIND.REVIEW, reason: "Marcación incompleta (sin salida)" };
  }

  if (markings.firstClockIn) {
    if (record?.is_absent) {
      return { kind: ABSENCE_KIND.REVIEW, reason: "Marcó entrada pero el registro figura como ausente" };
    }
    if (record?.status === "Ausente") {
      return { kind: ABSENCE_KIND.REVIEW, reason: "Marcó entrada pero el estado figura como Ausente" };
    }
    return { kind: ABSENCE_KIND.NONE, reason: "Jornada con marcaciones" };
  }

  if (record?.is_absent && record?.status === "Ausente") {
    return { kind: ABSENCE_KIND.CONFIRMED, reason: "Ausencia registrada y confirmada" };
  }
  if (record?.is_absent && record?.status !== "Ausente") {
    return { kind: ABSENCE_KIND.REVIEW, reason: `Marcado como ausente con estado "${record?.status || "sin estado"}"` };
  }
  if (!record?.is_absent && record?.status === "Ausente") {
    return { kind: ABSENCE_KIND.REVIEW, reason: "Estado Ausente sin el indicador de falta" };
  }
  if (record?.status === "Justificado") {
    return { kind: ABSENCE_KIND.COVERED, reason: "Justificación aprobada" };
  }

  return { kind: ABSENCE_KIND.CONFIRMED, reason: "Jornada laborable sin marcaciones ni justificación" };
};

/**
 * Minutos de horas extras compensables de una jornada: disponibles (no consumidas
 * ni reservadas por solicitudes pendientes) y no pendientes de autorización.
 * Una jornada destinada a "pago" sin autorización no es compensable hasta que se
 * autorice (acción explícita sobre la jornada).
 */
export const isCompensableOvertime = (record, availableMinutes) => {
  const minutes = Math.max(0, Number(availableMinutes) || 0);
  if (minutes <= 0) return 0;
  const destination = record?.overtime_destination || "pago";
  if (destination === "pago" && record?.overtime_authorized !== true) return 0;
  return minutes;
};

/** Registros cuya falta está confirmada (is_absent y estado coherentes). */
export const isConfirmedAbsence = (record) =>
  !!record?.is_absent && record?.status === "Ausente";

// ── Detección de inconsistencias históricas (vista previa) ───────────────────

/**
 * Registros cuya tardanza almacenada no coincide con el cálculo desde las
 * marcaciones (tolerancia del horario y compensación aprobada incluidas).
 * Devuelve filas listas para la vista previa de regularización.
 */
export const findLateInconsistencies = ({
  records = [],
  getScheduleDay,
  approvedIncidentsByKey = new Map(),
  approvedCompensationByKey = new Map(),
  employeeNameById = new Map(),
  enableCompensation = false,
  payslipStatusByEmployee = new Map(),
}) => {
  const rows = [];
  for (const record of records) {
    const dateStr = String(record.date || "").slice(0, 10);
    const scheduleDay = getScheduleDay ? getScheduleDay(record.employee_id, dateStr) : null;
    const state = recomputeLateState({
      record,
      scheduleDay,
      approvedIncidents: approvedIncidentsByKey.get(`${record.employee_id}|${dateStr}`) || [],
      approvedCompensationMinutes:
        approvedCompensationByKey.get(`${record.employee_id}|${dateStr}`) || 0,
      recordActiveCompensationMinutes:
        enableCompensation && record.tardiness_compensation_status === "Activa"
          ? record.tardiness_compensation_minutes || 0
          : 0,
    });
    if (!state) continue;

    const payslipStatus = payslipStatusByEmployee.get(record.employee_id) || "";
    const isClosed = payslipStatus === "Aprobada" || payslipStatus === "Pagada";
    if (!state.isInconsistent && !state.needsReview) continue;

    rows.push({
      recordId: record.id,
      employeeId: record.employee_id,
      employeeName: employeeNameById.get(record.employee_id) || record.employee_id,
      date: dateStr,
      status: record.status || "",
      storedMinutes: state.storedMinutes,
      storedIsLate: state.storedIsLate,
      markedMinutes: state.markedMinutes,
      effectiveMinutes: state.effectiveMinutes,
      toleranceMinutes: state.toleranceMinutes,
      appliedCompensationMinutes: state.appliedCompensationMinutes,
      needsReview: state.needsReview,
      reason: state.reason,
      requiresManualRecalc: isClosed,
      payslipStatus,
    });
  }
  return rows.sort((a, b) => a.date.localeCompare(b.date) || a.employeeName.localeCompare(b.employeeName));
};

/**
 * Analiza las jornadas del período y clasifica cada día (detalle por fecha).
 * Incluye jornadas laborables sin registro dentro de las fechas indicadas.
 */
export const findAbsenceFindings = ({
  employees = [],
  records = [],
  getScheduleDay,
  approvedIncidentsByKey = new Map(),
  employeeNameById = new Map(),
  periodStart,
  periodEnd,
  isHoliday = () => false,
  isVacation = () => false,
}) => {
  const rows = [];
  const recordIndex = new Map();
  for (const record of records) {
    recordIndex.set(`${record.employee_id}|${String(record.date || "").slice(0, 10)}`, record);
  }

  const dates = [];
  if (periodStart && periodEnd) {
    for (let d = new Date(periodStart + "T00:00:00"); d <= new Date(periodEnd + "T00:00:00"); d.setDate(d.getDate() + 1)) {
      dates.push(d.toISOString().slice(0, 10));
    }
  }

  for (const employee of employees) {
    for (const dateStr of dates) {
      if (employee.hire_date && String(employee.hire_date).slice(0, 10) > dateStr) continue;
      if (employee.termination_date && String(employee.termination_date).slice(0, 10) < dateStr) continue;
      const scheduleDay = getScheduleDay ? getScheduleDay(employee.id, dateStr) : null;
      const record = recordIndex.get(`${employee.id}|${dateStr}`) || null;
      // Marcaciones reales de la jornada: permiten distinguir una falta completa
      // (sin ninguna marcación) de una marcación incompleta por regularizar.
      const markings = getSegmentClockTimes(record);
      const classification = classifyAbsenceDay({
        date: dateStr,
        record,
        scheduleDay,
        approvedIncidents: approvedIncidentsByKey.get(`${employee.id}|${dateStr}`) || [],
        hasRecord: !!record,
        isVacation: isVacation(employee.id, dateStr),
        isHoliday: isHoliday(dateStr),
      });
      if (classification.kind === ABSENCE_KIND.NONE || classification.kind === ABSENCE_KIND.NOT_WORKABLE) continue;
      rows.push({
        employeeId: employee.id,
        employeeName: employeeNameById.get(employee.id) || `${employee.first_name || ""} ${employee.last_name || ""}`.trim(),
        employeeCode: employee.employee_code || "",
        date: dateStr,
        kind: classification.kind,
        reason: classification.reason,
        recordId: record?.id || null,
        recordStatus: record?.status || "",
        isAbsent: !!record?.is_absent,
        hasRecord: !!record,
        hasMarkings: !!(markings.firstClockIn || markings.lastClockOut),
      });
    }
  }
  return rows.sort((a, b) => a.date.localeCompare(b.date) || a.employeeName.localeCompare(b.employeeName));
};