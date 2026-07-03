import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

/**
 * Backfill de asistencia para UN empleado específico.
 * Úsalo desde la UI para rellenar registros históricos empleado por empleado.
 *
 * Body params:
 *   employee_id  → (requerido) ID del empleado
 *   date_from    → fecha de inicio del backfill (default: "2026-01-01")
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

    const { employee_id, date_from = "2026-01-01" } = body;
    if (!employee_id) {
      return Response.json({ error: "employee_id es requerido" }, { status: 400 });
    }
    // Validar formato de fechas para evitar valores arbitrarios
    const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
    if (!ISO_DATE.test(date_from)) {
      return Response.json({ error: "date_from debe tener formato YYYY-MM-DD" }, { status: 400 });
    }

    const todayStr = todayInPeru();

    // Cargar datos del empleado + horarios + feriados + contrato vigente
    const [empArr, schedulesRaw, holidaysRaw, contractsRaw, existingRecordsRaw] = await Promise.all([
      (async () => { await sleep(0);   return parseSDKResponse(await db.entities.Employee.filter({ id: employee_id }, "-created_date", 1, 0)); })(),
      listAll(db.entities.WorkSchedule, null, "-effective_from"),
      listAll(db.entities.Holiday,      null, "-date"),
      (async () => { await sleep(0);   return parseSDKResponse(await db.entities.Contract.filter({ employee_id, status: "Vigente" }, "-created_date", 5, 0)); })(),
      listAll(db.entities.AttendanceRecord, { employee_id }, "-date"),
    ]);

    const emp = empArr[0];
    if (!emp) return Response.json({ error: "Empleado no encontrado" }, { status: 404 });

    const activeScheds   = schedulesRaw.filter(s => s.is_active);
    const holidayDates   = new Set(holidaysRaw.map(h => (h.date || "").slice(0, 10)));
    const vigentContract = contractsRaw[0];
    const existingDates  = new Set(existingRecordsRaw.map(r => (r.date || "").slice(0, 10)));

    const startDateRaw = vigentContract?.start_date || emp.hire_date;
    if (!startDateRaw) {
      return Response.json({ error: "El empleado no tiene fecha de ingreso ni contrato vigente" }, { status: 400 });
    }

    const contractStart = startDateRaw.slice(0, 10);
    const startStr = date_from > contractStart ? date_from : contractStart;

    if (startStr > todayStr) {
      return Response.json({ success: true, records_created: 0, message: "La fecha de inicio es futura" });
    }

    const allDates        = dateRange(startStr, todayStr);
    const recordsToCreate = [];

    for (const dateStr of allDates) {
      if (existingDates.has(dateStr)) continue;
      if (holidayDates.has(dateStr)) continue;

      const schedule = getScheduleForDate(employee_id, emp.department_name, activeScheds, dateStr);
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
        employee_id,
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

    let totalCreated = 0;
    const BULK = 20;
    for (let i = 0; i < recordsToCreate.length; i += BULK) {
      await sleep(200);
      await db.entities.AttendanceRecord.bulkCreate(recordsToCreate.slice(i, i + BULK));
      totalCreated += recordsToCreate.slice(i, i + BULK).length;
    }

    return Response.json({
      success:         true,
      employee_id,
      employee_name:   `${emp.first_name} ${emp.last_name}`,
      date_from:       startStr,
      date_to:         todayStr,
      records_created: totalCreated,
      already_existed: existingDates.size,
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});