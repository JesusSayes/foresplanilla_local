import 'dotenv/config';
import prisma from '../config/prisma.js';
import { generate24HexId } from '../utils/idGenerator.js';

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
    let current = toUtcDateOnly(request.start_date);
    const end = toUtcDateOnly(request.end_date);

    while (current <= end) {
      const attendanceDate = new Date(current);
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
          data: {
            status: 'Justificado',
            notes: 'Regularización automática por vacaciones aprobadas',
            is_absent: false,
            is_late: false,
            late_minutes: 0,
            updated_date: new Date()
          }
        });
        updated++;
      } else {
        await prisma.attendance_record.create({
          data: {
            id: generate24HexId(),
            employee_id: request.employee_id,
            date: attendanceDate,
            status: 'Justificado',
            notes: 'Regularización automática por vacaciones aprobadas',
            is_absent: false,
            is_late: false,
            late_minutes: 0,
            created_date: new Date(),
            updated_date: new Date(),
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
