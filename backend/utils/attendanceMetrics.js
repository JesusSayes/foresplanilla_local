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
  const schedEndMin = toMin(schedEnd);
  const isNightShift = schedEndMin < schedStartMin;

  const fullJornada = isNightShift
    ? (schedEndMin - schedStartMin + 1440)
    : Math.max(0, schedEndMin - schedStartMin);

  // Regla: si la jornada programada es menor a 6 horas (360 min), no se descuenta el break
  if (fullJornada < 360) breakMinutes = 0;

  const norm = (t) => {
    if (!isNightShift) return t;
    return (t - schedStartMin + 1440) % 1440;
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

  const segFields = [
    ["clock_in", "clock_out"],
    ["clock_in_2", "clock_out_2"],
    ["clock_in_3", "clock_out_3"],
    ["clock_in_4", "clock_out_4"],
  ];
  const rawIntervals = [];
  for (const [inField, outField] of segFields) {
    const ci = record?.[inField] ? String(record[inField]).slice(0, 5) : null;
    const co = record?.[outField] ? String(record[outField]).slice(0, 5) : null;
    if (ci && co) {
      let nIn = norm(toMin(ci));
      let nOut = norm(toMin(co));
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
      let jEnd = norm(toMin(inc.justified_time_end || schedEnd));
      if (isNightShift && jStart > fullJornada) jStart = 0;
      if (jEnd > jStart) rawIntervals.push([jStart, jEnd]);
    }
  }

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

  let coverageMins = 0;
  for (const [s, e] of merged) {
    let segMins = e - s;
    if (normBreakStartVal !== null && breakMinutes > 0) {
      const overlapStart = Math.max(s, normBreakStartVal);
      const overlapEnd = Math.min(e, normBreakStartVal + breakMinutes);
      if (overlapEnd > overlapStart) segMins -= (overlapEnd - overlapStart);
    }
    coverageMins += Math.max(0, segMins);
  }

  if (normBreakStartVal === null && breakMinutes > 0 && coverageMins > fullJornada / 2) {
    coverageMins = Math.max(0, coverageMins - effectiveBreakMin);
  }

  const totalWorkedMins = Math.min(coverageMins, fullDayMins);
  const totalWorkedHours = totalWorkedMins / 60;

  let rawWorkedMin = 0;
  for (const [inField, outField] of segFields) {
    const ci = record?.[inField] ? String(record[inField]).slice(0, 5) : null;
    const co = record?.[outField] ? String(record[outField]).slice(0, 5) : null;
    if (ci && co) {
      let nIn = norm(toMin(ci));
      let nOut = norm(toMin(co));
      if (isNightShift && nIn > fullJornada) nIn = 0;
      rawWorkedMin += Math.max(0, nOut >= nIn ? nOut - nIn : 0);
    }
  }
  rawWorkedMin = Math.max(0, rawWorkedMin - effectiveBreakMin);
  rawWorkedMin = Math.min(rawWorkedMin, fullDayMins);

  const justifiedHours = Math.max(0, totalWorkedHours - rawWorkedMin / 60);

  let earliestClockInNorm = null;
  for (const [inField] of segFields) {
    const ci = record?.[inField] ? String(record[inField]).slice(0, 5) : null;
    if (!ci) continue;
    let nIn = norm(toMin(ci));
    if (isNightShift && nIn > fullJornada) nIn = 0;
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
    rawWorkedHours: rawWorkedMin / 60,
    justifiedHours,
    totalWorkedHours,
    fullDayHours: fullDayMins / 60,
    baseLateMinutes: baseLateMin,
    remainingLateMinutes,
    lateMinutesJustified: Math.max(0, baseLateMin - remainingLateMinutes),
    coverageMinutes: totalWorkedMins,
    intervals: merged,
  };
}

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

  const scheduledStart = schedule?.[dayStartMap[dow]] || "09:00";
  const scheduledEnd = schedule?.[dayEndMap[dow]] || "18:00";
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

  if (effective.rawWorkedHours > 0) {
    const scheduledStartMin = toMin(scheduledStart);
    const scheduledEndMin = toMin(scheduledEnd);
    const isNightShift = scheduledEndMin < scheduledStartMin;
    const fullJornada = isNightShift
      ? (scheduledEndMin - scheduledStartMin + 1440)
      : Math.max(0, scheduledEndMin - scheduledStartMin);
    const norm = (minutes) => isNightShift
      ? (minutes - scheduledStartMin + 1440) % 1440
      : minutes;
    const normSchedStart = isNightShift ? 0 : scheduledStartMin;
    const normSchedEnd = isNightShift ? fullJornada : scheduledEndMin;
    const normIn = norm(toMin(firstClockIn));
    const effectiveNormIn = (isNightShift && normIn > fullJornada) ? 0 : normIn;
    const effectiveBreakMinutes = fullJornada < 360 ? 0 : breakMinutes;

    const effectiveStart = Math.max(effectiveNormIn, normSchedStart);
    const regularMinutesMax = Math.max(0, normSchedEnd - effectiveStart - effectiveBreakMinutes);
    const extraHours = Math.max(0, effective.rawWorkedHours - regularMinutesMax / 60);
    if (overtimeAuthorized) {
      overtimeHours25 = Math.min(extraHours, 2);
      overtimeHours35 = Math.max(0, extraHours - 2);
    }
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
