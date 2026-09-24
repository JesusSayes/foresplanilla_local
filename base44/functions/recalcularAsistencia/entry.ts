import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

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
// Soporta turnos nocturnos (schedEnd < schedStart, ej: 18:00 a 06:00)
function calcularMetricas(record, schedule, dateStr, overtimeAuthorized) {
  const segFields = [
    ["clock_in", "clock_out"],
    ["clock_in_2", "clock_out_2"],
    ["clock_in_3", "clock_out_3"],
    ["clock_in_4", "clock_out_4"],
  ];

  // Sin ninguna entrada en ningún segmento → todo en cero
  const hasAnyClockIn = segFields.some(([inF]) => record[inF]);
  if (!hasAnyClockIn) {
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

  const toMin = (t) => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };

  const dow = new Date(dateStr + "T00:00:00").getDay();
  const dayStartMap = ["sunday_start","monday_start","tuesday_start","wednesday_start","thursday_start","friday_start","saturday_start"];
  const dayEndMap   = ["sunday_end","monday_end","tuesday_end","wednesday_end","thursday_end","friday_end","saturday_end"];

  const dayStart = schedule ? schedule[dayStartMap[dow]] : null;
  const dayEnd   = schedule ? schedule[dayEndMap[dow]]   : null;

  // Si el día no tiene jornada programada (start/end vacíos), no asignar horario
  // por defecto. Evita que sábados, domingos y días sin horario real reciban
  // horarios ficticios (09:00-18:00) que podrían interpretarse como tardanzas
  // u horas extras en recálculos posteriores.
  if (!dayStart || !dayEnd) {
    return {
      worked_hours: 0,
      regular_hours: 0,
      overtime_hours_25: 0,
      overtime_hours_35: 0,
      is_late: false,
      late_minutes: 0,
      is_absent: false,
      scheduled_start: null,
      scheduled_end: null,
    };
  }

  const scheduledStart  = dayStart;
  const scheduledEnd    = dayEnd;
  const breakMinutes    = schedule?.break_duration_minutes ?? 60;
  const toleranceMinutes = schedule?.tolerance_minutes ?? 10;

  const schedTotal    = toMin(scheduledStart);
  const schedEndTotal = toMin(scheduledEnd);

  const isNightShift = schedEndTotal < schedTotal;

  const fullJornada = isNightShift
    ? (schedEndTotal - schedTotal + 1440)
    : Math.max(0, schedEndTotal - schedTotal);

  // Regla: si la jornada programada es menor a 6 horas (360 min), no se descuenta el break
  const effectiveBreakMinutes = fullJornada < 360 ? 0 : breakMinutes;

  const norm = (t) => isNightShift ? (t - schedTotal + 1440) % 1440 : t;

  const normSchedStart = isNightShift ? 0 : schedTotal;
  const normSchedEnd   = isNightShift ? fullJornada : schedEndTotal;

  // Recopilar intervalos válidos (con entrada Y salida) de TODOS los segmentos
  // y la entrada más temprana para cálculo de tardanza
  const intervals = [];
  let earliestNormIn = null;
  for (const [inF, outF] of segFields) {
    const ci = record[inF] ? String(record[inF]).slice(0, 5) : null;
    const co = record[outF] ? String(record[outF]).slice(0, 5) : null;
    if (ci && co) {
      let nIn  = norm(toMin(ci));
      let nOut = norm(toMin(co));
      if (isNightShift && nIn > fullJornada) nIn = 0;
      if (nOut < nIn) nOut += 1440; // cruce de medianoche
      if (nOut >= nIn) intervals.push([nIn, nOut]);
    }
    if (ci) {
      let nIn = norm(toMin(ci));
      if (isNightShift && nIn > fullJornada) nIn = 0;
      if (earliestNormIn === null || nIn < earliestNormIn) earliestNormIn = nIn;
    }
  }

  // Fusionar intervalos superpuestos (evita duplicar horas)
  intervals.sort((a, b) => a[0] - b[0]);
  const merged = [];
  for (const [s, e] of intervals) {
    if (merged.length === 0 || s > merged[merged.length - 1][1]) merged.push([s, e]);
    else merged[merged.length - 1][1] = Math.max(merged[merged.length - 1][1], e);
  }

  // Total marcado = unión de intervalos (sin duplicar)
  const totalMarkedMin = merged.reduce((sum, [s, e]) => sum + (e - s), 0);

  // Horas trabajadas = total marcado - refrigerio (una sola vez)
  const workedHours = Math.max(0, (totalMarkedMin - effectiveBreakMinutes) / 60);

  // Horas regulares = intersección con horario programado - refrigerio
  let regularRawMin = 0;
  for (const [s, e] of merged) {
    const iS = Math.max(s, normSchedStart);
    const iE = Math.min(e, normSchedEnd);
    if (iE > iS) regularRawMin += (iE - iS);
  }
  const regularHours = Math.max(0, (regularRawMin - effectiveBreakMinutes) / 60);

  // Horas extras = tiempo fuera del horario programado
  let outsideMin = 0;
  for (const [s, e] of merged) {
    if (s < normSchedStart) outsideMin += Math.min(e, normSchedStart) - s;
    if (e > normSchedEnd) outsideMin += e - Math.max(s, normSchedEnd);
  }
  outsideMin = Math.max(0, outsideMin);
  const overtimeHours = outsideMin / 60;

  // Tardanza (desde la entrada más temprana de todos los segmentos)
  const rawLate = (earliestNormIn !== null && earliestNormIn <= fullJornada)
    ? Math.max(0, earliestNormIn - normSchedStart) : 0;
  const lateMinutes = rawLate > toleranceMinutes ? rawLate : 0;
  const isLate = lateMinutes > 0;

  // HE 25% y 35% (solo si autorizadas)
  let overtimeHours25 = 0, overtimeHours35 = 0;
  if (overtimeAuthorized && overtimeHours > 0) {
    overtimeHours25 = Math.min(overtimeHours, 2);
    overtimeHours35 = Math.max(0, overtimeHours - 2);
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

    // Verificar que el caller sea admin/super_admin
    const callerEmp = await base44.asServiceRole.entities.Employee.filter({ work_email: user.email });
    const callerRole = callerEmp?.[0]?.role;
    if (!callerRole || !['admin', 'super_admin'].includes(callerRole)) {
      return Response.json({ error: 'Solo administradores pueden recalcular asistencia' }, { status: 403 });
    }

    const body = await req.json();
    const { employee_id, date_from, date_to } = body;

    if (!employee_id || !date_from || !date_to) {
      return Response.json({ error: 'employee_id, date_from y date_to son requeridos' }, { status: 400 });
    }
    const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
    if (!ISO_DATE.test(date_from) || !ISO_DATE.test(date_to)) {
      return Response.json({ error: 'date_from y date_to deben tener formato YYYY-MM-DD' }, { status: 400 });
    }
    if (date_from > date_to) {
      return Response.json({ error: 'date_from no puede ser mayor que date_to' }, { status: 400 });
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

    const [allRecordsRaw, allIncidentsRaw, overtimeAlertsRaw] = await Promise.all([
      base44.entities.AttendanceRecord.filter({ employee_id }),
      base44.entities.AttendanceIncident.filter({ employee_id }),
      base44.entities.OvertimeAlert.filter({ employee_id }),
    ]);
    const allRecords = parseSDKResponse(allRecordsRaw);
    const allIncidents = parseSDKResponse(allIncidentsRaw);
    const allOvertimeAlerts = parseSDKResponse(overtimeAlertsRaw);
    const recordsInRange = allRecords.filter(r => r.date >= date_from && r.date <= date_to);

    // Mapa de incidentes aprobados por fecha para consulta rápida
    const approvedIncidentsByDate = {};
    allIncidents.forEach(i => {
      if (i.status === "Aprobada") approvedIncidentsByDate[i.incident_date] = i;
    });

    // Mapa de compensaciones de tardanza aprobadas por fecha
    // (para re-aplicar los descuentos después del recálculo y que no se pierdan)
    const approvedCompensationsByDate = {};
    allIncidents.forEach(i => {
      if (i.status === "Aprobada" && i.incident_type === "Compensación de Tardanza") {
        if (!approvedCompensationsByDate[i.incident_date]) {
          approvedCompensationsByDate[i.incident_date] = [];
        }
        approvedCompensationsByDate[i.incident_date].push(i);
      }
    });

    // Set de record IDs con alerta de HE pendiente (no aprobada → HE no se contabilizan)
    const pendingOvertimeRecordIds = new Set(
      allOvertimeAlerts
        .filter(a => a.status === "Pendiente")
        .map(a => a.attendance_record_id)
        .filter(Boolean)
    );

    let updated = 0;

    for (const record of recordsInRange) {
      // Preservar registros de permiso sin goce: no recalcular métricas ni status.
      // El descuento se aplica en nómina (días completos restan de worked_days;
      // horas generan concepto de descuento). Recalcular sobrescribiría las horas
      // ajustadas y el status, rompiendo el descuento.
      if (record.status === "Permiso sin goce") {
        updated++;
        continue;
      }

      const schedule = getScheduleForDate(employee_id, emp.department_name, allSchedules, record.date);
      // HE autorizadas: solo si el registro tiene overtime_authorized=true Y no hay alerta pendiente
      const hasScheduleAuth = schedule?.overtime_authorized ?? false;
      const overtimeAuth = (record.overtime_authorized === true || hasScheduleAuth) &&
                           !pendingOvertimeRecordIds.has(record.id);
      const metrics = calcularMetricas(record, schedule, record.date, overtimeAuth);

      // Si existe un incidente aprobado para esta fecha → siempre "Justificado"
      const hasApprovedIncident = !!approvedIncidentsByDate[record.date];

      let status;
      if (record.status === "Vacaciones") {
        // Preservar estado de vacaciones, no recalcular
        status = "Vacaciones";
      } else if (hasApprovedIncident || record.status === "Justificado") {
        status = "Justificado";
      } else if (record.clock_in && record.clock_out) {
        status = "Completo";
      } else if (record.clock_in && !record.clock_out) {
        status = "Incompleto";
      } else {
        status = "Ausente";
      }

      // Si hay compensaciones aprobadas para esta fecha, re-aplicar los descuentos
      // (el recálculo anterior resetea los valores, así que hay que re-aplicar)
      const approvedComps = approvedCompensationsByDate[record.date] || [];
      let finalLate = metrics.late_minutes;
      let finalIsLate = metrics.is_late;
      let finalOT25 = metrics.overtime_hours_25;
      let finalOT35 = metrics.overtime_hours_35;
      let finalStatus = status;

      if (approvedComps.length > 0 && status !== "Vacaciones") {
        let compLateMin = 0;
        let compOTHours = 0;
        for (const ac of approvedComps) {
          compLateMin += ac.late_minutes_to_adjust || 0;
          compOTHours += ac.hours_to_adjust || 0;
        }
        finalLate = Math.max(0, metrics.late_minutes - compLateMin);
        finalIsLate = finalLate > 0;

        let remOT = compOTHours;
        finalOT25 = metrics.overtime_hours_25;
        finalOT35 = metrics.overtime_hours_35;
        if (remOT > 0 && finalOT25 > 0) {
          const d = Math.min(finalOT25, remOT);
          finalOT25 -= d;
          remOT -= d;
        }
        if (remOT > 0 && finalOT35 > 0) {
          const d = Math.min(finalOT35, remOT);
          finalOT35 -= d;
          remOT -= d;
        }
        finalStatus = "Justificado";
      }

      await base44.entities.AttendanceRecord.update(record.id, {
        worked_hours: metrics.worked_hours,
        regular_hours: metrics.regular_hours,
        overtime_hours_25: finalOT25,
        overtime_hours_35: finalOT35,
        is_late: finalIsLate,
        late_minutes: finalLate,
        is_absent: finalStatus === "Ausente",
        scheduled_start: metrics.scheduled_start || "",
        scheduled_end: metrics.scheduled_end || "",
        status: finalStatus,
      });
      updated++;
    }

    return Response.json({ success: true, updated, range: { date_from, date_to }, employee_id });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});