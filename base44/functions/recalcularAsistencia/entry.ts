import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

// Función auxiliar: obtener el horario vigente de un empleado en una fecha dada
function getScheduleForDate(employeeId, departmentName, schedules, dateStr) {
  // Prioridad: horarios individuales del empleado, luego departamentales
  // Para cada candidato, verificar que effective_from <= dateStr y (effective_to >= dateStr o sin effective_to)
  const candidates = schedules.filter(s => {
    if (!s.is_active) return false;
    const isForEmployee = s.employee_id === employeeId;
    const isForDept = !s.employee_id && departmentName &&
      (s.departments?.includes(departmentName) || s.department_name === departmentName);
    return isForEmployee || isForDept;
  });

  // Separar por tipo
  const empSchedules = candidates.filter(s => s.employee_id === employeeId);
  const deptSchedules = candidates.filter(s => !s.employee_id);

  // Buscar el más reciente que sea <= dateStr
  const findBest = (list) => {
    const valid = list.filter(s => {
      const from = s.effective_from || "0000-01-01";
      const to = s.effective_to || "9999-12-31";
      return from <= dateStr && to >= dateStr;
    });
    // Ordenar por effective_from descendente → el más reciente que aplique
    valid.sort((a, b) => (b.effective_from || "0000-01-01").localeCompare(a.effective_from || "0000-01-01"));
    return valid[0] || null;
  };

  return findBest(empSchedules) || findBest(deptSchedules) || null;
}

// Calcular horas trabajadas, tardanza, etc. para un registro
function calcularMetricas(record, schedule, dateStr) {
  const clockIn = record.clock_in;
  const clockOut = record.clock_out;

  if (!clockIn) {
    return {
      worked_hours: 0,
      is_late: false,
      late_minutes: 0,
      is_absent: record.status === "Ausente",
    };
  }

  // Obtener horario programado para el día de la semana
  const dow = new Date(dateStr + "T00:00:00").getDay(); // 0=Dom, 1=Lun...
  const dayStartMap = ["sunday_start", "monday_start", "tuesday_start", "wednesday_start", "thursday_start", "friday_start", "saturday_start"];
  const dayEndMap = ["sunday_end", "monday_end", "tuesday_end", "wednesday_end", "thursday_end", "friday_end", "saturday_end"];

  const scheduledStart = schedule ? (schedule[dayStartMap[dow]] || "09:00") : "09:00";
  const scheduledEnd = schedule ? (schedule[dayEndMap[dow]] || "18:00") : "18:00";
  const breakMinutes = schedule?.break_duration_minutes ?? 60;
  const toleranceMinutes = schedule?.tolerance_minutes ?? 10;

  const [inH, inM] = clockIn.split(":").map(Number);
  const inTotal = inH * 60 + inM;

  const [schedH, schedM] = scheduledStart.split(":").map(Number);
  const schedTotal = schedH * 60 + schedM;

  // Tardanza: minutos después de la hora programada (con tolerancia)
  const rawLate = inTotal - schedTotal;
  const lateMinutes = rawLate > toleranceMinutes ? rawLate : 0;
  const isLate = lateMinutes > 0;

  let workedHours = 0;
  if (clockOut) {
    const [outH, outM] = clockOut.split(":").map(Number);
    const outTotal = outH * 60 + outM;
    const totalMinutes = outTotal - inTotal - breakMinutes;
    workedHours = Math.max(0, totalMinutes / 60);
  }

  return {
    worked_hours: workedHours,
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

    // Cargar datos necesarios en paralelo
    const [employee, allSchedules] = await Promise.all([
      base44.entities.Employee.filter({ id: employee_id }),
      base44.entities.WorkSchedule.list("-effective_from"),
    ]);

    const emp = employee[0];
    if (!emp) return Response.json({ error: 'Empleado no encontrado' }, { status: 404 });

    // Cargar registros de asistencia del rango
    const allRecords = await base44.entities.AttendanceRecord.filter({ employee_id });
    const recordsInRange = allRecords.filter(r => r.date >= date_from && r.date <= date_to);

    let updated = 0;
    const errors = [];

    for (const record of recordsInRange) {
      const schedule = getScheduleForDate(employee_id, emp.department_name, allSchedules, record.date);
      const metrics = calcularMetricas(record, schedule, record.date);

      // Determinar estado automático
      let status = record.status;
      if (record.clock_in && record.clock_out) {
        status = "Completo";
      } else if (record.clock_in && !record.clock_out) {
        status = "Incompleto";
      } else if (!record.clock_in) {
        status = record.status === "Justificado" ? "Justificado" : "Ausente";
      }

      await base44.entities.AttendanceRecord.update(record.id, {
        worked_hours: metrics.worked_hours,
        is_late: metrics.is_late,
        late_minutes: metrics.late_minutes,
        is_absent: metrics.is_absent,
        scheduled_start: metrics.scheduled_start || record.scheduled_start,
        scheduled_end: metrics.scheduled_end || record.scheduled_end,
        status,
      });
      updated++;
    }

    return Response.json({
      success: true,
      updated,
      range: { date_from, date_to },
      employee_id,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});