import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';
import pg from 'npm:pg@8.11.3';

const { Pool } = pg;
let biotimePool = null;

function getBiotimePool() {
  if (!biotimePool) {
    const connStr = Deno.env.get("BIOTIME_DATABASE_URL");
    if (!connStr) throw new Error("BIOTIME_DATABASE_URL no configurado");
    biotimePool = new Pool({ connectionString: connStr });
  }
  return biotimePool;
}

// Obtiene el horario vigente de un empleado en una fecha
function getScheduleForDate(empId, deptName, schedules, dateStr) {
  const candidates = schedules.filter(s => {
    if (!s.is_active) return false;
    const forEmp = s.employee_id === empId;
    const forDept = !s.employee_id && deptName &&
      (s.departments?.includes(deptName) || s.department_name === deptName);
    return forEmp || forDept;
  });
  const empSch  = candidates.filter(s => s.employee_id === empId);
  const deptSch = candidates.filter(s => !s.employee_id);
  const findBest = (list) => {
    const valid = list.filter(s => {
      const from = s.effective_from || "0000-01-01";
      const to   = s.effective_to   || "9999-12-31";
      return from <= dateStr && to >= dateStr;
    });
    valid.sort((a, b) => (b.effective_from || "0000-01-01").localeCompare(a.effective_from || "0000-01-01"));
    return valid[0] || null;
  };
  return findBest(empSch) || findBest(deptSch) || null;
}

const DAY_START = ["sunday_start","monday_start","tuesday_start","wednesday_start","thursday_start","friday_start","saturday_start"];
const DAY_END   = ["sunday_end","monday_end","tuesday_end","wednesday_end","thursday_end","friday_end","saturday_end"];

Deno.serve(async (req) => {
  const startedAt = Date.now();

  try {
    const base44 = createClientFromRequest(req);

    // Permitir llamada de automatización (sin usuario) o por admin
    let isScheduled = false;
    try {
      const user = await base44.auth.me();
      if (user && user.role !== 'admin') {
        return Response.json({ error: 'Forbidden: Solo admins' }, { status: 403 });
      }
    } catch {
      isScheduled = true; // llamada desde automatización sin token de usuario
    }

    const body = await req.json().catch(() => ({}));

    // Fecha objetivo: hoy por defecto, o la que venga en el payload
    const targetDate = body.date || new Date().toISOString().slice(0, 10);

    // Config Biotime (con defaults)
    const cfg = body.config || {};
    const TABLE_NAME        = cfg.tableName           || "iclock_transaction";
    const FIELD_EMP_CODE    = cfg.fieldEmpCode         || "emp_code";
    const FIELD_PUNCH_TIME  = cfg.fieldPunchTime        || "punch_time";
    const FIELD_PUNCH_STATE = cfg.fieldPunchState       || "punch_state";
    const FIELD_TERMINAL    = cfg.fieldTerminal         || "terminal_alias";
    const EMP_PAD_LENGTH    = cfg.empCodePadLength !== undefined ? cfg.empCodePadLength : 8;
    const EMP_CODE_FIELD    = cfg.empCodeField          || "document_number";
    const WINDOW_MIN        = cfg.windowMinutes         !== undefined ? cfg.windowMinutes : 120;
    const DEFAULT_START     = cfg.defaultScheduledStart || "09:00";
    const DEFAULT_END       = cfg.defaultScheduledEnd   || "18:00";
    const DEFAULT_BREAK     = cfg.defaultBreakMinutes   !== undefined ? cfg.defaultBreakMinutes : 60;
    const DEFAULT_TOL       = cfg.defaultToleranceMinutes !== undefined ? cfg.defaultToleranceMinutes : 10;

    console.log(`[GenerarDiarios] Procesando fecha: ${targetDate}`);

    // 1. Cargar empleados activos y horarios
    const [employees, allSchedules] = await Promise.all([
      base44.asServiceRole.entities.Employee.filter({ status: 'Activo' }),
      base44.asServiceRole.entities.WorkSchedule.list("-updated_date"),
    ]);

    console.log(`[GenerarDiarios] ${employees.length} empleados activos`);

    const dow = new Date(targetDate + "T00:00:00").getDay();

    // 2. Obtener marcaciones del Biotime para este día
    let punchRaw = {}; // key: empCodePadded → [Date, ...]
    try {
      const pool   = getBiotimePool();
      const client = await pool.connect();
      try {
        const dayStart = new Date(targetDate + "T00:00:00");
        const dayEnd   = new Date(targetDate + "T23:59:59");
        const { rows } = await client.query(
          `SELECT t.${FIELD_EMP_CODE} AS emp_code, t.${FIELD_PUNCH_TIME} AS punch_time
           FROM ${TABLE_NAME} t
           WHERE t.${FIELD_PUNCH_TIME} >= $1 AND t.${FIELD_PUNCH_TIME} <= $2
           ORDER BY t.${FIELD_EMP_CODE}, t.${FIELD_PUNCH_TIME} ASC`,
          [dayStart, dayEnd]
        );
        console.log(`[GenerarDiarios] ${rows.length} marcaciones obtenidas del Biotime`);
        for (const tx of rows) {
          const raw = tx.emp_code?.toString();
          const key = EMP_PAD_LENGTH > 0 && raw ? raw.padStart(EMP_PAD_LENGTH, '0') : raw;
          if (!key) continue;
          const pt = new Date(tx.punch_time);
          if (!punchRaw[key]) punchRaw[key] = [];
          punchRaw[key].push(pt);
        }
      } finally {
        client.release();
      }
    } catch (biotimeErr) {
      console.warn(`[GenerarDiarios] Biotime no disponible: ${biotimeErr.message}. Se crearán registros sin marcación.`);
    }

    // Helper: "HH:MM" → minutos
    const toMin = (hhmm) => {
      const [h, m] = (hhmm || "00:00").split(":").map(Number);
      return h * 60 + m;
    };

    // Clasificar punches por horario programado
    function classifyPunches(sortedPunches, scheduledStart, scheduledEnd) {
      const schInMin  = toMin(scheduledStart);
      const schOutMin = toMin(scheduledEnd);

      const inCandidates = sortedPunches.filter(p => {
        const pm = p.getHours() * 60 + p.getMinutes();
        return Math.abs(pm - schInMin) <= WINDOW_MIN;
      });
      inCandidates.sort((a, b) => {
        const am = a.getHours() * 60 + a.getMinutes();
        const bm = b.getHours() * 60 + b.getMinutes();
        return Math.abs(am - schInMin) - Math.abs(bm - schInMin);
      });
      const clockInPunch = inCandidates[0] || null;
      const clockInMin   = clockInPunch ? (clockInPunch.getHours() * 60 + clockInPunch.getMinutes()) : null;

      const outCandidates = sortedPunches.filter(p => {
        const pm = p.getHours() * 60 + p.getMinutes();
        if (clockInMin !== null && pm <= clockInMin) return false;
        return Math.abs(pm - schOutMin) <= WINDOW_MIN;
      });
      outCandidates.sort((a, b) => {
        const am = a.getHours() * 60 + a.getMinutes();
        const bm = b.getHours() * 60 + b.getMinutes();
        return Math.abs(am - schOutMin) - Math.abs(bm - schOutMin);
      });
      const clockOutPunch = outCandidates[0] || null;

      let workedHours = null;
      if (clockInPunch && clockOutPunch) {
        workedHours = parseFloat(((clockOutPunch - clockInPunch) / 3600000).toFixed(2));
        if (workedHours < 0) workedHours = null;
      }

      const fmt = (d) => d ? `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}` : null;
      return { clockIn: fmt(clockInPunch), clockOut: fmt(clockOutPunch), workedHours };
    }

    // 3. Procesar cada empleado
    let created = 0, updated = 0, skipped = 0, errors = 0;
    const errorDetails = [];

    for (const emp of employees) {
      try {
        // Obtener horario vigente para la fecha
        const schedule = getScheduleForDate(emp.id, emp.department_name, allSchedules, targetDate);
        const scheduledStart = schedule ? (schedule[DAY_START[dow]] || DEFAULT_START) : DEFAULT_START;
        const scheduledEnd   = schedule ? (schedule[DAY_END[dow]]   || DEFAULT_END)   : DEFAULT_END;

        // Si es día libre en el horario (sin hora de entrada definida), saltar
        if (schedule && !schedule[DAY_START[dow]]) {
          skipped++;
          continue;
        }

        const breakMinutes     = schedule?.break_duration_minutes ?? DEFAULT_BREAK;
        const toleranceMinutes = schedule?.tolerance_minutes       ?? DEFAULT_TOL;

        // Obtener marcaciones del Biotime para este empleado
        const rawCode   = emp[EMP_CODE_FIELD];
        const codeKey   = EMP_PAD_LENGTH > 0 && rawCode ? rawCode.toString().padStart(EMP_PAD_LENGTH, '0') : rawCode?.toString();
        const punches   = codeKey && punchRaw[codeKey] ? [...punchRaw[codeKey]].sort((a,b) => a-b) : null;
        const punch     = punches ? classifyPunches(punches, scheduledStart, scheduledEnd) : null;

        // Calcular métricas
        let clockIn = null, clockOut = null, workedHours = null;
        let isLate = false, lateMinutes = 0;
        let regularHours = 0, overtime25 = 0, overtime35 = 0;
        let isAbsent = false, status = "Ausente";

        if (punch && punch.clockIn) {
          clockIn    = punch.clockIn;
          clockOut   = punch.clockOut;
          workedHours = punch.workedHours;

          const [inH, inM]   = clockIn.split(":").map(Number);
          const [schH, schM] = scheduledStart.split(":").map(Number);
          const rawLate = (inH * 60 + inM) - (schH * 60 + schM);
          lateMinutes   = rawLate > toleranceMinutes ? rawLate : 0;
          isLate        = lateMinutes > 0;

          if (clockOut && workedHours) {
            const [endH, endM] = scheduledEnd.split(":").map(Number);
            const schedEndMin  = endH * 60 + endM;
            const inMin        = inH * 60 + inM;
            const schedInMin   = schH * 60 + schM;
            const regularMin   = Math.max(0, schedEndMin - Math.max(inMin, schedInMin) - breakMinutes);
            const normalHrsMax = regularMin / 60;

            if (workedHours <= normalHrsMax) {
              regularHours = workedHours;
            } else {
              regularHours = normalHrsMax;
              const extraHrs    = workedHours - normalHrsMax;
              const overtimeAuth = schedule?.overtime_authorized ?? false;
              if (overtimeAuth) {
                overtime25 = Math.min(extraHrs, 2);
                overtime35 = Math.max(0, extraHrs - 2);
              }
            }
            status = "Completo";
          } else {
            status = "Incompleto";
          }
        } else {
          isAbsent = true;
          status   = "Ausente";
        }

        const recordData = {
          employee_id:       emp.id,
          date:              targetDate,
          clock_in:          clockIn,
          clock_out:         clockOut,
          worked_hours:      workedHours,
          regular_hours:     regularHours,
          overtime_hours_25: overtime25,
          overtime_hours_35: overtime35,
          scheduled_start:   scheduledStart,
          scheduled_end:     scheduledEnd,
          is_late:           isLate,
          late_minutes:      lateMinutes,
          is_absent:         isAbsent,
          status,
        };

        // Upsert: buscar registro existente
        const existingList = await base44.asServiceRole.entities.AttendanceRecord.filter({
          employee_id: emp.id,
          date: targetDate,
        });
        const existing = existingList[0] || null;

        if (existing) {
          // No pisar registros ya justificados
          if (existing.status === "Justificado" && !punch?.clockIn) {
            skipped++;
            continue;
          }
          await base44.asServiceRole.entities.AttendanceRecord.update(existing.id, recordData);
          updated++;
        } else {
          await base44.asServiceRole.entities.AttendanceRecord.create(recordData);
          created++;
        }
      } catch (err) {
        errors++;
        errorDetails.push(`${emp.employee_code || emp.document_number}: ${err.message}`);
      }
    }

    const durationMs = Date.now() - startedAt;
    console.log(`[GenerarDiarios] Fin: ${created} creados, ${updated} actualizados, ${skipped} saltados, ${errors} errores. ${durationMs}ms`);

    return Response.json({
      success: true,
      date: targetDate,
      created,
      updated,
      skipped,
      errors,
      errorDetails: errorDetails.slice(0, 30),
      totalEmployees: employees.length,
      durationMs,
    });

  } catch (err) {
    console.error('[GenerarDiarios] Error general:', err.message);
    return Response.json({ success: false, error: err.message }, { status: 500 });
  }
});