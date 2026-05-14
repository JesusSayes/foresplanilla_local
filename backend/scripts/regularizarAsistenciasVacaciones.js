import 'dotenv/config';
import prisma from '../config/prisma.js';
import { generate24HexId } from '../utils/idGenerator.js';

const DAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i++) {
    const part = argv[i];
    if (!part.startsWith('--')) continue;
    const [rawKey, rawValue] = part.split('=');
    const key = rawKey.replace('--', '').trim();
    const value = rawValue === undefined ? true : rawValue.trim();
    args[key] = value;
  }
  return args;
}

function toUtcDateOnly(value) {
  const date = new Date(value);
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function toDateStr(dateValue) {
  return new Date(dateValue).toISOString().slice(0, 10);
}

function getScheduleForDate(employeeId, departmentName, schedules, dateStr) {
  const candidates = schedules.filter(s => {
    const isForEmployee = s.employee_id === employeeId;
    const isForDept = !s.employee_id && departmentName && (
      Array.isArray(s.departments)
        ? s.departments.includes(departmentName)
        : s.department_name === departmentName
    );
    return isForEmployee || isForDept;
  });

  const findBest = list => {
    const valid = list.filter(s => {
      const from = s.effective_from ? toDateStr(s.effective_from) : '0000-01-01';
      const to = s.effective_to ? toDateStr(s.effective_to) : '9999-12-31';
      return from <= dateStr && dateStr <= to;
    });

    valid.sort((a, b) => {
      const af = a.effective_from ? toDateStr(a.effective_from) : '0000-01-01';
      const bf = b.effective_from ? toDateStr(b.effective_from) : '0000-01-01';
      return bf.localeCompare(af);
    });

    return valid[0] || null;
  };

  return findBest(candidates.filter(s => s.employee_id === employeeId))
    || findBest(candidates.filter(s => !s.employee_id))
    || null;
}

function calcWorkedHours(startTime, endTime, breakMinutes) {
  const [sh, sm] = startTime.split(':').map(Number);
  const [eh, em] = endTime.split(':').map(Number);
  return Math.max(0, ((eh * 60 + em) - (sh * 60 + sm) - (breakMinutes || 60)) / 60);
}

function buildWhere(args) {
  const where = {
    status: { in: ['Aprobada', 'Aprobado'] }
  };

  if (args.employee_id) {
    where.employee_id = args.employee_id;
  }

  if (args.date_from || args.date_to) {
    where.AND = [];
    if (args.date_from) {
      where.AND.push({ end_date: { gte: new Date(`${args.date_from}T00:00:00.000Z`) } });
    }
    if (args.date_to) {
      where.AND.push({ start_date: { lte: new Date(`${args.date_to}T23:59:59.999Z`) } });
    }
  }

  return where;
}

export async function regularizarAsistenciasVacaciones(args = {}) {
  const dryRun = String(args.dry_run || '').toLowerCase() === 'true' || args.dry_run === true;
  const where = buildWhere(args);

  const requests = await prisma.vacation_request.findMany({
    where,
    select: {
      id: true,
      employee_id: true,
      start_date: true,
      end_date: true,
      status: true
    },
    orderBy: [{ start_date: 'asc' }, { employee_id: 'asc' }]
  });

  const [schedulesRaw, employees] = await Promise.all([
    prisma.work_schedule.findMany({ where: { is_active: true }, orderBy: { id: 'asc' } }),
    prisma.employee.findMany({ where: { status: 'Activo' }, select: { id: true, department_name: true } })
  ]);

  const employeeMap = new Map(employees.map(e => [e.id, e]));

  let created = 0;
  let updated = 0;
  let skipped = 0;
  let requestsProcessed = 0;

  for (const request of requests) {
    if (!request.employee_id || !request.start_date || !request.end_date) {
      skipped++;
      continue;
    }

    requestsProcessed++;
    const employee = employeeMap.get(request.employee_id);
    let current = toUtcDateOnly(request.start_date);
    const end = toUtcDateOnly(request.end_date);

    while (current <= end) {
      const attendanceDate = new Date(current);
      const dateStr = attendanceDate.toISOString().slice(0, 10);
      const schedule = getScheduleForDate(request.employee_id, employee?.department_name, schedulesRaw, dateStr);

      if (!schedule) {
        skipped++;
        current.setUTCDate(current.getUTCDate() + 1);
        continue;
      }

      const dow = new Date(`${dateStr}T00:00:00`).getDay();
      const day = DAY_NAMES[dow];
      const startT = schedule[`${day}_start`];
      const endT = schedule[`${day}_end`];

      if (!startT || !endT || startT.trim() === '' || endT.trim() === '') {
        skipped++;
        current.setUTCDate(current.getUTCDate() + 1);
        continue;
      }

      const breakMin = schedule.break_duration_minutes || 60;
      const worked = calcWorkedHours(startT, endT, breakMin);
      const overtimeAuth = schedule.overtime_authorized || false;

      const data = {
        scheduled_start: startT,
        scheduled_end: endT,
        clock_in: startT,
        clock_out: endT,
        worked_hours: worked,
        regular_hours: worked,
        overtime_hours_25: 0,
        overtime_hours_35: 0,
        overtime_authorized: overtimeAuth,
        status: 'Justificado',
        notes: 'Regularización automática por vacaciones aprobadas',
        is_absent: false,
        is_late: false,
        late_minutes: 0,
        updated_date: new Date()
      };

      const existing = await prisma.attendance_record.findUnique({
        where: {
          employee_id_date: {
            employee_id: request.employee_id,
            date: attendanceDate
          }
        },
        select: { id: true }
      });

      if (dryRun) {
        if (existing) updated++;
        else created++;
      } else if (existing) {
        await prisma.attendance_record.update({
          where: { id: existing.id },
          data
        });
        updated++;
      } else {
        await prisma.attendance_record.create({
          data: {
            id: generate24HexId(),
            employee_id: request.employee_id,
            date: attendanceDate,
            ...data,
            created_date: new Date(),
            created_by: 'system-script'
          }
        });
        created++;
      }

      current.setUTCDate(current.getUTCDate() + 1);
    }
  }

  return {
    success: true,
    dry_run: dryRun,
    filters: {
      employee_id: args.employee_id || null,
      date_from: args.date_from || null,
      date_to: args.date_to || null
    },
    requests_found: requests.length,
    requests_processed: requestsProcessed,
    records_created: created,
    records_updated: updated,
    requests_skipped: skipped
  };
}

if (process.argv[1]?.includes('regularizarAsistenciasVacaciones')) {
  const args = parseArgs(process.argv);
  regularizarAsistenciasVacaciones(args)
    .then(result => {
      console.log(JSON.stringify(result, null, 2));
      process.exit(0);
    })
    .catch(error => {
      console.error(error);
      process.exit(1);
    })
    .finally(() => prisma.$disconnect());
}

/*
node backend/scripts/regularizarAsistenciasVacaciones.js --dry_run=true
node backend/scripts/regularizarAsistenciasVacaciones.js --employee_id=EMP001
node backend/scripts/regularizarAsistenciasVacaciones.js --date_from=2026-01-01 --date_to=2026-01-31
node backend/scripts/regularizarAsistenciasVacaciones.js --employee_id=EMP001 --date_from=2026-01-01 --date_to=2026-01-31 --dry_run=true
*/
