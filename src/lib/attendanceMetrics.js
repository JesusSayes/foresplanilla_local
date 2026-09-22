/**
 * Utilitarios de cálculo de métricas de asistencia.
 * Estos métodos NO modifican el AttendanceRecord; solo calculan
 * la cobertura real de la jornada combinando asistencia + justificaciones aprobadas.
 *
 * Soporta turnos nocturnos (horarios que cruzan la medianoche, ej: 18:00 a 06:00).
 */

export const toMin = (t) => {
  if (!t) return 0;
  const [h, m] = String(t).slice(0, 5).split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
};

export const fromMin = (m) =>
  `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

/**
 * Calcula duración en minutos entre dos horas HH:mm,
 * manejando cruce de medianoche (si fin < inicio, suma 24h).
 */
export const calcDuration = (startMin, endMin) => {
  let d = endMin - startMin;
  if (d < 0) d += 1440;
  return d;
};

/**
 * Calcula la cobertura real de la jornada combinando los intervalos de
 * asistencia real y las justificaciones aprobadas, sin duplicar horas superpuestas.
 *
 * Soporta turnos nocturnos: cuando schedEnd < schedStart (ej: 18:00–06:00),
 * normaliza todos los tiempos relativos al inicio del turno para trabajar
 * en un espacio lineal [0, fullJornada].
 */
/**
 * Obtiene la primera entrada y la última salida registradas del día,
 * considerando todos los segmentos de marcación disponibles (1-4).
 * Devuelve { firstClockIn, lastClockOut } en formato "HH:mm" o null.
 */
export const getSegmentClockTimes = (record) => {
  if (!record) return { firstClockIn: null, lastClockOut: null };
  const segFields = [
    ["clock_in", "clock_out"],
    ["clock_in_2", "clock_out_2"],
    ["clock_in_3", "clock_out_3"],
    ["clock_in_4", "clock_out_4"],
  ];
  let firstClockIn = null;
  let lastClockOut = null;
  for (const [inField, outField] of segFields) {
    const ci = record[inField] ? String(record[inField]).slice(0, 5) : null;
    const co = record[outField] ? String(record[outField]).slice(0, 5) : null;
    if (ci && firstClockIn === null) firstClockIn = ci;
    if (co) lastClockOut = co;
  }
  return { firstClockIn, lastClockOut };
};

export function calcEffectiveMetrics({
  record,
  approvedIncidents = [],
  schedStart,
  schedEnd,
  breakMinutes = 60,
  breakStart = null,
  isUnscheduledDay = false,
}) {
  // ── Día libre / sin horario programado, con marcaciones válidas ──────────
  // Cuando no existe horario para la fecha (o es "Día libre"), no se recortan
  // las marcaciones a un horario predeterminado (09:00–18:00).
  //   Horas Marcadas = Σ (Salida − Entrada) por segmento (resta directa)
  //   Horas Efectivas = Horas Marcadas + Horas Justificadas − Refrigerio (una vez, ≥ 0)
  if (isUnscheduledDay) {
    const segFields = [
      ["clock_in", "clock_out"],
      ["clock_in_2", "clock_out_2"],
      ["clock_in_3", "clock_out_3"],
      ["clock_in_4", "clock_out_4"],
    ];
    let rawMins = 0;
    for (const [inField, outField] of segFields) {
      const ci = record?.[inField] ? String(record[inField]).slice(0, 5) : null;
      const co = record?.[outField] ? String(record[outField]).slice(0, 5) : null;
      if (ci && co) {
        let d = toMin(co) - toMin(ci);
        if (d < 0) d += 1440; // cruce de medianoche
        rawMins += Math.max(0, d);
      }
    }
    // Unión de intervalos justificados aprobados (sin duplicar superpuestos)
    const justIntervals = [];
    for (const inc of approvedIncidents) {
      if (inc.full_day_justification) continue; // sin horario → no se computa día completo
      const js = inc.justified_time_start;
      const je = inc.justified_time_end;
      if (!js || !je) continue;
      justIntervals.push([toMin(js), toMin(je)]);
    }
    justIntervals.sort((a, b) => a[0] - b[0]);
    const mergedJust = [];
    for (const [s, e] of justIntervals) {
      if (mergedJust.length === 0 || s > mergedJust[mergedJust.length - 1][1]) {
        mergedJust.push([s, e]);
      } else {
        mergedJust[mergedJust.length - 1][1] = Math.max(mergedJust[mergedJust.length - 1][1], e);
      }
    }
    let justMins = 0;
    for (const [s, e] of mergedJust) {
      let d = e - s;
      if (d < 0) d += 1440;
      justMins += Math.max(0, d);
    }
    const effectiveBreak = Math.max(0, breakMinutes);
    const totalMins = Math.max(0, rawMins + justMins - effectiveBreak);
    return {
      rawWorkedHours: rawMins / 60,
      justifiedHours: justMins / 60,
      totalWorkedHours: totalMins / 60,
      fullDayHours: 0,
      baseLateMinutes: 0,
      remainingLateMinutes: 0,
      lateMinutesJustified: 0,
      coverageMinutes: totalMins,
      intervals: [],
      isUnscheduledDay: true,
    };
  }

  const schedStartMin = toMin(schedStart);
  const schedEndMin   = toMin(schedEnd);
  const isNightShift  = schedEndMin < schedStartMin;

  const fullJornada = isNightShift
    ? (schedEndMin - schedStartMin + 1440)
    : Math.max(0, schedEndMin - schedStartMin);

  // Regla: si la jornada programada es menor a 6 horas (360 min), no se descuenta el break
  if (fullJornada < 360) breakMinutes = 0;

  // Normalize: for night shifts, maps times to shift-relative [0..1440) space
  const norm = (t) => {
    if (!isNightShift) return t;
    return (t - schedStartMin + 1440) % 1440;
  };

  const normSchedStart = isNightShift ? 0 : schedStartMin;
  const normSchedEnd   = isNightShift ? fullJornada : schedEndMin;

  // Break handling
  let effectiveBreakMin = 0;
  let normBreakStartVal = null;
  if (breakMinutes > 0) {
    if (breakStart) {
      const bsNorm = isNightShift ? norm(toMin(breakStart)) : toMin(breakStart);
      if (bsNorm <= normSchedEnd) {
        normBreakStartVal = bsNorm;
        const beNorm = bsNorm + breakMinutes;
        effectiveBreakMin = Math.max(0, Math.min(beNorm, normSchedEnd) - Math.max(bsNorm, normSchedStart));
      }
    } else {
      effectiveBreakMin = Math.min(breakMinutes, fullJornada);
    }
  }
  const fullDayMins = Math.max(0, fullJornada - effectiveBreakMin);

  // ── Build intervals in normalized space ─────────────────────────────────
  // Clock intervals: real marked time (all segments). NOT clipped to schedule
  // — pre-shift and post-shift time is preserved for additional-time calc.
  // Justified intervals: approved incidents (within schedule).
  // Kept separate so raw worked hours reflect only real presence and
  // justified hours are reported independently (per requirement).
  const segFields = [
    ["clock_in", "clock_out"],
    ["clock_in_2", "clock_out_2"],
    ["clock_in_3", "clock_out_3"],
    ["clock_in_4", "clock_out_4"],
  ];
  const clockIntervals = [];
  for (const [inField, outField] of segFields) {
    const ci = record?.[inField]  ? String(record[inField]).slice(0, 5)  : null;
    const co = record?.[outField] ? String(record[outField]).slice(0, 5) : null;
    if (ci && co) {
      let nIn  = norm(toMin(ci));
      let nOut = norm(toMin(co));
      if (isNightShift && nIn > fullJornada) nIn = 0; // pre-shift arrival
      if (nOut >= nIn) clockIntervals.push([nIn, nOut]);
    } else if (ci) {
      let nIn = norm(toMin(ci));
      if (isNightShift && nIn > fullJornada) nIn = 0;
      clockIntervals.push([nIn, normSchedEnd]);
    }
  }
  const justifiedIntervals = [];
  for (const inc of approvedIncidents) {
    if (inc.full_day_justification) {
      justifiedIntervals.push([normSchedStart, normSchedEnd]);
    } else {
      let jStart = norm(toMin(inc.justified_time_start || schedStart));
      let jEnd   = norm(toMin(inc.justified_time_end   || schedEnd));
      if (isNightShift && jStart > fullJornada) jStart = 0;
      if (jEnd > jStart) justifiedIntervals.push([jStart, jEnd]);
    }
  }

  // ── Pure helpers for interval math (reusable, documented) ───────────────
  /** Union-merge a list of [start, end] intervals (removes overlaps). */
  const mergeIntervals = (intervals) => {
    const sorted = [...intervals].filter(([s, e]) => e > s).sort((a, b) => a[0] - b[0]);
    const out = [];
    for (const [s, e] of sorted) {
      if (out.length === 0 || s > out[out.length - 1][1]) out.push([s, e]);
      else out[out.length - 1][1] = Math.max(out[out.length - 1][1], e);
    }
    return out;
  };
  /** Total duration (minutes) of merged intervals. */
  const unionDuration = (merged) => merged.reduce((sum, [s, e]) => sum + (e - s), 0);
  /** Minutes of break that overlap the given merged intervals. */
  const breakOverlapWith = (merged) => {
    if (normBreakStartVal === null || breakMinutes <= 0) return 0;
    const bEnd = normBreakStartVal + breakMinutes;
    let ov = 0;
    for (const [s, e] of merged) {
      const oS = Math.max(s, normBreakStartVal);
      const oE = Math.min(e, bEnd);
      if (oE > oS) ov += (oE - oS);
    }
    return ov;
  };
  /** Duration (minutes) of merged intervals within [lo, hi]. */
  const intersectionDuration = (merged, lo, hi) => {
    let total = 0;
    for (const [s, e] of merged) {
      const iS = Math.max(s, lo);
      const iE = Math.min(e, hi);
      if (iE > iS) total += (iE - iS);
    }
    return total;
  };
  /** Duration (minutes) of merged intervals outside [lo, hi] (before + after). */
  const outsideDuration = (merged, lo, hi) => {
    let total = 0;
    for (const [s, e] of merged) {
      if (s < lo) total += Math.min(e, lo) - s;
      if (e > hi) total += e - Math.max(s, hi);
    }
    return Math.max(0, total);
  };

  // ── Merge clock intervals (real marked time, no duplication) ────────────
  const mergedClock = mergeIntervals(clockIntervals);

  // ── Break deduction for raw clock time (applied once) ───────────────────
  // When breakStart is known: deduct only the overlap with clock intervals.
  // When breakStart is null: deduct the flat break amount (once).
  let rawBreakMin;
  if (normBreakStartVal !== null && breakMinutes > 0) {
    rawBreakMin = breakOverlapWith(mergedClock);
  } else if (breakMinutes > 0) {
    rawBreakMin = effectiveBreakMin;
  } else {
    rawBreakMin = 0;
  }

  // ── Raw worked hours: union of clock segments minus break (once) ────────
  // NOT capped at fullDayMins — reflects total real presence time.
  const rawWorkedMin = Math.max(0, unionDuration(mergedClock) - rawBreakMin);

  // ── Ordinary hours: marked time within schedule, minus break ────────────
  const rawOrdinaryMin = Math.max(0,
    intersectionDuration(mergedClock, normSchedStart, normSchedEnd) - rawBreakMin
  );

  // ── Additional minutes: marked time outside schedule (before + after) ──
  // Separated from authorized HE. Authorization does NOT alter this value.
  const additionalMin = outsideDuration(mergedClock, normSchedStart, normSchedEnd);

  // ── Coverage: clock + justified (union), clipped to schedule ────────────
  // Used for payroll worked-hours (ordinary + justified within jornada).
  const mergedCoverage = mergeIntervals([...clockIntervals, ...justifiedIntervals]);
  const mergedCoverageClipped = mergeIntervals(
    mergedCoverage.map(([s, e]) => [Math.max(s, normSchedStart), Math.min(e, normSchedEnd)])
  );
  let coverageMins = Math.max(0, unionDuration(mergedCoverageClipped) - breakOverlapWith(mergedCoverageClipped));
  if (normBreakStartVal === null && breakMinutes > 0 && coverageMins > fullJornada / 2) {
    coverageMins = Math.max(0, coverageMins - effectiveBreakMin);
  }
  const totalWorkedMins  = Math.min(coverageMins, fullDayMins);
  const totalWorkedHours = totalWorkedMins / 60;

  // ── Justified hours: ordinary coverage not coming from real marks ──────
  const justifiedHours = Math.max(0, totalWorkedHours - rawOrdinaryMin / 60);

  // ── Lateness (from earliest clock_in across all segments) ────────────────
  let earliestClockInNorm = null;
  for (const [inField] of segFields) {
    const ci = record?.[inField] ? String(record[inField]).slice(0, 5) : null;
    if (!ci) continue;
    let nIn = norm(toMin(ci));
    if (isNightShift && nIn > fullJornada) nIn = 0; // pre-shift arrival
    if (earliestClockInNorm === null || nIn < earliestClockInNorm) {
      earliestClockInNorm = nIn;
    }
  }
  let baseLateMin = 0;
  if (earliestClockInNorm !== null) {
    baseLateMin = (earliestClockInNorm <= fullJornada)
      ? Math.max(0, earliestClockInNorm - normSchedStart)
      : 0;
  }

  let effectiveStartMin = earliestClockInNorm;
  for (const inc of approvedIncidents) {
    if (inc.full_day_justification) {
      effectiveStartMin = normSchedStart;
      break;
    }
    let jStart = norm(toMin(inc.justified_time_start || schedStart));
    if (isNightShift && jStart > fullJornada) jStart = 0;
    if (effectiveStartMin === null || jStart < effectiveStartMin) {
      effectiveStartMin = jStart;
    }
  }

  const remainingLateMinutes =
    effectiveStartMin !== null
      ? Math.max(0, effectiveStartMin - normSchedStart)
      : baseLateMin;

  return {
    rawWorkedHours:        rawWorkedMin / 60,   // real marked time (union, minus break)
    ordinaryHours:         rawOrdinaryMin / 60, // marked time within schedule (minus break)
    additionalMinutes:     additionalMin,       // marked time outside schedule (pre + post)
    justifiedHours,                             // approved-incident time within schedule
    totalWorkedHours,                           // ordinary + justified (for payroll, capped at jornada)
    fullDayHours:          fullDayMins / 60,
    baseLateMinutes:       baseLateMin,
    remainingLateMinutes,
    lateMinutesJustified:  Math.max(0, baseLateMin - remainingLateMinutes),
    coverageMinutes:       totalWorkedMins,
    intervals:             mergedCoverageClipped,
  };
}

/**
 * Calcula las horas programadas (netas, después de break) para un registro.
 * Si el turno es mayor a 6h, descuenta 1h de break por defecto.
 * Soporta turnos nocturnos (cruce de medianoche).
 */
export const computeScheduledHours = (record) => {
  if (!record?.scheduled_start || !record?.scheduled_end) return 0;
  const start = toMin(record.scheduled_start);
  const end = toMin(record.scheduled_end);
  let diff = end - start;
  if (diff < 0) diff += 1440;
  const hours = diff / 60;
  const breakHours = hours > 6 ? 1 : 0;
  return Math.max(0, hours - breakHours);
};

export const getScheduleForDate = (schedule, date) => {
  if (!schedule) return null;
  const dayOfWeek = date.getDay();
  const dayMap = {
    0: ["sunday_start", "sunday_end"],
    1: ["monday_start", "monday_end"],
    2: ["tuesday_start", "tuesday_end"],
    3: ["wednesday_start", "wednesday_end"],
    4: ["thursday_start", "thursday_end"],
    5: ["friday_start", "friday_end"],
    6: ["saturday_start", "saturday_end"],
  };
  const [startField, endField] = dayMap[dayOfWeek];
  const start = schedule[startField];
  const end = schedule[endField];
  if (!start || !end) return null;
  return { start, end };
};

export const computeScheduledHoursFromSchedule = (schedule, date) => {
  const sched = getScheduleForDate(schedule, date);
  if (!sched) return 0;
  const startMin = toMin(sched.start);
  const endMin = toMin(sched.end);
  let diff = endMin - startMin;
  if (diff < 0) diff += 1440;
  const hours = diff / 60;
  const breakMin = schedule?.break_duration_minutes ?? 60;
  const breakHours = hours > 6 ? breakMin / 60 : 0;
  return Math.max(0, hours - breakHours);
};

/**
 * Minutos adicionales disponibles después de la hora programada de salida.
 * Usa la última salida registrada del día (todos los segmentos).
 * Soporta turnos nocturnos (cruce de medianoche).
 *
 * Entradas: record con clock_in/clock_out (1-4 segmentos) y scheduled_end.
 * Resultado: minutos trabajados después de scheduled_end (≥ 0).
 * Reglas: solo considera tiempo POSTERIOR al horario (para compensación de tardanza).
 */
export const getAdditionalMinutes = (record) => {
  if (!record) return 0;
  const { lastClockOut } = getSegmentClockTimes(record);
  if (!lastClockOut || !record.scheduled_end) return 0;
  const out = toMin(lastClockOut);
  const schedEnd = toMin(record.scheduled_end);
  if (out < schedEnd) return Math.max(0, out + 1440 - schedEnd);
  return Math.max(0, out - schedEnd);
};

/**
 * Minutos trabajados ANTES de la hora programada de entrada.
 * Usa la primera entrada registrada del día (todos los segmentos).
 *
 * Entradas: record con clock_in (1-4 segmentos) y scheduled_start.
 * Resultado: minutos de llegada anticipada (≥ 0).
 * Reglas: solo considera tiempo ANTERIOR al horario.
 */
export const getPreShiftMinutes = (record) => {
  if (!record) return 0;
  const { firstClockIn } = getSegmentClockTimes(record);
  if (!firstClockIn || !record.scheduled_start) return 0;
  return Math.max(0, toMin(record.scheduled_start) - toMin(firstClockIn));
};

/**
 * Tiempo adicional total (minutos fuera del horario programado).
 * Suma minutos previos a la entrada y posteriores a la salida.
 * Este valor es independiente de la autorización de HE.
 *
 * Entradas: record con marcaciones y scheduled_start/scheduled_end.
 * Resultado: minutos totales fuera del horario (pre + post).
 * Reglas: la autorización de HE no altera este valor.
 */
export const getTotalAdditionalMinutes = (record) => {
  return getPreShiftMinutes(record) + getAdditionalMinutes(record);
};

/**
 * Tardanza efectiva de un registro, descontando los minutos compensados
 * cuando la compensación está activa y la funcionalidad está habilitada.
 * No modifica late_minutes; solo calcula el valor efectivo en el punto de consumo.
 */
export const getEffectiveLateMinutes = (record, enableCompensation) => {
  if (!enableCompensation) return record?.late_minutes || 0;
  const compMin = record?.tardiness_compensation_status === "Activa"
    ? (record.tardiness_compensation_minutes || 0)
    : 0;
  return Math.max(0, (record?.late_minutes || 0) - compMin);
};

/**
 * Horas extras efectivas de un registro, descontando los minutos compensados
 * (que no deben contabilizarse simultáneamente como HE).
 * Descuenta primero de HE 25%, luego de HE 35%.
 */
export const getEffectiveOvertime = (record, enableCompensation) => {
  const ot25 = Number(record?.overtime_hours_25 || 0);
  const ot35 = Number(record?.overtime_hours_35 || 0);
  if (!enableCompensation) return { overtime_hours_25: ot25, overtime_hours_35: ot35 };
  const compMin = record?.tardiness_compensation_status === "Activa"
    ? (record.tardiness_compensation_minutes || 0)
    : 0;
  if (compMin <= 0) return { overtime_hours_25: ot25, overtime_hours_35: ot35 };
  const compHours = compMin / 60;
  const deduct25 = Math.min(ot25, compHours);
  const remainingComp = compHours - deduct25;
  const deduct35 = Math.min(ot35, remainingComp);
  return {
    overtime_hours_25: Math.max(0, ot25 - deduct25),
    overtime_hours_35: Math.max(0, ot35 - deduct35),
  };
};

export const computeScheduledHoursForPeriod = (schedule, startDateStr, endDateStr) => {
  if (!schedule) return 0;
  const start = new Date(startDateStr + "T00:00:00");
  const end = new Date(endDateStr + "T00:00:00");
  let total = 0;
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    total += computeScheduledHoursFromSchedule(schedule, d);
  }
  return total;
};