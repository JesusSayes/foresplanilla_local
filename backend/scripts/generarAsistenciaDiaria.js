import { PrismaClient } from '@prisma/client';
import { generate24HexId } from '../utils/idGenerator.js';
import { employmentEndDate, isEmploymentDateValid } from '../utils/employmentDate.js';

const prisma = new PrismaClient();

const DAY_NAMES = ["sunday","monday","tuesday","wednesday","thursday","friday","saturday"];

function getScheduleForDate(employeeId, departmentName, schedules, dateStr) {
  const candidates = schedules.filter(s => {
    const isForEmployee = s.employee_id === employeeId;
    const isForDept = !s.employee_id && departmentName &&
      (Array.isArray(s.departments)
        ? s.departments.includes(departmentName)
        : s.department_name === departmentName);
    return isForEmployee || isForDept;
  });

  const findBest = (list) => {
    const valid = list.filter(s => {
      const from = s.effective_from ? s.effective_from.toISOString().slice(0,10) : "0000-01-01";
      const to   = s.effective_to   ? s.effective_to.toISOString().slice(0,10)   : "9999-12-31";
      return from <= dateStr && dateStr <= to;
    });
    valid.sort((a, b) => {
      const af = a.effective_from ? a.effective_from.toISOString().slice(0,10) : "0000-01-01";
      const bf = b.effective_from ? b.effective_from.toISOString().slice(0,10) : "0000-01-01";
      return bf.localeCompare(af);
    });
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

/**
 * Genera automáticamente registros de asistencia para todos los empleados activos.
 *
 * Modos de uso:
 * 1. CRON DIARIO (sin parámetros): solo genera el registro de HOY para todos los empleados.
 * 2. BACKFILL (date_from): genera registros desde date_from hasta hoy, de a employee_batch empleados.
 *
 * Params opcionales:
 *   date_from      → fecha mínima de inicio, ej: "2026-01-01" (activa modo backfill)
 *   employee_id    → procesar solo un empleado específico
 *   employee_batch → cuántos empleados procesar por llamada (default: 200 en cron, 5 en backfill)
 *   skip_employees → saltar los primeros N empleados (para paginación de backfill)
 */
export async function generarAsistenciaDiaria({ date_from = null, employee_id = null, employee_batch = null, cursor_employee = null } = {}) {
  const forcedDateFrom   = date_from;
  const filterEmployeeId = employee_id;
  const isBackfill       = !!forcedDateFrom;
  const defaultBatch     = isBackfill ? 5 : 200;
  const rawBatch         = parseInt(employee_batch, 10) || defaultBatch;
  const employeeBatch    = Math.min(Math.max(1, rawBatch), 200);
  const todayStr         = todayInPeru();

  const [schedulesRaw, holidaysRaw, contractsRaw] = await Promise.all([
    prisma.work_schedule.findMany({ where: { is_active: true }, orderBy: { id: 'asc' } }),
    prisma.holiday.findMany({ orderBy: { date: 'desc' } }),
    prisma.contract.findMany({ orderBy: [{ employee_id: 'asc' }, { start_date: 'desc' }, { id: 'desc' }] }),
  ]);

  const holidayDates = new Set(holidaysRaw.map(h => h.date ? h.date.toISOString().slice(0,10) : ""));
  const contractsByEmployee = new Map();
  for (const contract of contractsRaw) {
    const employeeContracts = contractsByEmployee.get(contract.employee_id) || [];
    employeeContracts.push(contract);
    contractsByEmployee.set(contract.employee_id, employeeContracts);
  }

  let employees = [];
  if (filterEmployeeId) {
    employees = await prisma.employee.findMany({
      where:   { status: "Activo", id: filterEmployeeId },
      orderBy: { id: 'asc' },
      take:    1,
    });
  } else if (isBackfill) {
    employees = await prisma.employee.findMany({
      where:   { status: "Activo" },
      orderBy: { id: 'asc' },
      take:    employeeBatch,
      ...(cursor_employee ? { cursor: { id: cursor_employee }, skip: 1 } : {}),
    });
  } else {
    let employeeCursor = cursor_employee;
    while (true) {
      const page = await prisma.employee.findMany({
        where:   { status: "Activo" },
        orderBy: { id: 'asc' },
        take:    employeeBatch,
        ...(employeeCursor ? { cursor: { id: employeeCursor }, skip: 1 } : {}),
      });
      employees.push(...page);
      if (page.length < employeeBatch) break;
      employeeCursor = page[page.length - 1].id;
    }
  }

  const totalActive = await prisma.employee.count({ where: { status: "Activo" } });

  let totalCreated = 0;
  let totalSkipped = 0;
  const errors = [];

  for (const emp of employees) {
    try {
      const employeeContracts = contractsByEmployee.get(emp.id) || [];
      const empContract = employeeContracts.find(c => c.status === "Vigente") || employeeContracts[0] || null;
      const startDateRaw = empContract?.start_date || emp.hire_date || emp.created_date;

      if (!startDateRaw) { totalSkipped++; continue; }

      const contractStart = startDateRaw.toISOString().slice(0, 10);
      const startStr = isBackfill
        ? ((forcedDateFrom > contractStart) ? forcedDateFrom : contractStart)
        : todayStr;
      const endStr = employmentEndDate(emp, todayStr);

      if (!endStr || startStr > endStr || !isEmploymentDateValid(emp, startStr)) {
        totalSkipped++;
        continue;
      }

      // Paginación con cursor sobre registros existentes del empleado
      const existingDates = new Set();
      let cursorRecord = null;
      while (true) {
        const page = await prisma.attendance_record.findMany({
          where:   { employee_id: emp.id, ...(isBackfill ? {} : { date: new Date(todayStr + "T00:00:00") }) },
          select:  { id: true, date: true },
          orderBy: { id: 'asc' },
          take:    500,
          ...(cursorRecord ? { cursor: { id: cursorRecord }, skip: 1 } : {}),
        });
        for (const r of page) {
          if (r.date) existingDates.add(r.date.toISOString().slice(0,10));
        }
        if (page.length < 500) break;
        cursorRecord = page[page.length - 1].id;
      }

      const allDates        = dateRange(startStr, endStr);
      const recordsToCreate = [];

      for (const dateStr of allDates) {
        if (existingDates.has(dateStr)) continue;
        if (holidayDates.has(dateStr)) continue;

        const schedule = getScheduleForDate(emp.id, emp.department_name, schedulesRaw, dateStr);
        if (!schedule) continue;

        const dow    = new Date(dateStr + "T00:00:00").getDay();
        const day    = DAY_NAMES[dow];
        const startT = schedule[`${day}_start`];
        const endT   = schedule[`${day}_end`];

        if (!startT || !endT || startT.trim() === "" || endT.trim() === "") continue;

        const isExempt  = !!schedule.exempt_from_clocking;
        const breakMin  = schedule.break_duration_minutes || 60;
        const worked    = isExempt ? calcWorkedHours(startT, endT, breakMin) : 0;
        const overtimeAuth = schedule.overtime_authorized || false;

        recordsToCreate.push({
          id:                  generate24HexId(),
          employee_id:         emp.id,
          date:                new Date(dateStr + "T00:00:00"),
          scheduled_start:     startT,
          scheduled_end:       endT,
          clock_in:            isExempt ? startT : null,
          clock_out:           isExempt ? endT   : null,
          worked_hours:        worked,
          regular_hours:       worked,
          overtime_hours_25:   0,
          overtime_hours_35:   0,
          overtime_authorized: overtimeAuth,
          is_late:             false,
          late_minutes:        0,
          is_absent:           false,
          status:              isExempt ? "Completo" : "Ausente",
          notes:               isExempt
            ? "Registro automático - Exonerado de marcación física"
            : "Registro generado automáticamente - Pendiente de marcación",
          created_date:        new Date(),
          updated_date:        new Date(),
        });

        existingDates.add(dateStr);
      }

      if (recordsToCreate.length > 0) {
        await prisma.attendance_record.createMany({ data: recordsToCreate, skipDuplicates: true });
        totalCreated += recordsToCreate.length;
      }

    } catch (empError) {
      errors.push({ employee_id: emp.id, name: `${emp.first_name} ${emp.last_name}`, error: empError.message });
    }
  }

  const lastEmployee  = employees[employees.length - 1];
  const nextCursor    = (!filterEmployeeId && isBackfill && employees.length === employeeBatch) ? lastEmployee?.id : null;

  return {
    success:                true,
    mode:                   isBackfill ? "backfill" : "cron_diario",
    date:                   todayStr,
    employees_processed:    employees.length,
    records_created:        totalCreated,
    records_skipped:        totalSkipped,
    total_active_employees: totalActive,
    next_cursor:            nextCursor,
    has_more:               !!nextCursor,
    errors:                 errors.length > 0 ? errors : undefined,
  };
}

if (process.argv[1].endsWith('generarAsistenciaDiaria.js')) {
  const args = {};
  for (let i = 2; i < process.argv.length; i++) {
    const [k, v] = process.argv[i].split('=');
    if (k && v) args[k.replace('--','')] = v;
  }
  generarAsistenciaDiaria(args)
    .then(r => { console.log(JSON.stringify(r, null, 2)); process.exit(0); })
    .catch(e => { console.error(e); process.exit(1); })
    .finally(() => prisma.$disconnect());
}
