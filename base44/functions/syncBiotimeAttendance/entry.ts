import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';
import pg from 'npm:pg@8.11.3';

const { Pool } = pg;

let biotimePool = null;

function getBiotimePool() {
  if (!biotimePool) {
    const connStr = Deno.env.get("BIOTIME_DATABASE_URL");
    if (!connStr) throw new Error("BIOTIME_DATABASE_URL no está configurado en los secrets del sistema");
    biotimePool = new Pool({ connectionString: connStr });
  }
  return biotimePool;
}

// Genera todos los días entre dos fechas inclusive (formato YYYY-MM-DD)
function getDatesInRange(dateFrom, dateTo) {
  const dates = [];
  const current = new Date(dateFrom);
  const end = new Date(dateTo);
  while (current <= end) {
    dates.push(current.toISOString().slice(0, 10));
    current.setDate(current.getDate() + 1);
  }
  return dates;
}

// Obtiene el horario vigente de un empleado en una fecha dada
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

Deno.serve(async (req) => {
  const startedAt = Date.now();
  let inserted = 0;
  let updated = 0;
  let errors = 0;
  const errorDetails = [];

  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Forbidden: Solo admins' }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const startDate = body.startDate || body.start_date;
    const endDate = body.endDate || body.end_date;

    // Config enviada desde el formulario (con fallbacks a defaults)
    const cfg = body.config || {};
    const TABLE_NAME       = cfg.tableName          || "iclock_transaction";
    const FIELD_EMP_CODE   = cfg.fieldEmpCode        || "emp_code";
    const FIELD_PUNCH_TIME = cfg.fieldPunchTime       || "punch_time";
    const FIELD_TERMINAL   = cfg.fieldTerminal        || "terminal_alias";
    const FIELD_PUNCH_STATE = cfg.fieldPunchState     || "punch_state";
    const EMP_PAD_LENGTH   = cfg.empCodePadLength !== undefined ? cfg.empCodePadLength : 8;
    const EMP_CODE_FIELD   = cfg.empCodeField         || "document_number";
    const WINDOW_MIN       = cfg.windowMinutes !== undefined ? cfg.windowMinutes : 120;
    const DEFAULT_START    = cfg.defaultScheduledStart || "09:00";
    const DEFAULT_END      = cfg.defaultScheduledEnd   || "18:00";
    const DEFAULT_BREAK    = cfg.defaultBreakMinutes !== undefined ? cfg.defaultBreakMinutes : 60;
    const DEFAULT_TOL      = cfg.defaultToleranceMinutes !== undefined ? cfg.defaultToleranceMinutes : 10;

    const dateFrom = startDate ? new Date(startDate) : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const dateTo = endDate ? new Date(endDate) : new Date();

    if (isNaN(dateFrom.getTime()) || isNaN(dateTo.getTime())) {
      return Response.json({ success: false, error: 'Fechas inválidas. Use formato YYYY-MM-DD.' }, { status: 400 });
    }

    const dateFromStr = dateFrom.toISOString().slice(0, 10);
    const dateToStr = dateTo.toISOString().slice(0, 10);
    const allDates = getDatesInRange(dateFromStr, dateToStr);

    console.log(`[BiotimeSync] Rango: ${dateFromStr} → ${dateToStr} (${allDates.length} días)`);

    // 1. Obtener marcaciones del Biotime
    const pool = getBiotimePool();
    const client = await pool.connect();
    let transactions = [];
    try {
      const { rows } = await client.query(
        `SELECT
          t.${FIELD_EMP_CODE}   AS emp_code,
          t.${FIELD_PUNCH_TIME} AS punch_time,
          t.${FIELD_PUNCH_STATE} AS punch_state,
          t.${FIELD_TERMINAL}   AS terminal_alias
        FROM ${TABLE_NAME} t
        WHERE t.${FIELD_PUNCH_TIME} >= $1 AND t.${FIELD_PUNCH_TIME} < $2
        ORDER BY t.${FIELD_EMP_CODE}, t.${FIELD_PUNCH_TIME} ASC`,
        [dateFrom, new Date(dateTo.getTime() + 86400000)]
      );
      transactions = rows;
    } finally {
      client.release();
    }
    console.log(`[BiotimeSync] ${transactions.length} marcaciones obtenidas del Biotime`);

    // 2. Agrupar marcaciones por empCode + fecha → lista de punches
    const punchMap = {}; // key: `${empCode}__${dateKey}` → [Date, ...]
    for (const tx of transactions) {
      const rawEmpCode = tx.emp_code?.toString();
      const empCode = EMP_PAD_LENGTH > 0 && rawEmpCode ? rawEmpCode.padStart(EMP_PAD_LENGTH, '0') : rawEmpCode;
      if (!empCode) continue;
      const punchTime = new Date(tx.punch_time);
      const dateKey = punchTime.toISOString().slice(0, 10);
      const key = `${empCode}__${dateKey}`;
      if (!punchMap[key]) punchMap[key] = [];
      punchMap[key].push(punchTime);
    }

    // Helper: convierte "HH:MM" a minutos desde medianoche
    const toMin = (hhmm) => {
      const [h, m] = (hhmm || "00:00").split(":").map(Number);
      return h * 60 + m;
    };

    // Clasifica punches usando el horario programado con ventana configurable (config.windowMinutes)
    function classifyPunches(sortedPunches, scheduledStart, scheduledEnd) {
      const schInMin  = toMin(scheduledStart);
      const schOutMin = toMin(scheduledEnd);

      // Candidatos para entrada: dentro de la ventana del horario de entrada
      const inCandidates = sortedPunches.filter(p => {
        const pm = p.getHours() * 60 + p.getMinutes();
        return Math.abs(pm - schInMin) <= WINDOW_MIN;  // WINDOW_MIN del scope externo
      });
      // Elegir el más cercano al horario programado de entrada
      inCandidates.sort((a, b) => {
        const am = a.getHours() * 60 + a.getMinutes();
        const bm = b.getHours() * 60 + b.getMinutes();
        return Math.abs(am - schInMin) - Math.abs(bm - schInMin);
      });
      const clockInPunch = inCandidates[0] || null;
      const clockInMin = clockInPunch ? (clockInPunch.getHours() * 60 + clockInPunch.getMinutes()) : null;

      // Candidatos para salida: dentro de la ventana del horario de salida, posterior a entrada
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

      return {
        clockIn:  clockInPunch  ? `${String(clockInPunch.getHours()).padStart(2,'0')}:${String(clockInPunch.getMinutes()).padStart(2,'0')}` : null,
        clockOut: clockOutPunch ? `${String(clockOutPunch.getHours()).padStart(2,'0')}:${String(clockOutPunch.getMinutes()).padStart(2,'0')}` : null,
        workedHours,
      };
    }

    // Guardamos los punches crudos ordenados para usarlos después
    const punchRaw = {}; // key → sortedPunches[]
    for (const [key, punches] of Object.entries(punchMap)) {
      punches.sort((a, b) => a - b);
      punchRaw[key] = punches;
    }

    // 3. Obtener todos los empleados activos del sistema
    const [employees, allSchedules] = await Promise.all([
      base44.entities.Employee.filter({ status: 'Activo' }),
      base44.entities.WorkSchedule.list("-updated_date"),
    ]);

    // 4. Para cada empleado × cada día del rango → upsert AttendanceRecord
    for (const emp of employees) {
      const rawCode = emp[EMP_CODE_FIELD];
      const empCodeKey = EMP_PAD_LENGTH > 0 && rawCode ? rawCode.toString().padStart(EMP_PAD_LENGTH, '0') : rawCode?.toString();

      for (const dateStr of allDates) {
        const punchKey = `${empCodeKey}__${dateStr}`;
        const rawPunches = punchRaw[punchKey] || null;

        // Clasificar las marcaciones usando la ventana ±2h respecto al horario programado
        const schedule = getScheduleForDate(emp.id, emp.department_name, allSchedules, dateStr);
        const dow = new Date(dateStr + "T00:00:00").getDay();
        const dayStartMap = ["sunday_start","monday_start","tuesday_start","wednesday_start","thursday_start","friday_start","saturday_start"];
        const dayEndMap   = ["sunday_end","monday_end","tuesday_end","wednesday_end","thursday_end","friday_end","saturday_end"];
        const scheduledStart = schedule ? (schedule[dayStartMap[dow]] || DEFAULT_START) : DEFAULT_START;
        const scheduledEnd   = schedule ? (schedule[dayEndMap[dow]]   || DEFAULT_END)   : DEFAULT_END;

        const punch = rawPunches ? classifyPunches(rawPunches, scheduledStart, scheduledEnd) : null;

        const breakMinutes     = schedule?.break_duration_minutes ?? DEFAULT_BREAK;
        const toleranceMinutes = schedule?.tolerance_minutes       ?? DEFAULT_TOL;

        let clockIn = null, clockOut = null, workedHours = null;
        let isLate = false, lateMinutes = 0;
        let regularHours = 0, overtime25 = 0, overtime35 = 0;
        let isAbsent = false;
        let status = "Ausente";

        if (punch) {
          clockIn = punch.clockIn;
          clockOut = punch.clockOut;
          workedHours = punch.workedHours;

          // Tardanza
          const [inH, inM] = clockIn.split(":").map(Number);
          const [schH, schM] = scheduledStart.split(":").map(Number);
          const rawLate = (inH * 60 + inM) - (schH * 60 + schM);
          lateMinutes = rawLate > toleranceMinutes ? rawLate : 0;
          isLate = lateMinutes > 0;

          // Horas regulares y extras
          if (clockOut && workedHours) {
            const [endH, endM] = scheduledEnd.split(":").map(Number);
            const schedEndTotal = endH * 60 + endM;
            const [outH, outM] = clockOut.split(":").map(Number);
            const outTotal = outH * 60 + outM;
            const inTotal = inH * 60 + inM;
            const regularMinutes = Math.max(0, schedEndTotal - Math.max(inTotal, schH * 60 + schM) - breakMinutes);
            const normalHoursMax = regularMinutes / 60;
            if (workedHours <= normalHoursMax) {
              regularHours = workedHours;
            } else {
              regularHours = normalHoursMax;
              const extraHours = workedHours - normalHoursMax;
              const overtimeAuth = schedule?.overtime_authorized ?? false;
              if (overtimeAuth) {
                overtime25 = Math.min(extraHours, 2);
                overtime35 = Math.max(0, extraHours - 2);
              }
            }
            status = "Completo";
          } else {
            status = "Incompleto";
          }
        } else {
          isAbsent = true;
          status = "Ausente";
        }

        try {
          // Buscar registro existente
          const existingList = await base44.entities.AttendanceRecord.filter({
            employee_id: emp.id,
            date: dateStr,
          });
          const existing = existingList[0] || null;

          const recordData = {
            employee_id: emp.id,
            date: dateStr,
            clock_in: clockIn,
            clock_out: clockOut,
            worked_hours: workedHours,
            regular_hours: regularHours,
            overtime_hours_25: overtime25,
            overtime_hours_35: overtime35,
            scheduled_start: scheduledStart,
            scheduled_end: scheduledEnd,
            is_late: isLate,
            late_minutes: lateMinutes,
            is_absent: isAbsent,
            status,
          };

          if (existing) {
            // Solo actualizar si vino del Biotime (tiene marcación) o si aún no había sido justificado
            if (existing.status === "Justificado" && !punch) {
              // Respetar justificaciones existentes, no pisar con "Ausente"
              continue;
            }
            await base44.entities.AttendanceRecord.update(existing.id, recordData);
            updated++;
          } else {
            await base44.entities.AttendanceRecord.create(recordData);
            inserted++;
          }
        } catch (err) {
          errors++;
          errorDetails.push(`${emp.employee_code || emp.document_number} ${dateStr}: ${err.message}`);
        }
      }
    }

    const durationMs = Date.now() - startedAt;
    console.log(`[BiotimeSync] Finalizado: ${inserted} insertados, ${updated} actualizados, ${errors} errores. ${durationMs}ms`);

    return Response.json({
      success: true,
      inserted,
      updated,
      errors,
      errorDetails: errorDetails.slice(0, 50), // máx 50 para no saturar
      durationMs,
      range: { dateFrom: dateFromStr, dateTo: dateToStr },
      totalEmployees: employees.length,
      totalDays: allDates.length,
      totalCombinations: employees.length * allDates.length,
    });

  } catch (err) {
    console.error('[BiotimeSync] Error general:', err.message);
    return Response.json({
      success: false,
      error: err.message,
      inserted,
      updated,
      errors,
    }, { status: 500 });
  }
});