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
  const clockIns = [];
  const clockOuts = [];
  for (const [inField, outField] of segFields) {
    const ci = record[inField] ? String(record[inField]).slice(0, 5) : null;
    const co = record[outField] ? String(record[outField]).slice(0, 5) : null;
    if (ci) clockIns.push(ci);
    if (co) clockOuts.push(co);
  }
  clockIns.sort((a, b) => toMin(a) - toMin(b));
  clockOuts.sort((a, b) => toMin(a) - toMin(b));
  return {
    firstClockIn: clockIns[0] || null,
    lastClockOut: clockOuts[clockOuts.length - 1] || null,
  };
};

export function calcEffectiveMetrics({
  record,
  approvedIncidents = [],
  schedStart,
  schedEnd,
  breakMinutes = 60,
  breakStart = null,
}) {
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

  // ── Build intervals in normalized space (all segments) ───────────────────
  const segFields = [
    ["clock_in", "clock_out"],
    ["clock_in_2", "clock_out_2"],
    ["clock_in_3", "clock_out_3"],
    ["clock_in_4", "clock_out_4"],
  ];
  const rawIntervals = [];
  for (const [inField, outField] of segFields) {
    const ci = record?.[inField]  ? String(record[inField]).slice(0, 5)  : null;
    const co = record?.[outField] ? String(record[outField]).slice(0, 5) : null;
    if (ci && co) {
      let nIn  = norm(toMin(ci));
      let nOut = norm(toMin(co));
      // Pre-shift clock-in: treat as arriving at shift start
      if (isNightShift && nIn > fullJornada) nIn = 0;
      if (nOut >= nIn) rawIntervals.push([nIn, nOut]);
    } else if (ci) {
      let nIn = norm(toMin(ci));
      if (isNightShift && nIn > fullJornada) nIn = 0;
      rawIntervals.push([nIn, normSchedEnd]);
    }
  }

  for (const inc of approvedIncidents) {
    if (inc.full_day_justification) {
      rawIntervals.push([normSchedStart, normSchedEnd]);
    } else {
      let jStart = norm(toMin(inc.justified_time_start || schedStart));
      let jEnd   = norm(toMin(inc.justified_time_end   || schedEnd));
      if (isNightShift && jStart > fullJornada) jStart = 0;
      if (jEnd > jStart) rawIntervals.push([jStart, jEnd]);
    }
  }

  // ── Clip to schedule and merge ──────────────────────────────────────────
  const clipped = rawIntervals
    .map(([s, e]) => [Math.max(s, normSchedStart), Math.min(e, normSchedEnd)])
    .filter(([s, e]) => e > s);
  clipped.sort((a, b) => a[0] - b[0]);

  const merged = [];
  for (const [s, e] of clipped) {
    if (merged.length === 0 || s > merged[merged.length - 1][1]) {
      merged.push([s, e]);
    } else {
      merged[merged.length - 1][1] = Math.max(merged[merged.length - 1][1], e);
    }
  }

  // ── Coverage minus break ────────────────────────────────────────────────
  let coverageMins = 0;
  for (const [s, e] of merged) {
    let segMins = e - s;
    if (normBreakStartVal !== null && breakMinutes > 0) {
      const overlapStart = Math.max(s, normBreakStartVal);
      const overlapEnd   = Math.min(e, normBreakStartVal + breakMinutes);
      if (overlapEnd > overlapStart) segMins -= (overlapEnd - overlapStart);
    }
    coverageMins += Math.max(0, segMins);
  }

  if (normBreakStartVal === null && breakMinutes > 0 && coverageMins > fullJornada / 2) {
    coverageMins = Math.max(0, coverageMins - effectiveBreakMin);
  }

  const totalWorkedMins  = Math.min(coverageMins, fullDayMins);
  const totalWorkedHours = totalWorkedMins / 60;

  // ── Raw worked hours (clock-based only, sum of all segment pairs) ────────
  let rawWorkedMin = 0;
  for (const [inField, outField] of segFields) {
    const ci = record?.[inField]  ? String(record[inField]).slice(0, 5)  : null;
    const co = record?.[outField] ? String(record[outField]).slice(0, 5) : null;
    if (ci && co) {
      let nIn  = norm(toMin(ci));
      let nOut = norm(toMin(co));
      if (isNightShift && nIn > fullJornada) nIn = 0;
      rawWorkedMin += Math.max(0, nOut >= nIn ? nOut - nIn : 0);
    }
  }
  // Discount break once for the whole day
  rawWorkedMin = Math.max(0, rawWorkedMin - effectiveBreakMin);
  rawWorkedMin = Math.min(rawWorkedMin, fullDayMins);

  const justifiedHours = Math.max(0, totalWorkedHours - rawWorkedMin / 60);

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
    rawWorkedHours:        rawWorkedMin / 60,
    justifiedHours,
    totalWorkedHours,
    fullDayHours:          fullDayMins / 60,
    baseLateMinutes:       baseLateMin,
    remainingLateMinutes,
    lateMinutesJustified:  Math.max(0, baseLateMin - remainingLateMinutes),
    coverageMinutes:       totalWorkedMins,
    intervals:             merged,
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
