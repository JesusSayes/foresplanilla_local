import { toDateString } from "./employmentDate.js";

export const toMin = (t) => {
  if (!t) return 0;
  const [h, m] = String(t).slice(0, 5).split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
};

export const fromMin = (m) =>
  `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

export const calcDuration = (startMin, endMin) => {
  let d = endMin - startMin;
  if (d < 0) d += 1440;
  return d;
};

export const getSegmentClockTimes = (record) => {
  if (!record) return { firstClockIn: null, lastClockOut: null };
  const segFields = [
    ["clock_in", "clock_out"],
    ["clock_in_2", "clock_out_2"],
    ["clock_in_3", "clock_out_3"],
    ["clock_in_4", "clock_out_4"],
  ];
  const start = toMin(record.scheduled_start);
  const end = toMin(record.scheduled_end);
  const nightShift = Boolean(record.scheduled_start && record.scheduled_end) && end < start;
  const chronological = value => {
    const minutes = toMin(value);
    return nightShift && minutes < (start + end) / 2 ? minutes + 1440 : minutes;
  };
  let firstClockInMin = null;
  let lastClockOutMin = null;
  for (const [inField, outField] of segFields) {
    const ci = record[inField] ? String(record[inField]).slice(0, 5) : null;
    const co = record[outField] ? String(record[outField]).slice(0, 5) : null;
    if (ci) {
      const inMin = chronological(ci);
      if (firstClockInMin === null || inMin < firstClockInMin) firstClockInMin = inMin;
    }
    if (co) {
      let outMin = chronological(co);
      // If clock_out < clock_in of the same segment, it crosses midnight
      if (ci) {
        const inMin = chronological(ci);
        if (outMin < inMin) outMin += 1440;
      }
      if (lastClockOutMin === null || outMin > lastClockOutMin) lastClockOutMin = outMin;
    }
  }
  const firstClockIn = firstClockInMin !== null ? fromMin(firstClockInMin % 1440) : null;
  const lastClockOut = lastClockOutMin !== null ? fromMin(lastClockOutMin % 1440) : null;
  return { firstClockIn, lastClockOut };
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
  const schedEndMin = toMin(schedEnd);
  const isNightShift = schedEndMin < schedStartMin;

  const fullJornada = isNightShift
    ? (schedEndMin - schedStartMin + 1440)
    : Math.max(0, schedEndMin - schedStartMin);

  // Regla: si la jornada programada es menor a 6 horas (360 min), no se descuenta el break
  if (fullJornada < 360) breakMinutes = 0;

  const norm = (t) => {
    if (!isNightShift) return t;
    return t < (schedStartMin + schedEndMin) / 2
      ? t + 1440 - schedStartMin
      : t - schedStartMin;
  };

  const normSchedStart = isNightShift ? 0 : schedStartMin;
  const normSchedEnd = isNightShift ? fullJornada : schedEndMin;

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

      // Midnight-crossing segment (even for diurnal shifts):
      // if clock_out < clock_in, the end is the next day.
      if (nOut < nIn) nOut += 1440;
      if (nOut >= nIn) clockIntervals.push([nIn, nOut]);
    }
    // Marcaciones incompletas (solo entrada, sin salida): NO se inventa una
    // salida. El segmento no contribuye a horas trabajadas ni a cobertura.
    // La tardanza sí se calcula desde la entrada (ver sección de tardanza).
  }
  const justifiedIntervals = [];
  for (const inc of approvedIncidents) {
    if (inc.full_day_justification) {
      justifiedIntervals.push([normSchedStart, normSchedEnd]);
    } else {
      let jStart = norm(toMin(inc.justified_time_start || schedStart));
      let jEnd   = norm(toMin(inc.justified_time_end   || schedEnd));

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

  let earliestClockInNorm = null;
  for (const [inField] of segFields) {
    const ci = record?.[inField] ? String(record[inField]).slice(0, 5) : null;
    if (!ci) continue;
    let nIn = norm(toMin(ci));

    if (earliestClockInNorm === null || nIn < earliestClockInNorm) {
      earliestClockInNorm = nIn;
    }
  }
  let baseLateMin = 0;
  if (earliestClockInNorm !== null) {
    baseLateMin = earliestClockInNorm <= fullJornada
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

    if (effectiveStartMin === null || jStart < effectiveStartMin) {
      effectiveStartMin = jStart;
    }
  }

  const remainingLateMinutes =
    effectiveStartMin !== null
      ? Math.max(0, effectiveStartMin - normSchedStart)
      : baseLateMin;

  return {
    rawWorkedHours: rawWorkedMin / 60,
    ordinaryHours: rawOrdinaryMin / 60,
    additionalMinutes: additionalMin,
    justifiedHours,
    totalWorkedHours,
    fullDayHours: fullDayMins / 60,
    baseLateMinutes: baseLateMin,
    remainingLateMinutes,
    lateMinutesJustified: Math.max(0, baseLateMin - remainingLateMinutes),
    coverageMinutes: totalWorkedMins,
    intervals: mergedCoverageClipped,
  };
}

export const getPreShiftMinutes = (record) => {
  if (!record) return 0;
  const { firstClockIn } = getSegmentClockTimes(record);
  if (!firstClockIn || !record.scheduled_start) return 0;
  const start = toMin(record.scheduled_start);
  const end = toMin(record.scheduled_end);
  let first = toMin(firstClockIn);
  if (record.scheduled_end && end < start && first < (start + end) / 2) first += 1440;
  return Math.max(0, start - first);
};

export const getAdditionalMinutes = (record) => {
  if (!record || !record.scheduled_end) return 0;
  const schedStartMin = toMin(record.scheduled_start || "00:00");
  const schedEndMin   = toMin(record.scheduled_end);
  const isNightShift  = schedEndMin < schedStartMin;
  const fullJornada   = isNightShift
    ? (schedEndMin - schedStartMin + 1440)
    : Math.max(0, schedEndMin - schedStartMin);
  const norm = (t) => isNightShift
    ? (t < (schedStartMin + schedEndMin) / 2 ? t + 1440 : t) - schedStartMin
    : t;
  const normSchedEnd = isNightShift ? fullJornada : schedEndMin;

  const segFields = [
    ["clock_in", "clock_out"],
    ["clock_in_2", "clock_out_2"],
    ["clock_in_3", "clock_out_3"],
    ["clock_in_4", "clock_out_4"],
  ];
  const intervals = [];
  for (const [inField, outField] of segFields) {
    const ci = record[inField]  ? String(record[inField]).slice(0, 5)  : null;
    const co = record[outField] ? String(record[outField]).slice(0, 5) : null;
    if (!ci || !co) continue;
    let nIn  = norm(toMin(ci));
    let nOut = norm(toMin(co));

    if (nOut < nIn) nOut += 1440; // midnight crossing
    if (nOut > normSchedEnd) {
      intervals.push([Math.max(nIn, normSchedEnd), nOut]);
    }
  }
  // Merge overlapping intervals (no duplication)
  intervals.sort((a, b) => a[0] - b[0]);
  const merged = [];
  for (const [s, e] of intervals) {
    if (merged.length === 0 || s > merged[merged.length - 1][1]) merged.push([s, e]);
    else merged[merged.length - 1][1] = Math.max(merged[merged.length - 1][1], e);
  }
  return merged.reduce((sum, [s, e]) => sum + (e - s), 0);
};


export function getScheduleForDate(employeeId, departmentName, schedules, dateStr) {
  const targetDate = toDateString(dateStr);
  if (!targetDate) return null;

  const candidates = schedules.filter(s => {
    if (!s.is_active) return false;

    const isForEmployee = s.employee_id === employeeId;

    const isForDept =
      !s.employee_id &&
      departmentName &&
      (
        s.departments?.includes(departmentName) ||
        s.department_name === departmentName
      );

    return isForEmployee || isForDept;
  });

  const empSchedules = candidates.filter(s => s.employee_id === employeeId);
  const deptSchedules = candidates.filter(s => !s.employee_id);

  const findBest = (list) => {
    const valid = list.filter(s => {
      const from = toDateString(s.effective_from) || "0000-01-01";
      const to = toDateString(s.effective_to) || "9999-12-31";

      return from <= targetDate && to >= targetDate;
    });

    valid.sort((a, b) =>
      (toDateString(b.effective_from) || "0000-01-01")
        .localeCompare(toDateString(a.effective_from) || "0000-01-01")
    );

    return valid[0] || null;
  };

  return findBest(empSchedules) || findBest(deptSchedules) || null;
}

export function calcularMetricas(record, schedule, dateStr, overtimeAuthorized, approvedIncidents = []) {
  const { firstClockIn } = getSegmentClockTimes(record);
  const hasClockIn = Boolean(firstClockIn);

  const dow = new Date(dateStr + "T00:00:00").getDay();

  const dayStartMap = [
    "sunday_start",
    "monday_start",
    "tuesday_start",
    "wednesday_start",
    "thursday_start",
    "friday_start",
    "saturday_start",
  ];

  const dayEndMap = [
    "sunday_end",
    "monday_end",
    "tuesday_end",
    "wednesday_end",
    "thursday_end",
    "friday_end",
    "saturday_end",
  ];

  const scheduledStart = schedule?.[dayStartMap[dow]]?.trim() || null;
  const scheduledEnd = schedule?.[dayEndMap[dow]]?.trim() || null;
  if (!scheduledStart || !scheduledEnd) {
    return {
      worked_hours: 0, regular_hours: 0, overtime_hours_25: 0, overtime_hours_35: 0,
      is_late: false, late_minutes: 0, is_absent: false,
      scheduled_start: null, scheduled_end: null,
    };
  }
  const breakMinutes = schedule?.break_duration_minutes ?? 60;
  const breakStart = schedule?.break_start ?? null;
  const toleranceMinutes = schedule?.tolerance_minutes ?? 10;

  const effective = calcEffectiveMetrics({
    record,
    approvedIncidents,
    schedStart: scheduledStart,
    schedEnd: scheduledEnd,
    breakMinutes,
    breakStart,
  });

  const lateMinutes = effective.remainingLateMinutes > toleranceMinutes
    ? effective.remainingLateMinutes
    : 0;
  const isLate = lateMinutes > 0;

  const regularHours = Math.min(effective.totalWorkedHours, effective.fullDayHours);
  let overtimeHours25 = 0;
  let overtimeHours35 = 0;

  if (overtimeAuthorized) {
    const extraHours = effective.additionalMinutes / 60;
    overtimeHours25 = Math.min(extraHours, 2);
    overtimeHours35 = Math.max(0, extraHours - 2);
  }

  const workedHours = regularHours + overtimeHours25 + overtimeHours35;

  return {
    worked_hours: workedHours,
    regular_hours: regularHours,
    overtime_hours_25: overtimeHours25,
    overtime_hours_35: overtimeHours35,
    is_late: isLate,
    late_minutes: lateMinutes,
    is_absent: !hasClockIn && effective.totalWorkedHours === 0 && record.status === "Ausente",
    scheduled_start: scheduledStart,
    scheduled_end: scheduledEnd,
  };
}
