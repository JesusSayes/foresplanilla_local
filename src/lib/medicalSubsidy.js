// Descanso médico por enfermedad o accidente: clasificación de días y subsidio
// por incapacidad temporal (régimen general, trabajador dependiente).
//
// REGLAS IMPLEMENTADAS
// - Los primeros 20 días de incapacidad acumulados en el AÑO CALENDARIO los remunera
//   el empleador (código PLAME 20, día no laborado y no subsidiado pero remunerado).
// - Desde el día 21 acumulado el día es subsidiado (código PLAME 21) y el importe se
//   declara como ingreso 0916.
// - Se acumulan fechas calendario ÚNICAS (continuas o discontinuas) del trabajador y
//   empleador; una nueva solicitud, planilla, sede o centro de costo NO reinicia el
//   contador. Los días se derivan de las fechas de las incidencias aprobadas, nunca de
//   un contador mutable.
// - Solo cuentan descansos médicos de DÍA COMPLETO. Una cita médica por horas no es un
//   día de incapacidad. Maternidad, vacaciones, comisión, permisos, faltas y licencia
//   sin goce no son descanso médico: si coinciden en la misma fecha se reporta el
//   conflicto y el día no se clasifica (no se duplica).
// - El importe del subsidio usa el promedio diario de las remuneraciones computables de
//   los 12 meses calendario anteriores al mes de inicio de la contingencia. Si hay menos
//   meses (afiliación/vínculo reciente) se usa el período disponible y su divisor
//   sustentado (meses × 30). Nunca se divide siempre entre 360 ni se usa el sueldo actual.
// - Si faltan antecedentes, la base queda PENDIENTE (no se calcula un subsidio cero) y el
//   usuario autorizado puede registrar una base diaria sustentada en la incidencia.
// - La base se conserva en las continuaciones de la misma contingencia (se reutiliza la
//   guardada en la boleta anterior de esa contingencia).
// - El límite continuo se calcula por meses calendario desde el primer día subsidiado.
//   Una continuidad entre años requiere revisión antes de emitir una boleta.
//
// La contingencia que atraviesa diciembre/enero se marca como CONTINUIDAD POR VALIDAR:
// el conteo de 20 días se reinicia por año calendario (regla de EsSalud) y el tope de
// 11 meses y 10 días se sigue contando desde el inicio de la contingencia.

export const MEDICAL_REST_TYPE = "Descanso Médico";
export const MATERNITY_TYPE = "Licencia por Maternidad";
export const EMPLOYER_PAID_DAYS_PER_YEAR = 20;
/** Fin exclusivo del plazo de 11 meses calendario y 10 días. */
export const continuousSubsidyEnd = (start) => {
  const date = new Date(`${start}T00:00:00Z`);
  const day = date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() + 11);
  const last = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
  date.setUTCDate(Math.min(day, last));
  return addDays(date.toISOString().slice(0, 10), 10);
};
/** Días con que se computa el mes remunerativo (convención Perú). */
export const MONTH_DAYS = 30;
/** Solo fechas consecutivas: no se inventan días no certificados entre episodios. */
export const CONTINGENCY_GAP_DAYS = 0;

/** Códigos de tablas paramétricas oficiales (21 suspensión, 22 ingresos). */
export const PLAME_CODES = Object.freeze({
  suspension_employer: "20",
  suspension_subsidized: "21",
  suspension_maternity: "22",
  income_subsidy: "0916",
  income_maternity: "0915",
});

export const SUBSIDY_CONCEPT = Object.freeze({
  name: "Subsidio por incapacidad temporal",
  code: PLAME_CODES.income_subsidy,
  category: "Otros",
});

const norm = (value) => String(value ?? "").trim().toLowerCase();
const deaccent = (value) => norm(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "");
const dateOnly = (value) => String(value ?? "").slice(0, 10);
const round2 = (value) => Math.round((Number(value) || 0) * 100) / 100;

export const addDays = (dateStr, days) => {
  const d = new Date(`${dateStr}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return dateStr;
  d.setUTCDate(d.getUTCDate() + Number(days || 0));
  return d.toISOString().slice(0, 10);
};

export const daysBetween = (fromDate, toDate) => {
  const a = new Date(`${dateOnly(fromDate)}T00:00:00Z`);
  const b = new Date(`${dateOnly(toDate)}T00:00:00Z`);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return 0;
  return Math.round((b - a) / 86400000);
};

/** ¿La incidencia es un descanso médico por enfermedad o accidente? */
export const isMedicalRestIncident = (incident) => {
  if (!incident) return false;
  const type = deaccent(incident.incident_type);
  if (type === deaccent(MEDICAL_REST_TYPE)) return true;
  // "Descanso médico" con coletilla ("Descanso médico (accidente)") sigue siendo descanso.
  return type.startsWith("descanso medico") && !type.includes("maternidad");
};

/** ¿La incidencia es maternidad? (código 22 / 0915, fuera de este tratamiento) */
export const isMaternityIncident = (incident) =>
  !!incident && deaccent(incident.incident_type).includes("maternidad");

/** Tipos que, en la misma fecha, impiden clasificar el día como descanso médico. */
const CONFLICT_INCIDENT_TYPES = [
  MATERNITY_TYPE,
  "Licencia por Paternidad",
  "Licencia sin Goce de Haber",
  "Vacaciones",
  "Descanso Vacacional",
  "Comisión de Servicio",
  "Capacitación",
  "Falta",
  "Permiso sin goce",
];

const isConflictIncident = (incident) => {
  if (!incident) return false;
  const type = deaccent(incident.incident_type);
  return CONFLICT_INCIDENT_TYPES.some((t) => deaccent(t) === type);
};

/**
 * ¿El descanso cubre el día completo? Un descanso registrado solo por horas no es un
 * día de incapacidad (no genera código 20/21).
 */
export const isFullDayMedicalRest = (incident) => {
  if (!isMedicalRestIncident(incident)) return false;
  if (incident.full_day_justification === true) return true;
  // Sin horas declaradas se asume día completo (así se registra el descanso médico).
  return !incident.justified_time_start && !incident.justified_time_end;
};

/**
 * Fechas ÚNICAS de descanso médico de día completo de una lista de incidencias.
 * Un día con varias incidencias (o el mismo descanso registrado dos veces) cuenta una vez.
 */
export const collectMedicalRestDates = (incidents = []) => {
  const byDate = new Map();
  (incidents || []).forEach((incident) => {
    if (incident.status !== "Aprobada" || !isFullDayMedicalRest(incident)) return;
    const day = dateOnly(incident.incident_date);
    if (!day) return;
    if (!byDate.has(day)) byDate.set(day, []);
    byDate.get(day).push(incident);
  });
  const dates = [...byDate.keys()].sort();
  return { dates, byDate };
};

/**
 * Inicio de la contingencia que contiene `targetDate`: se retrocede por las fechas de
 * descanso consecutivas acreditadas por incidencias aprobadas.
 */
export const findContingencyStart = (sortedDates = [], targetDate, gapDays = CONTINGENCY_GAP_DAYS) => {
  const dates = (sortedDates || []).filter(Boolean).sort();
  if (dates.length === 0) return targetDate ? dateOnly(targetDate) : null;
  const target = dateOnly(targetDate) || dates[0];
  const upToTarget = dates.filter((d) => d <= target);
  if (upToTarget.length === 0) return target;
  let start = upToTarget[upToTarget.length - 1];
  for (let i = upToTarget.length - 2; i >= 0; i--) {
    const gap = daysBetween(upToTarget[i], start);
    if (gap > 0 && gap <= gapDays + 1) {
      start = upToTarget[i];
    } else {
      break;
    }
  }
  return start;
};

/** Importes no computables para el promedio del subsidio. */
const NON_COMPUTABLE_NAME_RE = /gratificaci|bonificaci[oó]n extraordinaria|utilidades|participaci[oó]n|\bcts\b|indemnizaci|subsidio/i;

/**
 * Remuneración computable de una boleta: ingresos del desglose, excluyendo
 * gratificaciones, bonificaciones extraordinarias, utilidades, CTS, indemnizaciones y
 * subsidios (0916/0915). Incluye básica, asignación familiar, horas extras y demás
 * conceptos remunerativos.
 */
export const computeComputableRemuneration = (payslip) => {
  const items = payslip?.calculation_summary?.breakdown?.incomes?.items;
  // Un total bruto no permite distinguir conceptos computables ni períodos subsidiados.
  if (!Array.isArray(items) || !items.length || Number(payslip.subsidized_days) > 0) return null;
  let total = 0;
  for (const item of items) {
    const code = String(item.concept_code || "").trim();
    const name = String(item.name || "");
    if (["0915", "0916"].includes(code) || NON_COMPUTABLE_NAME_RE.test(name)) continue;
    if (!Number.isFinite(Number(item.amount))) return null;
    if (!Number(item.amount)) continue;
    // No asumir que toda bonificación o movilidad es remunerativa.
    const computable = ["0121", "0201", "0105", "0106", "0107"].includes(code) ||
      /remuneraci[oó]n b[aá]sica|asignaci[oó]n familiar|horas extras/i.test(name);
    if (!computable) return null;
    total += Number(item.amount);
  }
  const deductions = payslip.calculation_summary?.breakdown?.deductions?.items || [];
  for (const item of deductions) {
    if (/falta|inasistencia|tardanza|permiso|salida anticipada|sin goce/i.test(item.name || "")) {
      total -= Math.abs(Number(item.amount) || 0);
    }
  }
  return round2(Math.max(0, total));
};

const shiftMonth = (year, month, back) => {
  let m = Number(month) - back;
  let y = Number(year);
  while (m <= 0) {
    m += 12;
    y -= 1;
  }
  return { year: y, month: m };
};

/**
 * Remuneraciones computables de los `monthsBack` meses calendario anteriores al mes de
 * inicio de la contingencia. Un mes faltante invalida el promedio; no se elimina del divisor silenciosamente.
 */
export const buildComputableMonths = (payslips = [], startDate, monthsBack = 12, employmentStart) => {
  const start = dateOnly(startDate);
  if (!start) return [];
  const year = Number(start.slice(0, 4));
  const month = Number(start.slice(5, 7));
  const hire = dateOnly(employmentStart);
  const usable = payslips.filter(p => p && p.payroll_type !== "Quincenal" && ["Aprobada", "Pagada"].includes(p.status));
  const months = [];
  for (let back = monthsBack; back >= 1; back--) {
    const { year: y, month: m } = shiftMonth(year, month, back);
    const first = `${y}-${String(m).padStart(2, "0")}-01`;
    const end = `${y}-${String(m).padStart(2, "0")}-${new Date(Date.UTC(y, m, 0)).getUTCDate()}`;
    if (hire && hire > end) continue;
    const inMonth = usable.filter(p => Number(p.year) === y && Number(p.month) === m);
    const amounts = inMonth.map(computeComputableRemuneration);
    const complete = inMonth.filter(p => p.payroll_type === "Mensual").length === 1 &&
      amounts.every(amount => amount !== null) && !(hire && hire > first);
    months.push({ year: y, month: m, amount: complete ? round2(amounts.reduce((sum, amount) => sum + amount, 0)) : null,
      payslips: inMonth.length, complete });
  }
  return months;
};

export const computeHistoricalAverage = (months = []) => {
  const complete = months.length > 0 && months.every(m => m.complete && Number.isFinite(m.amount));
  const total = complete ? round2(months.reduce((sum, m) => sum + m.amount, 0)) : 0;
  const divisor = complete ? months.length * MONTH_DAYS : 0;
  return {
    average_daily: divisor && total > 0 ? total / divisor : null,
    months_used: complete ? months.length : 0,
    divisor, total, months,
    pending: !complete || total <= 0,
    reason: complete && total > 0 ? "" : "Historial computable incompleto o no verificable; registre una base diaria sustentada",
  };
};

/** Base diaria sustentada registrada por un usuario autorizado en la contingencia. */
const findOverrideDailyBase = (medicalIncidents = [], contingencyStart, contingencyEnd) => {
  const candidates = medicalIncidents.filter(i => i.status === "Aprobada" && isFullDayMedicalRest(i) &&
    Number(i.subsidy_daily_base) > 0 && dateOnly(i.incident_date) >= contingencyStart &&
    dateOnly(i.incident_date) <= contingencyEnd);
  if (!candidates.length) return null;
  if (candidates.some(i => !String(i.subsidy_daily_base_reason || "").trim()) ||
      new Set(candidates.map(i => Number(i.subsidy_daily_base))).size > 1) {
    return { pending: true, reason: "Bases manuales contradictorias o sin sustento en la contingencia" };
  }
  const chosen = candidates[0];
  return { average_daily: Number(chosen.subsidy_daily_base), reason: chosen.subsidy_daily_base_reason,
    date: dateOnly(chosen.incident_date) };
};

/** Base de una boleta anterior de la MISMA contingencia (se conserva en continuaciones). */
const findPreviousBase = (payslips = [], contingencyStart) => {
  const snapshots = payslips.filter(p => ["Aprobada", "Pagada"].includes(p.status))
    .flatMap(p => {
      const snap = p.calculation_summary?.medical_subsidy;
      return snap?.contingencies || (snap ? [snap] : []);
    });
  const match = snapshots.find(snap => snap.contingency_start === contingencyStart &&
    !snap.base?.pending && Number(snap.base?.average_daily) > 0);
  return match ? { ...match.base, source: "payslip_anterior" } : null;
};

/**
 * Instantánea versionada del cálculo de descanso médico de UN período.
 * No escribe nada: el llamador la persiste en `calculation_summary.medical_subsidy`.
 */
const buildContingencySnapshot = ({
  incidents = [],
  otherIncidents = [],
  conflictDates = [],
  alreadySubsidizedDates = [],
  periodStart,
  periodEnd,
  payslips = [],
  monthsBack = 12,
  employmentStart,
}) => {
  const from = dateOnly(periodStart);
  const to = dateOnly(periodEnd);
  const periodYear = Number(from.slice(0, 4));

  const medical = (incidents || []).filter((i) => isMedicalRestIncident(i));
  const { dates, byDate } = collectMedicalRestDates(medical);
  if (dates.length === 0) return null;

  const periodDates = dates.filter((d) => d >= from && d <= to);
  if (periodDates.length === 0) return null;

  // Acumulado del año calendario antes del período (fechas únicas).
  const priorDates = dates.filter((d) => d < from && Number(d.slice(0, 4)) === periodYear);
  const priorAccumulatedDays = priorDates.length;

  // Conflictos: misma fecha con vacaciones, maternidad, permiso, falta u otra ausencia.
  const externalConflicts = new Set((conflictDates || []).map(dateOnly).filter(Boolean));
  const otherByDate = new Map();
  (otherIncidents || []).forEach((incident) => {
    if (!incident || incident.status !== "Aprobada" || isMedicalRestIncident(incident) || !isConflictIncident(incident)) return;
    if (!(incident.full_day_justification === true || !incident.justified_time_start)) return;
    const day = dateOnly(incident.incident_date);
    if (!day) return;
    if (!otherByDate.has(day)) otherByDate.set(day, []);
    otherByDate.get(day).push(incident);
  });

  const conflicts = [];
  const countedDates = [];
  const alreadyPaid = new Set((alreadySubsidizedDates || []).map(dateOnly).filter(Boolean));
  const duplicateDocuments = periodDates
    .map((day) => {
      const docs = [...new Set((byDate.get(day) || []).map((i) => String(i.codigo_solicitud || i.id || "")).filter(Boolean))];
      return { date: day, documents: docs };
    })
    .filter((entry) => entry.documents.length > 1);
  periodDates.forEach((day) => {
    if (alreadyPaid.has(day)) return;
    const others = otherByDate.get(day) || [];
    if (externalConflicts.has(day) || others.length > 0) {
      conflicts.push({
        date: day,
        types: [
          ...(externalConflicts.has(day) ? ["Marcación de asistencia / vacaciones / falta / licencia sin goce"] : []),
          ...others.map((i) => i.incident_type).filter(Boolean),
        ],
        medical_incident_ids: (byDate.get(day) || []).map((i) => i.id).filter(Boolean),
      });
      return;
    }
    countedDates.push(day);
  });

  const contingencyStart = findContingencyStart(dates, periodDates[0]);

  // ── Base diaria del subsidio ──
  const computableMonths = buildComputableMonths(payslips, contingencyStart, monthsBack, employmentStart);
  const override = findOverrideDailyBase(medical, contingencyStart, periodDates[periodDates.length - 1]);
  const previousBase = findPreviousBase(payslips, contingencyStart);
  let base;
  if (override?.pending) {
    base = override;
  } else if (previousBase) {
    base = previousBase;
  } else if (override && override.average_daily > 0) {
    base = {
      average_daily: override.average_daily,
      months_used: 0,
      divisor: 0,
      total: 0,
      months: [],
      pending: false,
      reason: override.reason,
      source: "base_sustentada",
      source_date: override.date,
    };
  } else if (previousBase) {
    base = previousBase;
  } else {
    base = { ...computeHistoricalAverage(computableMonths), source: "promedio_12_meses" };
  }

  // ── Clasificación día por día (20 días del empleador / 21 subsidiado) ──
  const days = countedDates.map((day) => {
    const accumulated = dates.filter(d => d <= day && d.slice(0, 4) === day.slice(0, 4)).length;
    const subsidized = accumulated > EMPLOYER_PAID_DAYS_PER_YEAR;
    return {
      date: day,
      accumulated_year_day: accumulated,
      contingency_day: contingencyStart ? daysBetween(contingencyStart, day) + 1 : null,
      segment: subsidized ? "subsidiado" : "empleador",
      plame_code: subsidized ? PLAME_CODES.suspension_subsidized : PLAME_CODES.suspension_employer,
      incident_ids: (byDate.get(day) || []).map((i) => i.id).filter(Boolean),
    };
  });

  const employerDays = days.filter((d) => d.segment === "empleador").length;
  const subsidizedDays = days.filter((d) => d.segment === "subsidiado").length;
  const lastDate = days.length > 0 ? days[days.length - 1].date : from;
  const contingencyElapsedDays = contingencyStart ? daysBetween(contingencyStart, lastDate) + 1 : 0;

  const firstSubsidizedDate = dates.find(day => day >= contingencyStart && day <= lastDate &&
    dates.filter(d => d <= day && d.slice(0, 4) === day.slice(0, 4)).length > EMPLOYER_PAID_DAYS_PER_YEAR);
  const limitExceeded = !!firstSubsidizedDate && lastDate >= continuousSubsidyEnd(firstSubsidizedDate);

  const subsidyAmount =
    base.pending || subsidizedDays === 0
      ? subsidizedDays === 0
        ? 0
        : null
      : round2(subsidizedDays * base.average_daily);

  // ── Validaciones (informativas: no truncan importes) ──
  const messages = [];
  if (base.pending && subsidizedDays > 0) {
    messages.push(
      "Subsidio pendiente de validación: falta historial de remuneraciones computables. Registre una base diaria sustentada o regularice el historial; no se generó un importe de subsidio."
    );
  }
  if (subsidizedDays > 0 && limitExceeded) {
    messages.push(
      "La contingencia supera 11 meses calendario y 10 días de subsidio continuo. Requiere revisión."
    );
  }
  if (conflicts.length > 0) {
    messages.push(
      `${conflicts.length} día(s) con descanso médico y asistencia u otra ausencia: ${conflicts.map(c => `${c.date} (${c.types.join(", ")})`).join("; ")}. Resuelva el conflicto: esos días no se clasificaron como 20/21.`
    );
  }
  if (duplicateDocuments.length > 0) {
    messages.push(
      `${duplicateDocuments.length} fecha(s) con más de un documento de descanso médico: ${duplicateDocuments.map(d => d.date).join(", ")}. Se contaron una sola vez; verifique los certificados duplicados.`
    );
  }
  if (alreadyPaid.size > 0) {
    messages.push(
      `${[...alreadyPaid].filter((d) => d >= from && d <= to).length} día(s) ya subsidiados en otra planilla del mismo mes: no se vuelven a pagar.`
    );
  }
  const crossYear = contingencyStart && Number(contingencyStart.slice(0, 4)) < periodYear;
  if (crossYear) {
    messages.push(
      "Contingencia iniciada en el año anterior: revise la continuidad y su tratamiento anual antes de emitir la boleta."
    );
  }
  const subsidizedWithoutCitt = days
    .filter((d) => d.segment === "subsidiado")
    .filter((d) => (byDate.get(d.date) || []).every((i) => !String(i.citt_number || "").trim()));
  const cittNumbers = [
    ...new Set(
      days
        .flatMap((d) => (byDate.get(d.date) || []).map((i) => String(i.citt_number || "").trim()))
        .filter(Boolean)
    ),
  ];
  if (subsidizedWithoutCitt.length > 0) {
    messages.push(
      `${subsidizedWithoutCitt.length} día(s) subsidiado(s) sin número de CITT registrado. Complete el sustento o aplique el procedimiento declarativo (SUNAT) para CITT no disponible.`
    );
  }

  const status = base.pending && subsidizedDays > 0
    ? "pendiente_base"
    : conflicts.length > 0
    ? "conflicto"
    : subsidizedDays > 0 && limitExceeded
    ? "limite_excedido"
    : crossYear
    ? "continuidad_por_validar"
    : "ok";

  return {
    version: 2,
    contingency_start: contingencyStart,
    contingency_elapsed_days: contingencyElapsedDays,
    period_start: from,
    period_end: to,
    prior_accumulated_days: priorAccumulatedDays,
    employer_days: employerDays,
    subsidized_days: subsidizedDays,
    remuneration_days: Math.max(0, MONTH_DAYS - subsidizedDays),
    days,
    plame: {
      suspension_employer_code: PLAME_CODES.suspension_employer,
      suspension_employer_days: employerDays,
      suspension_subsidized_code: PLAME_CODES.suspension_subsidized,
      suspension_subsidized_days: subsidizedDays,
      income_subsidy_code: PLAME_CODES.income_subsidy,
      income_subsidy_amount: subsidyAmount,
    },
    base,
    subsidy_amount: subsidyAmount,
    citt_numbers: cittNumbers,
    conflicts,
    duplicate_documents: duplicateDocuments,
    already_subsidized_dates: [...alreadyPaid].filter((d) => d >= from && d <= to).sort(),
    validation: {
      status,
      blocked: status !== "ok",
      messages,
      cross_year_continuity: !!crossYear,
      citt_pending: subsidizedWithoutCitt.length > 0,
      limit_exceeded: limitExceeded,
    },
    computed_at: new Date().toISOString(),
  };
};

// Calcula cada episodio con su propia base: no reutiliza la del primer descanso del año.
export const buildMedicalSubsidySnapshot = (options) => {
  const { dates } = collectMedicalRestDates(options.incidents);
  const inPeriod = dates.filter(d => d >= options.periodStart && d <= options.periodEnd);
  const groups = new Map();
  for (const day of inPeriod) {
    const start = findContingencyStart(dates, day);
    if (!groups.has(start)) groups.set(start, []);
    groups.get(start).push(day);
  }
  const parts = [...groups.values()].map(days => buildContingencySnapshot({
    ...options, periodStart: days[0], periodEnd: days[days.length - 1],
  })).filter(Boolean);
  if (!parts.length) return null;
  if (parts.length === 1) return { ...parts[0], period_start: options.periodStart, period_end: options.periodEnd };
  const amount = parts.some(p => p.subsidy_amount === null) ? null : round2(parts.reduce((n, p) => n + p.subsidy_amount, 0));
  const sum = field => parts.reduce((n, p) => n + p[field], 0);
  const blocked = parts.some(p => p.validation.blocked);
  return {
    ...parts[0], contingency_start: null, contingencies: parts,
    period_start: options.periodStart, period_end: options.periodEnd,
    employer_days: sum("employer_days"), subsidized_days: sum("subsidized_days"),
    remuneration_days: Math.max(0, MONTH_DAYS - sum("subsidized_days")),
    days: parts.flatMap(p => p.days), subsidy_amount: amount,
    base: { source: "por_contingencia", pending: amount === null, average_daily: null },
    citt_numbers: [...new Set(parts.flatMap(p => p.citt_numbers))],
    plame: { ...parts[0].plame, suspension_employer_days: sum("employer_days"),
      suspension_subsidized_days: sum("subsidized_days"), income_subsidy_amount: amount },
    validation: { blocked, status: blocked ? "pendiente_revision" : "ok", messages: parts.flatMap(p => p.validation.messages) },
  };
};

/**
 * Concepto de ingreso del subsidio (0916). Se agrega UNA sola vez a la boleta; el total
 * de ingresos lo incluye una única vez y los aportes del empleador no descuentan el neto.
 */
export const buildSubsidyConcept = ({ employeeId, snapshot }) => {
  if (!snapshot || !(Number(snapshot.subsidy_amount) > 0)) return null;
  return {
    employee_id: employeeId,
    concept_type: "Ingreso",
    concept_category: SUBSIDY_CONCEPT.category,
    concept_name: SUBSIDY_CONCEPT.name,
    concept_code: SUBSIDY_CONCEPT.code,
    is_dynamic: false,
    is_recurring: false,
    amount: round2(snapshot.subsidy_amount),
    applies_to_payroll_types: ["Mensual", "Adicional", "SNP"],
  };
};

/** Importe del subsidio en una boleta, desde el desglose persistido. */
export const findSubsidyAmountInSummary = (summary) => {
  const items = summary?.breakdown?.incomes?.items || [];
  return round2(
    items
      .filter((i) => String(i?.concept_code || "").trim() === PLAME_CODES.income_subsidy)
      .reduce((sum, i) => sum + (Number(i.amount) || 0), 0)
  );
};
