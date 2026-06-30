import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

function getScheduleForDate(employeeId, departmentName, schedules, dateStr) {
  const candidates = schedules.filter(s => {
    if (!s.is_active) return false;
    const isForEmployee = s.employee_id === employeeId;
    const isForDept = !s.employee_id && departmentName &&
      (s.departments?.includes(departmentName) || s.department_name === departmentName);
    return isForEmployee || isForDept;
  });
  const empSchedules  = candidates.filter(s => s.employee_id === employeeId);
  const deptSchedules = candidates.filter(s => !s.employee_id);
  const findBest = (list) => {
    const valid = list.filter(s => {
      const from = s.effective_from || "0000-01-01";
      const to   = s.effective_to   || "9999-12-31";
      return from <= dateStr && to >= dateStr;
    });
    valid.sort((a, b) => (b.effective_from || "0000-01-01").localeCompare(a.effective_from || "0000-01-01"));
    return valid[0] || null;
  };
  return findBest(empSchedules) || findBest(deptSchedules) || null;
}

function calcularMetricas(record, schedule, dateStr, overtimeAuthorized) {
  const clockIn  = record.clock_in;
  const clockOut = record.clock_out;

  if (!clockIn) {
    return { worked_hours: 0, regular_hours: 0, overtime_hours_25: 0, overtime_hours_35: 0, is_late: false, late_minutes: 0, is_absent: record.status === "Ausente" };
  }

  const dow = new Date(dateStr + "T00:00:00").getDay();
  const dayStartMap = ["sunday_start","monday_start","tuesday_start","wednesday_start","thursday_start","friday_start","saturday_start"];
  const dayEndMap   = ["sunday_end","monday_end","tuesday_end","wednesday_end","thursday_end","friday_end","saturday_end"];

  const scheduledStart   = schedule ? (schedule[dayStartMap[dow]] || "09:00") : "09:00";
  const scheduledEnd     = schedule ? (schedule[dayEndMap[dow]]   || "18:00") : "18:00";
  const breakMinutes     = schedule?.break_duration_minutes ?? 60;
  const toleranceMinutes = schedule?.tolerance_minutes ?? 10;

  const [inH, inM]     = clockIn.split(":").map(Number);
  const inTotal        = inH * 60 + inM;
  const [schedH, schedM] = scheduledStart.split(":").map(Number);
  const schedTotal     = schedH * 60 + schedM;
  const [endH, endM]   = scheduledEnd.split(":").map(Number);
  const schedEndTotal  = endH * 60 + endM;

  // Tardanza: si supera tolerancia por 1+ min, se cuenta DESDE la hora programada (no desde el fin de tolerancia)
  const rawLate    = inTotal - schedTotal;
  const lateMinutes = rawLate > toleranceMinutes ? rawLate : 0;
  const isLate     = lateMinutes > 0;

  let workedHours = 0, regularHours = 0, overtimeHours25 = 0, overtimeHours35 = 0;

  if (clockOut) {
    const [outH, outM] = clockOut.split(":").map(Number);
    const outTotal     = outH * 60 + outM;
    const totalMinutes = outTotal - inTotal - breakMinutes;
    workedHours = Math.max(0, totalMinutes / 60);

    const regularMinutes = Math.max(0, schedEndTotal - Math.max(inTotal, schedTotal) - breakMinutes);
    const normalHoursMax = regularMinutes / 60;

    if (workedHours <= normalHoursMax) {
      regularHours = workedHours;
    } else {
      regularHours = normalHoursMax;
      const extraHours = workedHours - normalHoursMax;
      if (overtimeAuthorized) {
        overtimeHours25 = Math.min(extraHours, 2);
        overtimeHours35 = Math.max(0, extraHours - 2);
      }
    }
  }

  return { worked_hours: workedHours, regular_hours: regularHours, overtime_hours_25: overtimeHours25, overtime_hours_35: overtimeHours35, is_late: isLate, late_minutes: lateMinutes, is_absent: false, scheduled_start: scheduledStart, scheduled_end: scheduledEnd };
}

function parseSDKResponse(raw) {
  if (Array.isArray(raw)) return raw;
  if (raw == null) return [];
  if (typeof raw === "object") {
    const vals = Object.values(raw);
    return (vals.length > 0 && typeof vals[0] === "object" && vals[0] !== null) ? vals : [];
  }
  if (typeof raw === "string") {
    try { const p = JSON.parse(raw); return Array.isArray(p) ? p : Object.values(p); } catch { return []; }
  }
  return [];
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const callerEmp = await base44.asServiceRole.entities.Employee.filter({ work_email: user.email });
    const callerRole = callerEmp?.[0]?.role;
    if (!['admin', 'super_admin'].includes(callerRole)) return Response.json({ error: 'Forbidden' }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const { date_from, date_to } = body;

    const [employeesRaw, schedulesRaw] = await Promise.all([
      base44.asServiceRole.entities.Employee.list("-created_date"),
      base44.asServiceRole.entities.WorkSchedule.list("-effective_from"),
    ]);
    const allEmployees = parseSDKResponse(employeesRaw);
    const allSchedules = parseSDKResponse(schedulesRaw);

    // Cargar registros con paginación (500 por página)
    let allRecords = [];
    const PAGE = 500;
    let skip = 0;
    while (true) {
      const raw = await base44.asServiceRole.entities.AttendanceRecord.list("-date", PAGE, skip);
      const page = parseSDKResponse(raw);
      if (page.length === 0) break;
      allRecords = allRecords.concat(page);
      if (page.length < PAGE) break;
      skip += PAGE;
      await new Promise(r => setTimeout(r, 200));
    }

    const incidentsRaw = await base44.asServiceRole.entities.AttendanceIncident.filter({ status: "Aprobada" }, "-incident_date", 3000);
    const allIncidents = parseSDKResponse(incidentsRaw);

    // Filtrar por rango si se especificó
    if (date_from && date_to) {
      allRecords = allRecords.filter(r => r.date >= date_from && r.date <= date_to);
    }

    // Índice de incidentes aprobados por employee_id + date
    const approvedIdx = {};
    allIncidents.forEach(i => {
      approvedIdx[`${i.employee_id}_${i.incident_date}`] = true;
    });

    // Índice de empleados por id
    const empById = {};
    allEmployees.forEach(e => { empById[e.id] = e; });

    let updated = 0;
    let skipped = 0;

    // Preparar todas las actualizaciones
    const updates = [];
    for (const record of allRecords) {
      if (record.status === "Vacaciones") { skipped++; continue; }
      const emp = empById[record.employee_id];
      if (!emp) { skipped++; continue; }

      const schedule = getScheduleForDate(record.employee_id, emp.department_name, allSchedules, record.date);
      const overtimeAuth = record.overtime_authorized ?? schedule?.overtime_authorized ?? false;
      const metrics = calcularMetricas(record, schedule, record.date, overtimeAuth);
      const hasApprovedIncident = !!approvedIdx[`${record.employee_id}_${record.date}`];

      let status;
      if (hasApprovedIncident || record.status === "Justificado") {
        status = "Justificado";
      } else if (record.clock_in && record.clock_out) {
        status = "Completo";
      } else if (record.clock_in && !record.clock_out) {
        status = "Incompleto";
      } else {
        status = "Ausente";
      }

      updates.push({ id: record.id, data: {
        worked_hours:      metrics.worked_hours,
        regular_hours:     metrics.regular_hours,
        overtime_hours_25: metrics.overtime_hours_25,
        overtime_hours_35: metrics.overtime_hours_35,
        is_late:           metrics.is_late,
        late_minutes:      metrics.late_minutes,
        is_absent:         metrics.is_absent,
        scheduled_start:   metrics.scheduled_start || record.scheduled_start,
        scheduled_end:     metrics.scheduled_end   || record.scheduled_end,
        status,
      }});
    }

    // Procesar en lotes paralelos de 5
    const BATCH = 5;
    for (let i = 0; i < updates.length; i += BATCH) {
      const batch = updates.slice(i, i + BATCH);
      await Promise.all(batch.map(u =>
        base44.asServiceRole.entities.AttendanceRecord.update(u.id, u.data)
      ));
      updated += batch.length;
      // Pequeña pausa entre lotes para evitar rate limit
      if (i + BATCH < updates.length) await new Promise(r => setTimeout(r, 100));
    }

    return Response.json({ success: true, updated, skipped, total: allRecords.length });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});