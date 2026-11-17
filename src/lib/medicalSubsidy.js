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
// - Límite general de subsidio continuo: 11 meses y 10 días (340 días). No se reinicia
//   al cambiar de año; si se excede se marca para validación, sin truncar importes.
//
// La contingencia que atraviesa diciembre/enero se marca como CONTINUIDAD POR VALIDAR:
// el conteo de 20 días se reinicia por año calendario (regla de EsSalud) y el tope de
// 11 meses y 10 días se sigue contando desde el inicio de la contingencia.

export const MEDICAL_REST_TYPE = "Descanso Médico";
export const MATERNITY_TYPE = "Licencia por Maternidad";
export const EMPLOYER_PAID_DAYS_PER_YEAR = 20;
/** 11 meses y 10 días de subsidio continuo. */
export const MAX_CONTINUOUS_SUBSIDY_DAYS = 340;
/** Días con que se computa el mes remunerativo (convención Perú). */
export const MONTH_DAYS = 30;
/** Tolerancia para considerar dos descansos como la misma contingencia (fines de semana). */
export const CONTINGENCY_GAP_DAYS = 3;

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
  category: "Subsidios",
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
    if (!isFullDayMedicalRest(incident)) return;
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
 * descanso mientras el hueco entre dos descansos no supere la tolerancia (fines de
 * semana y feriados cubiertos por el certificado).
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
  if (!payslip) return 0;
  const items = payslip.calculation_summary?.breakdown?.incomes?.items;
  if (Array.isArray(items) && items.length > 0) {
    return round2(
      items.reduce((sum, item) => {
        const code = String(item?.concept_code || "").trim();
        if (code === PLAME_CODES.income_subsidy || code === PLAME_CODES.income_maternity) return sum;
        if (NON_COMPUTABLE_NAME_RE.test(String(item?.name || ""))) return sum;
        if (NON_COMPUTABLE_NAME_RE.test(String(item?.concept_category || ""))) return sum;
        return sum + (Number(item?.amount) || 0);
      }, 0)
    );
  }
  // Sin desglose (boletas históricas): se usa el total de ingresos como respaldo.
  return round2(Number(payslip.total_income) || 0);
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
 * inicio de la contingencia. Un mes sin boleta queda en 0 y no suma al divisor.
 */
export const buildComputableMonths = (payslips = [], startDate, monthsBack = 12) => {
  const start = dateOnly(startDate);
  if (!start) return [];
  const year = Number(start.slice(0, 4));
  const month = Number(start.slice(5, 7));
  if (!year || !month) return [];

  const usable = (payslips || []).filter((p) => p && p.payroll_type !== "Quincenal");
  const months = [];
  for (let back = monthsBack; back >= 1; back--) {
    const { year: y, month: m } = shiftMonth(year, month, back);
    const inMonth = usable.filter((p) => Number(p.year) === y && Number(p.month) === m);
    const amount = round2(inMonth.reduce((sum, p) => sum + computeComputableRemuneration(p), 0));
    months.push({ year: y, month: m, amount, payslips: inMonth.length });
  }
  return months;
};

/** Promedio diario = total computable / (meses con datos × 30). */
export const computeHistoricalAverage = (months = []) => {
  const valid = (months || []).filter((m) => Number(m?.amount) > 0);
  if (valid.length === 0) {
    return {
      average_daily: null,
      months_used: 0,
      divisor: 0,
      total: 0,
      months: (months || []).map((m) => ({ year: m.year, month: m.month, amount: round2(m.amount) })),
      pending: true,
      reason: "Sin historial de remuneraciones computables para el período de cómputo",
    };
  }
  const total = round2(valid.reduce((sum, m) => sum + Number(m.amount), 0));
  const divisor = valid.length * MONTH_DAYS;
  return {
    average_daily: round2(total / divisor),
    months_used: valid.length,
    divisor,
    total,
    months: (months || []).map((m) => ({ year: m.year, month: m.month, amount: round2(m.amount) })),
    pending: false,
    reason: "",
  };
};

/** Base diaria sustentada registrada por un usuario autorizado en la contingencia. */
const findOverrideDailyBase = (medicalIncidents = [], contingencyStart) => {
  const candidates = (medicalIncidents || [])
    .filter((i) => isMedicalRestIncident(i) && Number(i.subsidy_daily_base) > 0)
    .sort((a, b) => dateOnly(a.incident_date).localeCompare(dateOnly(b.incident_date)));
  if (candidates.length === 0) return null;
  if (!contingencyStart) return candidates[0];
  const inContingency = candidates.filter((i) => dateOnly(i.incident_date) >= contingencyStart);
  const chosen = inContingency[0] || candidates[candidates.length - 1];
  return {
    average_daily: round2(chosen.subsidy_daily_base),
    reason: String(chosen.subsidy_daily_base_reason || ""),
    date: dateOnly(chosen.incident_date),
  };
};

/** Base de una boleta anterior de la MISMA contingencia (se conserva en continuaciones). */
const findPreviousBase = (payslips = [], contingencyStart) => {
  if (!contingencyStart) return null;
  const match = (payslips || []).find((p) => {
    const snap = p?.calculation_summary?.medical_subsidy;
    return (
      snap &&
      snap.contingency_start === contingencyStart &&
      !snap.base?.pending &&
      Number(snap.base?.average_daily) > 0
    );
  });
  if (!match) return null;
  const base = match.calculation_summary.medical_subsidy.base;
  return { ...base, source: "payslip_anterior" };
};

/**
 * Instantánea versionada del cálculo de descanso médico de UN período.
 * No escribe nada: el llamador la persiste en `calculation_summary.medical_subsidy`.
 */
export const buildMedicalSubsidySnapshot = ({
  incidents = [],
  otherIncidents = [],
  conflictDates = [],
  alreadySubsidizedDates = [],
  periodStart,
  periodEnd,
  payslips = [],
  monthsBack = 12,
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
    if (!incident || isMedicalRestIncident(incident) || !isConflictIncident(incident)) return;
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
          ...(externalConflicts.has(day) ? ["Vacaciones / falta / licencia sin goce"] : []),
          ...others.map((i) => i.incident_type).filter(Boolean),
        ],
        medical_incident_ids: (byDate.get(day) || []).map((i) => i.id).filter(Boolean),
      });
      return;
    }
    countedDates.push(day);
  });

  const contingencyStart = findContingencyStart(dates, priorDates[0] || countedDates[0] || from);

  // ── Base diaria del subsidio ──
  const computableMonths = buildComputableMonths(payslips, contingencyStart, monthsBack);
  const override = findOverrideDailyBase(medical, contingencyStart);
  const previousBase = findPreviousBase(payslips, contingencyStart);
  let base;
  if (override && override.average_daily > 0) {
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
  const days = countedDates.map((day, index) => {
    const accumulated = priorAccumulatedDays + index + 1;
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
  if (subsidizedDays > 0 && contingencyElapsedDays > MAX_CONTINUOUS_SUBSIDY_DAYS) {
    messages.push(
      `La contingencia supera el máximo general de subsidio continuo (11 meses y 10 días = ${MAX_CONTINUOUS_SUBSIDY_DAYS} días). Requiere validación antes de continuar el subsidio.`
    );
  }
  if (conflicts.length > 0) {
    messages.push(
      `${conflicts.length} día(s) con doble clasificación (descanso médico y otra ausencia). Resuelva el conflicto: esos días no se clasificaron como 20/21.`
    );
  }
  if (duplicateDocuments.length > 0) {
    messages.push(
      `${duplicateDocuments.length} fecha(s) con más de un documento de descanso médico. Se contaron una sola vez; verifique los certificados duplicados.`
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
      "Contingencia iniciada en el año anterior: el conteo de 20 días se reinicia por año calendario y el tope de 11 meses y 10 días se sigue contando desde el inicio. Continuidad por validar."
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
    : subsidizedDays > 0 && contingencyElapsedDays > MAX_CONTINUOUS_SUBSIDY_DAYS
    ? "limite_excedido"
    : "ok";

  return {
    version: 1,
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
      messages,
      cross_year_continuity: !!crossYear,
      citt_pending: subsidizedWithoutCitt.length > 0,
      limit_exceeded: contingencyElapsedDays > MAX_CONTINUOUS_SUBSIDY_DAYS,
    },
    computed_at: new Date().toISOString(),
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