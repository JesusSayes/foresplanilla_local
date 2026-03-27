import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

/**
 * Genera automáticamente registros de asistencia para todos los empleados activos.
 *
 * - Rango: desde max(date_from, hire_date_o_inicio_contrato) hasta HOY (hora Perú).
 * - Omite días con registro existente, feriados y días sin turno en el horario.
 * - Exonerados de marcación → clock_in/clock_out automático (Completo).
 * - No exonerados → registro en blanco (Ausente), pendiente de marcación.
 *
 * Body params opcionales:
 *   date_from   → fecha mínima de inicio, ej: "2026-01-01" (backfill)
 *   employee_id → procesar solo un empleado específico
 *
 * Cron automático: 1 5 * * *  (00:01 hora Perú = 05:01 UTC)
 */

const DAY_NAMES = ["sunday","monday","tuesday","wednesday","thursday","friday","saturday"];

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
  return Math.max(0, ((eh * 60 + em) - (sh * 60 + sm) - (breakMinutes || 60)) / 60);
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

// Normaliza la respuesta del SDK (puede llegar como string JSON, array, u objeto)
function parseSDKResponse(raw) {
  if (Array.isArray(raw)) return raw;
  if (typeof raw === "string") {
    try { const parsed = JSON.parse(raw); return Array.isArray(parsed) ? parsed : Object.values(parsed); }
    catch { return []; }
  }
  if (raw && typeof raw === "object") return raw.items || raw.data || Object.values(raw);
  return [];
}

// Llama filter() o list() paginando con skip hasta agotar resultados
async function listAll(entity, query = null, sortField = "-created_date", pageSize = 50) {
  const results = [];
  let skip = 0;
  while (true) {
    const raw = query
      ? await entity.filter(query, sortField, pageSize, skip)
      : await entity.list(sortField, pageSize, skip);
    const items = parseSDKResponse(raw);
    results.push(...items);
    if (items.length < pageSize) break;
    skip += pageSize;
    if (skip > 200000) break;
  }
  return results;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const db     = base44.asServiceRole;

    // Auth opcional: si hay sesión, verificar que sea admin
    try {
      const user = await base44.auth.me();
      if (user && user.role !== "admin" && user.role !== "super_admin") {
        return Response.json({ error: "Solo administradores pueden ejecutar esta función" }, { status: 403 });
      }
    } catch { /* scheduler sin sesión → ok */ }

    let body = {};
    try { body = await req.json(); } catch { /* sin body */ }
    const forcedDateFrom   = body.date_from   || null; // ej: "2026-01-01"
    const filterEmployeeId = body.employee_id || null;

    const todayStr = todayInPeru();

    // ── Carga maestra paginada en paralelo ────────────────────────────────────
    const [allEmpRaw, schedulesRaw, holidaysRaw, contractsRaw, allRecordsRaw] = await Promise.all([
      listAll(db.entities.Employee,        null,              "-created_date", 50),
      listAll(db.entities.WorkSchedule,    null,              "-effective_from", 50),
      listAll(db.entities.Holiday,         null,              "-date", 50),
      listAll(db.entities.Contract,        null,              "-created_date", 50),
      listAll(db.entities.AttendanceRecord, null,             "-date", 50),
    ]);

    const allEmployees    = allEmpRaw.filter(e => e.status === "Activo");
    const activeScheds    = schedulesRaw.filter(s => s.is_active);
    const holidays        = holidaysRaw;
    const vigentContracts = contractsRaw.filter(c => c.status === "Vigente");
    const holidayDates = new Set(holidays.map(h => h.date?.slice(0, 10)));

    // Índice de registros existentes: "employeeId|YYYY-MM-DD" → true
    const existingIndex = new Set(
      allRecordsRaw.map(r => `${r.employee_id}|${(r.date || "").slice(0, 10)}`)
    );

    const employees = filterEmployeeId
      ? allEmployees.filter(e => e.id === filterEmployeeId)
      : allEmployees;

    let totalCreated = 0;
    let totalSkipped = 0;
    const errors     = [];
    const BATCH      = 50;

    for (const emp of employees) {
      try {
        const empContract  = vigentContracts.find(c => c.employee_id === emp.id);
        const startDateRaw = empContract?.start_date || emp.hire_date;

        if (!startDateRaw || String(startDateRaw).trim() === "") {
          totalSkipped++;
          continue;
        }

        const contractStart = startDateRaw.slice(0, 10);
        const startStr = (forcedDateFrom && forcedDateFrom > contractStart)
          ? forcedDateFrom
          : contractStart;

        if (startStr > todayStr) { totalSkipped++; continue; }

        const allDates        = dateRange(startStr, todayStr);
        const recordsToCreate = [];

        for (const dateStr of allDates) {
          if (existingIndex.has(`${emp.id}|${dateStr}`)) continue;
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

          existingIndex.add(`${emp.id}|${dateStr}`);
        }

        for (let i = 0; i < recordsToCreate.length; i += BATCH) {
          await db.entities.AttendanceRecord.bulkCreate(recordsToCreate.slice(i, i + BATCH));
          totalCreated += recordsToCreate.slice(i, i + BATCH).length;
        }

      } catch (empError) {
        errors.push({ employee_id: emp.id, name: `${emp.first_name} ${emp.last_name}`, error: empError.message });
      }
    }

    return Response.json({
      success:             true,
      date:                todayStr,
      employees_processed: employees.length,
      records_created:     totalCreated,
      records_skipped:     totalSkipped,
      errors:              errors.length > 0 ? errors : undefined,
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});