import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

/**
 * Genera automáticamente registros de asistencia para todos los empleados activos.
 *
 * Modos de uso:
 * 1. CRON DIARIO (sin parámetros): solo genera el registro de HOY para todos los empleados.
 * 2. BACKFILL (date_from): genera registros desde date_from hasta hoy, de a employee_batch empleados.
 *
 * Body params opcionales:
 *   date_from      → fecha mínima de inicio, ej: "2026-01-01" (activa modo backfill)
 *   employee_id    → procesar solo un empleado específico
 *   employee_batch → cuántos empleados procesar por llamada (default: 50 en cron, 5 en backfill)
 *   skip_employees → saltar los primeros N empleados (para paginación de backfill)
 *
 * Cron automático: 1 5 * * *  (00:01 hora Perú = 05:01 UTC)
 */

const DAY_NAMES = ["sunday","monday","tuesday","wednesday","thursday","friday","saturday"];
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

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

async function listAll(entity, query = null, sortField = "-created_date") {
  const PAGE = 10;
  const results = [];
  let skip = 0;
  while (true) {
    await sleep(150);
    const raw = query
      ? await entity.filter(query, sortField, PAGE, skip)
      : await entity.list(sortField, PAGE, skip);
    const items = parseSDKResponse(raw);
    results.push(...items);
    if (items.length < PAGE) break;
    skip += PAGE;
    if (skip > 100000) break;
  }
  return results;
}

function getScheduleForDate(employeeId, departmentName, schedules, dateStr) {
  const candidates = schedules.filter(s => {
    const isForEmployee = s.employee_id === employeeId;
    const isForDept = !s.employee_id && departmentName &&
      (s.departments?.includes(departmentName) || s.department_name === departmentName);
    return isForEmployee || isForDept;
  });

  const findBest = (list) => {
    const valid = list.filter(s => {
      const from = s.effective_from || "0000-01-01";
      const to   = s.effective_to   || "9999-12-31";
      return from <= dateStr && dateStr <= to;
    });
    valid.sort((a, b) => (b.effective_from || "0000-01-01").localeCompare(a.effective_from || "0000-01-01"));
    return valid[0] || null;
  };

  return findBest(candidates.filter(s => s.employee_id === employeeId))
      || findBest(candidates.filter(s => !s.employee_id))
      || null;
}

function calcWorkedHours(startTime, endTime, breakMinutes) {
  const [sh, sm] = startTime.split(":").map(Number);
  const [eh, em] = endTime.split(":").map(Number);
  let totalMin = (eh * 60 + em) - (sh * 60 + sm);
  if (totalMin < 0) totalMin += 1440;
  // Regla: si la jornada programada es menor a 6 horas (360 min), no se descuenta el break
  const effectiveBreak = totalMin < 360 ? 0 : (breakMinutes || 60);
  return Math.max(0, (totalMin - effectiveBreak) / 60);
}

function dateRange(startStr, endStr) {
  const dates = [];
  const cur = new Date(startStr + "T00:00:00");
  const end = new Date(endStr   + "T00:00:00");
  while (cur <= end) {
    dates.push(cur.toISOString().slice(0, 10));
    cur.setDate(cur.getDate() + 1);
  }
  return dates;
}

function todayInPeru() {
  const now    = new Date();
  const peruMs = now.getTime() + now.getTimezoneOffset() * 60000 + (-5 * 60 * 60000);
  const d      = new Date(peruMs);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const db     = base44.asServiceRole;

    try {
      const user = await base44.auth.me();
      if (user) {
        // Llamada manual: verificar rol admin via Employee
        const callerEmp = await db.entities.Employee.filter({ work_email: user.email });
        const callerRole = callerEmp?.[0]?.role;
        if (!callerRole || !['admin', 'super_admin'].includes(callerRole)) {
          return Response.json({ error: "Solo administradores pueden ejecutar esta función" }, { status: 403 });
        }
      }
    } catch { /* scheduler sin sesión de usuario → ok (gateway Base44 valida el token de servicio) */ }

    let body = {};
    try { body = await req.json(); } catch {}
    const forcedDateFrom   = body.date_from      || null;
    const filterEmployeeId = body.employee_id    || null;
    const skipEmployees    = body.skip_employees || 0;
    const isBackfill       = !!forcedDateFrom;

    // En modo backfill usamos lotes pequeños para evitar rate limit
    // En modo cron diario procesamos todos (solo 1 día = pocas escrituras)
    const defaultBatch = isBackfill ? 5 : 200;
    const rawBatch = parseInt(body.employee_batch) || defaultBatch;
    const employeeBatch = Math.min(Math.max(1, rawBatch), 200); // entre 1 y 200

    const todayStr = todayInPeru();

    // ── Carga maestra (datos que no cambian entre empleados) ─────────────────
    const [allEmpRaw, schedulesRaw, holidaysRaw, contractsRaw] = await Promise.all([
      listAll(db.entities.Employee,     null, "-created_date"),
      listAll(db.entities.WorkSchedule, null, "-effective_from"),
      listAll(db.entities.Holiday,      null, "-date"),
      listAll(db.entities.Contract,     null, "-created_date"),
    ]);

    const allEmployeesActive = allEmpRaw.filter(e => e.status === "Activo");
    const activeScheds       = schedulesRaw.filter(s => s.is_active);
    const holidayDates       = new Set(holidaysRaw.map(h => (h.date || "").slice(0, 10)));
    const vigentContracts    = contractsRaw.filter(c => c.status === "Vigente");

    let employees = filterEmployeeId
      ? allEmployeesActive.filter(e => e.id === filterEmployeeId)
      : allEmployeesActive.slice(skipEmployees, skipEmployees + employeeBatch);

    let totalCreated = 0;
    let totalSkipped = 0;
    const errors     = [];
    const BULK       = 20;

    for (const emp of employees) {
      try {
        const empContract  = vigentContracts.find(c => c.employee_id === emp.id);
        const startDateRaw = empContract?.start_date || emp.hire_date;

        if (!startDateRaw || String(startDateRaw).trim() === "") {
          totalSkipped++;
          continue;
        }

        const contractStart = startDateRaw.slice(0, 10);
        // En modo cron diario solo procesamos HOY para evitar recalcular todo el historial
        const startStr = isBackfill
          ? ((forcedDateFrom > contractStart) ? forcedDateFrom : contractStart)
          : todayStr; // cron: solo hoy

        if (startStr > todayStr) { totalSkipped++; continue; }

        // Cargar registros existentes solo de este empleado en el rango
        await sleep(150);
        const empRecordsRaw = isBackfill
          ? await listAll(db.entities.AttendanceRecord, { employee_id: emp.id }, "-date")
          : await (async () => {
              const raw = await db.entities.AttendanceRecord.filter({ employee_id: emp.id, date: todayStr }, "-date", 5, 0);
              return parseSDKResponse(raw);
            })();

        const existingDates = new Set(empRecordsRaw.map(r => (r.date || "").slice(0, 10)));

        const allDates        = dateRange(startStr, todayStr);
        const recordsToCreate = [];

        for (const dateStr of allDates) {
          if (existingDates.has(dateStr)) continue;
          if (holidayDates.has(dateStr)) continue;

          const schedule = getScheduleForDate(emp.id, emp.department_name, activeScheds, dateStr);
          if (!schedule) continue;

          const dow    = new Date(dateStr + "T00:00:00").getDay();
          const day    = DAY_NAMES[dow];
          const startT = schedule[`${day}_start`];
          const endT   = schedule[`${day}_end`];

          if (!startT || !endT || startT.trim() === "" || endT.trim() === "") continue;

          const isExempt = !!schedule.exempt_from_clocking;
          const breakMin = schedule.break_duration_minutes || 60;
          const worked   = isExempt ? calcWorkedHours(startT, endT, breakMin) : 0;

          recordsToCreate.push({
            employee_id:         emp.id,
            date:                dateStr,
            scheduled_start:     startT,
            scheduled_end:       endT,
            clock_in:            isExempt ? startT : null,
            clock_out:           isExempt ? endT   : null,
            worked_hours:        worked,
            regular_hours:       worked,
            overtime_hours_25:   0,
            overtime_hours_35:   0,
            is_late:             false,
            late_minutes:        0,
            is_absent:           !isExempt,
            overtime_authorized: schedule.overtime_authorized || false,
            status:              isExempt ? "Completo" : "Ausente",
            notes:               isExempt
              ? "Registro automático - Exonerado de marcación física"
              : "Registro generado automáticamente - Pendiente de marcación",
          });

          existingDates.add(dateStr);
        }

        for (let i = 0; i < recordsToCreate.length; i += BULK) {
          await sleep(200);
          await db.entities.AttendanceRecord.bulkCreate(recordsToCreate.slice(i, i + BULK));
          totalCreated += recordsToCreate.slice(i, i + BULK).length;
        }

      } catch (empError) {
        errors.push({ employee_id: emp.id, name: `${emp.first_name} ${emp.last_name}`, error: empError.message });
      }
    }

    const hasMore = !filterEmployeeId && (skipEmployees + employeeBatch) < allEmployeesActive.length;

    return Response.json({
      success:                true,
      mode:                   isBackfill ? "backfill" : "cron_diario",
      date:                   todayStr,
      employees_processed:    employees.length,
      records_created:        totalCreated,
      records_skipped:        totalSkipped,
      total_active_employees: allEmployeesActive.length,
      next_skip:              hasMore ? skipEmployees + employeeBatch : null,
      has_more:               hasMore,
      errors:                 errors.length > 0 ? errors : undefined,
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});