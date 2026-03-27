import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

/**
 * Genera automáticamente registros de asistencia para todos los empleados activos.
 *
 * Para cada empleado:
 *  - Determina el rango de fechas desde el inicio de su contrato (o hire_date) hasta HOY.
 *  - Para cada día laborable en ese rango que NO tenga ya un registro, crea uno.
 *  - Si el empleado está marcado como "exonerado de marcación" en su horario,
 *    se completan clock_in / clock_out automáticamente con el horario programado.
 *  - Si NO está exonerado, se crea el registro en blanco (sin clock_in/clock_out) → Ausente.
 *  - Nunca sobreescribe registros existentes.
 *
 * Se ejecuta todos los días a las 00:01 hora Perú (05:01 UTC).
 */

const DAY_NAMES = ["sunday","monday","tuesday","wednesday","thursday","friday","saturday"];

// Devuelve el horario vigente para un empleado en una fecha concreta
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
      const to   = s.effective_to   || "9999-12-31";
      return from <= dateStr && dateStr <= to;
    });
    valid.sort((a, b) => (b.effective_from || "0000-01-01").localeCompare(a.effective_from || "0000-01-01"));
    return valid[0] || null;
  };

  return findBest(empSchedules) || findBest(deptSchedules) || null;
}

// Calcula horas trabajadas netas descontando el break
function calcWorkedHours(startTime, endTime, breakMinutes) {
  const [sh, sm] = startTime.split(":").map(Number);
  const [eh, em] = endTime.split(":").map(Number);
  const totalMin = (eh * 60 + em) - (sh * 60 + sm) - (breakMinutes || 60);
  return Math.max(0, totalMin / 60);
}

// Genera todas las fechas en formato YYYY-MM-DD entre startDate y endDate (inclusive)
function dateRange(startStr, endStr) {
  const dates = [];
  const cur = new Date(startStr + "T00:00:00");
  const end = new Date(endStr + "T00:00:00");
  while (cur <= end) {
    dates.push(cur.toISOString().slice(0, 10));
    cur.setDate(cur.getDate() + 1);
  }
  return dates;
}

// Convierte fecha UTC a fecha en hora Perú (UTC-5)
function todayInPeru() {
  const now = new Date();
  // Peru = UTC-5
  const peruOffset = -5 * 60;
  const utcMs = now.getTime() + now.getTimezoneOffset() * 60000;
  const peruMs = utcMs + peruOffset * 60000;
  const peruDate = new Date(peruMs);
  const y = peruDate.getFullYear();
  const m = String(peruDate.getMonth() + 1).padStart(2, "0");
  const d = String(peruDate.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // Permite llamada desde automación (sin usuario) o desde frontend (con usuario admin)
    let calledByScheduler = false;
    try {
      const user = await base44.auth.me();
      if (user && user.role !== "admin" && user.role !== "super_admin") {
        return Response.json({ error: "Solo administradores pueden ejecutar esta función" }, { status: 403 });
      }
    } catch {
      // Sin sesión de usuario → asumimos que viene del scheduler, usamos service role
      calledByScheduler = true;
    }

    const db = calledByScheduler ? base44.asServiceRole : base44;

    const todayStr = todayInPeru();

    // Carga en paralelo todo lo necesario
    const [employees, schedules, holidays, contracts] = await Promise.all([
      db.entities.Employee.filter({ status: "Activo" }),
      db.entities.WorkSchedule.list("-effective_from"),
      db.entities.Holiday.list(),
      db.entities.Contract.filter({ status: "Vigente" }),
    ]);

    // Set de fechas feriadas para filtrado rápido
    const holidayDates = new Set(holidays.map(h => h.date?.slice(0, 10)));

    let totalCreated = 0;
    let totalSkipped = 0;
    const errors = [];

    for (const emp of employees) {
      try {
        // Determinar fecha de inicio: primer día del contrato vigente o hire_date
        const empContract = contracts.find(c => c.employee_id === emp.id);
        const startDateRaw = empContract?.start_date || emp.hire_date;
        if (!startDateRaw) {
          totalSkipped++;
          continue;
        }
        const startStr = startDateRaw.slice(0, 10);

        // Solo generar registros desde el inicio hasta hoy
        const allDates = dateRange(startStr, todayStr);

        // Obtener registros existentes del empleado de una sola vez
        const existingRecords = await db.entities.AttendanceRecord.filter({ employee_id: emp.id });
        const existingDates = new Set(existingRecords.map(r => r.date?.slice(0, 10)));

        for (const dateStr of allDates) {
          // Saltar si ya existe un registro para ese día
          if (existingDates.has(dateStr)) continue;

          // Saltar feriados
          if (holidayDates.has(dateStr)) continue;

          const schedule = getScheduleForDate(emp.id, emp.department_name, schedules, dateStr);
          if (!schedule) continue; // Sin horario asignado → no se genera registro

          const dow = new Date(dateStr + "T00:00:00").getDay();
          const dayName = DAY_NAMES[dow];
          const startTime = schedule[`${dayName}_start`];
          const endTime   = schedule[`${dayName}_end`];

          // Si el horario no define ese día → no labora → no crear registro
          if (!startTime || !endTime) continue;

          const isExempt = !!schedule.exempt_from_clocking;
          const breakMin = schedule.break_duration_minutes || 60;

          let recordData = {
            employee_id:       emp.id,
            date:              dateStr,
            scheduled_start:   startTime,
            scheduled_end:     endTime,
            is_late:           false,
            late_minutes:      0,
            is_absent:         false,
            overtime_authorized: schedule.overtime_authorized || false,
            regular_hours:     0,
            overtime_hours_25: 0,
            overtime_hours_35: 0,
            worked_hours:      0,
          };

          if (isExempt) {
            // Exonerado: completar entrada y salida automáticamente
            const workedHours = calcWorkedHours(startTime, endTime, breakMin);
            recordData = {
              ...recordData,
              clock_in:      startTime,
              clock_out:     endTime,
              worked_hours:  workedHours,
              regular_hours: workedHours,
              status:        "Completo",
              notes:         "Registro automático - Exonerado de marcación física",
            };
          } else {
            // No exonerado: registro en blanco, pendiente de marcación
            recordData = {
              ...recordData,
              clock_in:  null,
              clock_out: null,
              status:    "Ausente",
              notes:     "Registro generado automáticamente - Pendiente de marcación",
            };
          }

          await db.entities.AttendanceRecord.create(recordData);
          existingDates.add(dateStr); // Evitar duplicados en el mismo ciclo
          totalCreated++;
        }
      } catch (empError) {
        errors.push({ employee_id: emp.id, error: empError.message });
      }
    }

    return Response.json({
      success: true,
      date: todayStr,
      employees_processed: employees.length,
      records_created: totalCreated,
      records_skipped: totalSkipped,
      errors: errors.length > 0 ? errors : undefined,
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});