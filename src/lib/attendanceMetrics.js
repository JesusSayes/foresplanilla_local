/**
 * Utilitarios de cálculo de métricas de asistencia.
 * Estos métodos NO modifican el AttendanceRecord; solo calculan
 * la cobertura real de la jornada combinando asistencia + justificaciones aprobadas.
 */

export const toMin = (t) => {
  if (!t) return 0;
  const [h, m] = String(t).slice(0, 5).split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
};

export const fromMin = (m) =>
  `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

/**
 * Calcula la cobertura real de la jornada combinando los intervalos de
 * asistencia real y las justificaciones aprobadas, sin duplicar horas superpuestas.
 *
 * Algoritmo:
 *  1. Construir lista de intervalos cubiertos: [clock_in, clock_out] + cada [just_start, just_end]
 *  2. Intersectarlos con [schedStart, schedEnd] (no contar fuera de jornada)
 *  3. Fusionar intervalos solapados (union de segmentos)
 *  4. Restar el break si cae dentro de la cobertura
 *  5. Calcular tardanza efectiva: max(0, min(clock_in_real, primer_inicio_justificado) - schedStart)
 *
 * @param {object} params
 * @param {object|null}   params.record            - AttendanceRecord del día
 * @param {object[]}      params.approvedIncidents  - Incidentes aprobados del día
 * @param {string}        params.schedStart         - "HH:mm" inicio jornada
 * @param {string}        params.schedEnd           - "HH:mm" fin jornada
 * @param {number}        params.breakMinutes        - Minutos de refrigerio
 * @param {string|null}   params.breakStart          - "HH:mm" inicio refrigerio (opcional)
 * @returns {{ rawWorkedHours, justifiedHours, totalWorkedHours, fullDayHours,
 *             baseLateMinutes, remainingLateMinutes, lateMinutesJustified,
 *             coverageMinutes, intervals }}
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
  const fullJornada   = Math.max(0, schedEndMin - schedStartMin);

  // Minutos de refrigerio que caen dentro de la jornada
  let effectiveBreakMin = 0;
  if (breakMinutes > 0) {
    if (breakStart) {
      const bsMin = toMin(breakStart);
      const beMin = bsMin + breakMinutes;
      // Solo contar la parte del break que cae dentro de la jornada
      effectiveBreakMin = Math.max(0, Math.min(beMin, schedEndMin) - Math.max(bsMin, schedStartMin));
    } else {
      // Sin hora de inicio de break: asumir que está incluido en la jornada
      effectiveBreakMin = Math.min(breakMinutes, fullJornada);
    }
  }
  const fullDayMins = Math.max(0, fullJornada - effectiveBreakMin);

  // ── Construir intervalos brutos ──────────────────────────────────────────
  const rawIntervals = [];

  const clockIn  = record?.clock_in  ? String(record.clock_in).slice(0, 5)  : null;
  const clockOut = record?.clock_out ? String(record.clock_out).slice(0, 5) : null;

  if (clockIn && clockOut) {
    rawIntervals.push([toMin(clockIn), toMin(clockOut)]);
  } else if (clockIn) {
    // Solo entrada: cuenta hasta el fin de jornada (jornada incompleta)
    rawIntervals.push([toMin(clockIn), schedEndMin]);
  }

  for (const inc of approvedIncidents) {
    if (inc.full_day_justification) {
      rawIntervals.push([schedStartMin, schedEndMin]);
    } else {
      const jStart = toMin(inc.justified_time_start || schedStart);
      const jEnd   = toMin(inc.justified_time_end   || schedEnd);
      if (jEnd > jStart) rawIntervals.push([jStart, jEnd]);
    }
  }

  // ── Intersectar con jornada y fusionar ──────────────────────────────────
  const clipped = rawIntervals
    .map(([s, e]) => [Math.max(s, schedStartMin), Math.min(e, schedEndMin)])
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

  // ── Calcular cobertura neta (restando break) ─────────────────────────────
  let coverageMins = 0;
  for (const [s, e] of merged) {
    let segMins = e - s;
    // Si el break cae dentro de este segmento, descontarlo
    if (breakStart && breakMinutes > 0) {
      const bsMin = toMin(breakStart);
      const beMin = bsMin + breakMinutes;
      const overlapStart = Math.max(s, bsMin);
      const overlapEnd   = Math.min(e, beMin);
      if (overlapEnd > overlapStart) segMins -= (overlapEnd - overlapStart);
    }
    coverageMins += Math.max(0, segMins);
  }

  // Si no hay hora de inicio de break, el break se descuenta solo si la cobertura supera la media jornada
  // (simplificación estándar: el break se descuenta si el empleado trabajó más de la mitad de la jornada)
  if (!breakStart && breakMinutes > 0 && coverageMins > fullJornada / 2) {
    coverageMins = Math.max(0, coverageMins - effectiveBreakMin);
  }

  const totalWorkedMins  = Math.min(coverageMins, fullDayMins);
  const totalWorkedHours = totalWorkedMins / 60;

  // ── Horas marcadas reales (sin justificaciones) ──────────────────────────
  let rawWorkedMin = 0;
  if (clockIn && clockOut) {
    const rawTotal = toMin(clockOut) - toMin(clockIn);
    rawWorkedMin = Math.max(0, rawTotal - effectiveBreakMin);
    // Limitar a la jornada
    rawWorkedMin = Math.min(rawWorkedMin, fullDayMins);
  }

  // ── Horas justificadas (cobertura adicional aportada por justificaciones) ─
  const justifiedHours = Math.max(0, totalWorkedHours - rawWorkedMin / 60);

  // ── Tardanza ─────────────────────────────────────────────────────────────
  // Tardanza base: cuánto tarde llegó el empleado según su marcación real
  const baseLateMin = clockIn ? Math.max(0, toMin(clockIn) - schedStartMin) : 0;

  // Inicio efectivo: el más temprano entre clock_in y cualquier justificación que empiece antes
  let effectiveStartMin = clockIn ? toMin(clockIn) : null;
  for (const inc of approvedIncidents) {
    if (inc.full_day_justification) {
      effectiveStartMin = schedStartMin;
      break;
    }
    const jStart = toMin(inc.justified_time_start || schedStart);
    if (effectiveStartMin === null || jStart < effectiveStartMin) {
      effectiveStartMin = jStart;
    }
  }

  const remainingLateMinutes =
    effectiveStartMin !== null
      ? Math.max(0, effectiveStartMin - schedStartMin)
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