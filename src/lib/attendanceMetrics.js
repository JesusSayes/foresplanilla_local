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

  // ── Build intervals in normalized space ──────────────────────────────────
  const rawIntervals = [];
  const clockIn  = record?.clock_in  ? String(record.clock_in).slice(0, 5)  : null;
  const clockOut = record?.clock_out ? String(record.clock_out).slice(0, 5) : null;

  if (clockIn && clockOut) {
    let nIn  = norm(toMin(clockIn));
    let nOut = norm(toMin(clockOut));
    // Pre-shift clock-in: treat as arriving at shift start
    if (isNightShift && nIn > fullJornada) nIn = 0;
    if (nOut >= nIn) rawIntervals.push([nIn, nOut]);
  } else if (clockIn) {
    let nIn = norm(toMin(clockIn));
    if (isNightShift && nIn > fullJornada) nIn = 0;
    rawIntervals.push([nIn, normSchedEnd]);
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

  // ── Raw worked hours (clock-based only) ─────────────────────────────────
  let rawWorkedMin = 0;
  if (clockIn && clockOut) {
    let nIn  = norm(toMin(clockIn));
    let nOut = norm(toMin(clockOut));
    if (isNightShift && nIn > fullJornada) nIn = 0;
    const rawTotal = nOut >= nIn ? nOut - nIn : 0;
    rawWorkedMin = Math.max(0, rawTotal - effectiveBreakMin);
    rawWorkedMin = Math.min(rawWorkedMin, fullDayMins);
  }

  const justifiedHours = Math.max(0, totalWorkedHours - rawWorkedMin / 60);

  // ── Lateness ────────────────────────────────────────────────────────────
  let baseLateMin = 0;
  if (clockIn) {
    const nIn = norm(toMin(clockIn));
    // Only late if within the shift window (pre-shift arrivals = not late)
    baseLateMin = (nIn <= fullJornada) ? Math.max(0, nIn - normSchedStart) : 0;
  }

  let effectiveStartMin = clockIn ? norm(toMin(clockIn)) : null;
  if (effectiveStartMin !== null && isNightShift && effectiveStartMin > fullJornada) {
    effectiveStartMin = 0;
  }
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