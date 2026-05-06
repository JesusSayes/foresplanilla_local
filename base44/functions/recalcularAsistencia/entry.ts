import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

// Obtener el horario vigente de un empleado en una fecha dada
function getScheduleForDate(employeeId, departmentName, schedules, dateStr) {
  const candidates = schedules.filter(s => {
    if (!s.is_active) return false;
    const isForEmployee = s.employee_id === employeeId;
    const isForDept = !s.employee_id && departmentName &&
      (s.departments?.includes(departmentName) || s.department_name === departmentName);
    return isForEmployee || isForDept;
  });

  const empSchedules = candidates.filter(s => s.employee_id === employeeId);
  const deptSchedules = candidates.filter(s => !s.employee_id);

  const findBest = (list) => {
    const valid = list.filter(s => {
      const from = s.effective_from || "0000-01-01";
      const to = s.effective_to || "9999-12-31";
      return from <= dateStr && to >= dateStr;
    });
    valid.sort((a, b) => (b.effective_from || "0000-01-01").localeCompare(a.effective_from || "0000-01-01"));
    return valid[0] || null;
  };

  return findBest(empSchedules) || findBest(deptSchedules) || null;
}

// Calcular métricas completas: tardanza, horas regulares, HE 25% y HE 35%
// Regla Peruana: primeras 2h extra → 25%, a partir de la 3ra → 35%
function calcularMetricas(record, schedule, dateStr, overtimeAuthorized) {
  const clockIn = record.clock_in;
  const clockOut = record.clock_out;

  // Sin entrada → todo en cero
  if (!clockIn) {
    return {
      worked_hours: 0,
      regular_hours: 0,
      overtime_hours_25: 0,
      overtime_hours_35: 0,
      is_late: false,
      late_minutes: 0,
      is_absent: record.status === "Ausente",
    };
  }

  const dow = new Date(dateStr + "T00:00:00").getDay();
  const dayStartMap = ["sunday_start","monday_start","tuesday_start","wednesday_start","thursday_start","friday_start","saturday_start"];
  const dayEndMap   = ["sunday_end","monday_end","tuesday_end","wednesday_end","thursday_end","friday_end","saturday_end"];

  const scheduledStart  = schedule ? (schedule[dayStartMap[dow]] || "09:00") : "09:00";
  const scheduledEnd    = schedule ? (schedule[dayEndMap[dow]]   || "18:00") : "18:00";
  const breakMinutes    = schedule?.break_duration_minutes ?? 60;
  const toleranceMinutes = schedule?.tolerance_minutes ?? 10;

  const [inH, inM]     = clockIn.split(":").map(Number);
  const inTotal        = inH * 60 + inM;
  const [schedH, schedM] = scheduledStart.split(":").map(Number);
  const schedTotal     = schedH * 60 + schedM;
  const [endH, endM]   = scheduledEnd.split(":").map(Number);
  const schedEndTotal  = endH * 60 + endM;

  // Tardanza: se calcula con solo clock_in
  const rawLate    = inTotal - schedTotal;
  const lateMinutes = rawLate > toleranceMinutes ? rawLate : 0;
  const isLate     = lateMinutes > 0;

  let workedHours = 0;
  let regularHours = 0;
  let overtimeHours25 = 0;
  let overtimeHours35 = 0;

  // Horas trabajadas y extras: solo cuando hay clock_out
  if (clockOut) {
    const [outH, outM] = clockOut.split(":").map(Number);
    const outTotal     = outH * 60 + outM;
    const totalMinutes = outTotal - inTotal - breakMinutes;
    workedHours = Math.max(0, totalMinutes / 60);

    // Minutos efectivos desde la hora de entrada hasta fin de jornada programada
    const regularMinutes = Math.max(0, schedEndTotal - Math.max(inTotal, schedTotal) - breakMinutes);
    const normalHoursMax = regularMinutes / 60;

    if (workedHours <= normalHoursMax) {
      // Sin horas extras
      regularHours = workedHours;
    } else {
      regularHours = normalHoursMax;
      const extraHours = workedHours - normalHoursMax;

      if (overtimeAuthorized) {
        // Primeras 2h → 25%, resto → 35%
        overtimeHours25 = Math.min(extraHours, 2);
        overtimeHours35 = Math.max(0, extraHours - 2);
      }
      // Si no están autorizadas, las extras quedan en 0 (no se cuentan para pago)
    }
  }

  return {
    worked_hours: workedHours,
    regular_hours: regularHours,
    overtime_hours_25: overtimeHours25,
    overtime_hours_35: overtimeHours35,
    is_late: isLate,
    late_minutes: lateMinutes,
    is_absent: false,
    scheduled_start: scheduledStart,
    scheduled_end: scheduledEnd,
  };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { employee_id, date_from, date_to } = body;

    if (!employee_id || !date_from || !date_to) {
      return Response.json({ error: 'employee_id, date_from y date_to son requeridos' }, { status: 400 });
    }

    function parseSDKResponse(raw) {
      if (Array.isArray(raw)) return raw;
      if (raw == null) return [];
      if (typeof raw === "object") {
        const vals = Object.values(raw);
        return (vals.length > 0 && typeof vals[0] === "object" && vals[0] !== null) ? vals : [];
      }
      if (typeof raw === "string") {
        try {
          const parsed = JSON.parse(raw);
          return Array.isArray(parsed) ? parsed : Object.values(parsed);
        } catch { return []; }
      }
      return [];
    }

    const [empRaw, schedulesRaw] = await Promise.all([
      base44.entities.Employee.filter({ id: employee_id }),
      base44.entities.WorkSchedule.list("-effective_from"),
    ]);

    const employee = parseSDKResponse(empRaw);
    const allSchedules = parseSDKResponse(schedulesRaw);
    const emp = employee[0];
    if (!emp) return Response.json({ error: 'Empleado no encontrado' }, { status: 404 });

    const allRecords = parseSDKResponse(await base44.entities.AttendanceRecord.filter({ employee_id }));
    const recordsInRange = allRecords.filter(r => r.date >= date_from && r.date <= date_to);

    let updated = 0;

    for (const record of recordsInRange) {
      const schedule = getScheduleForDate(employee_id, emp.department_name, allSchedules, record.date);
      // overtime_authorized del registro individual tiene prioridad, luego el del horario
      const overtimeAuth = record.overtime_authorized ?? schedule?.overtime_authorized ?? false;
      const metrics = calcularMetricas(record, schedule, record.date, overtimeAuth);

      let status = record.status;
      if (record.status === "Justificado") {
        // Preservar el estado Justificado: ya fue procesado por una justificación
        status = "Justificado";
      } else if (record.clock_in && record.clock_out) {
        status = "Completo";
      } else if (record.clock_in && !record.clock_out) {
        status = "Incompleto";
      } else if (!record.clock_in) {
        status = "Ausente";
      }

      await base44.entities.AttendanceRecord.update(record.id, {
        worked_hours: metrics.worked_hours,
        regular_hours: metrics.regular_hours,
        overtime_hours_25: metrics.overtime_hours_25,
        overtime_hours_35: metrics.overtime_hours_35,
        is_late: metrics.is_late,
        late_minutes: metrics.late_minutes,
        is_absent: metrics.is_absent,
        scheduled_start: metrics.scheduled_start || record.scheduled_start,
        scheduled_end: metrics.scheduled_end || record.scheduled_end,
        status,
      });
      updated++;
    }

    return Response.json({ success: true, updated, range: { date_from, date_to }, employee_id });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});