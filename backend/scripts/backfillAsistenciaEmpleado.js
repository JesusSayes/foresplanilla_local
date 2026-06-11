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

/**
 * Backfill de asistencia para UN empleado específico.
 * Rellena registros históricos faltantes desde date_from hasta hoy.
 *
 * Params:
 *   employee_id → (requerido) ID del empleado
 *   date_from   → fecha de inicio del backfill (default: "2026-01-01")
 */
export async function backfillAsistenciaEmpleado({ employee_id, date_from = "2026-01-01" } = {}) {
  if (!employee_id) throw new Error('employee_id es requerido');

  const todayStr = todayInPeru();

  const [emp, schedulesRaw, holidaysRaw, contractsRaw] = await Promise.all([
    prisma.employee.findUnique({ where: { id: employee_id } }),
    prisma.work_schedule.findMany({ where: { is_active: true }, orderBy: { id: 'asc' } }),
    prisma.holiday.findMany({ orderBy: { date: 'desc' } }),
    prisma.contract.findMany({ where: { employee_id }, orderBy: [{ start_date: 'desc' }, { id: 'desc' }] }),
  ]);

  if (!emp) throw new Error('Empleado no encontrado');

  const selectedContract = contractsRaw.find(c => c.status === "Vigente") || contractsRaw[0] || null;
  const startDateRaw = selectedContract?.start_date || emp.hire_date || emp.created_date;
  if (!startDateRaw) throw new Error('El empleado no tiene fecha de ingreso, fecha de creación ni contrato');

  const holidayDates = new Set(holidaysRaw.map(h => h.date ? h.date.toISOString().slice(0,10) : ""));

  // Paginación con cursor sobre registros existentes del empleado
  const existingDates = new Set();
  let cursorRecord = null;
  while (true) {
    const page = await prisma.attendance_record.findMany({
      where:   { employee_id },
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

  const contractStart = startDateRaw.toISOString().slice(0, 10);
  const startStr      = date_from > contractStart ? date_from : contractStart;
  const endStr        = employmentEndDate(emp, todayStr);

  if (!endStr || startStr > endStr || !isEmploymentDateValid(emp, startStr)) {
    return { success: true, records_created: 0, message: "El rango está fuera del período laboral" };
  }

  const allDates        = dateRange(startStr, endStr);
  const recordsToCreate = [];

  for (const dateStr of allDates) {
    if (existingDates.has(dateStr)) continue;
    if (holidayDates.has(dateStr)) continue;

    const schedule = getScheduleForDate(employee_id, emp.department_name, schedulesRaw, dateStr);
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
      employee_id,
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
      is_absent:           !isExempt,
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
  }

  return {
    success:         true,
    employee_id,
    employee_name:   `${emp.first_name} ${emp.last_name}`,
    date_from:       startStr,
    date_to:         endStr,
    records_created: recordsToCreate.length,
    already_existed: existingDates.size - recordsToCreate.length,
  };
}

if (process.argv[1].endsWith('backfillAsistenciaEmpleado.js')) {
  const args = {};
  for (let i = 2; i < process.argv.length; i++) {
    const [k, v] = process.argv[i].split('=');
    if (k && v) args[k.replace('--','')] = v;
  }
  backfillAsistenciaEmpleado(args)
    .then(r => { console.log(JSON.stringify(r, null, 2)); process.exit(0); })
    .catch(e => { console.error(e.message); process.exit(1); })
    .finally(() => prisma.$disconnect());
}
