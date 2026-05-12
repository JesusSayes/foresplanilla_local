import 'dotenv/config';
import { generarAsistenciaDiaria } from './generarAsistenciaDiaria.js';

const args = {};
for (let i = 2; i < process.argv.length; i++) {
  const [k, v] = process.argv[i].split('=');
  if (k && v !== undefined) args[k.replace(/^--/, '')] = v;
}

const options = {
  date_from: args.date_from || null,
  employee_batch: args.employee_batch ? Number(args.employee_batch) : null,
  employee_id: args.employee_id || null,
};

if (!options.date_from && !options.employee_id) {
  console.error('Debes enviar --date_from=YYYY-MM-DD o --employee_id=<ID>');
  process.exit(1);
}

(async () => {
  try {
    let cursor = null;
    let rounds = 0;
    let totalProcessed = 0;
    let totalCreated = 0;
    let totalSkipped = 0;
    const allErrors = [];

    while (true) {
      const result = await generarAsistenciaDiaria({
        ...options,
        cursor_employee: cursor,
      });

      rounds += 1;
      totalProcessed += result.employees_processed || 0;
      totalCreated += result.records_created || 0;
      totalSkipped += result.records_skipped || 0;
      if (Array.isArray(result.errors) && result.errors.length) {
        allErrors.push(...result.errors);
      }

      console.log(JSON.stringify({
        round: rounds,
        processed: result.employees_processed,
        created: result.records_created,
        skipped: result.records_skipped,
        next_cursor: result.next_cursor,
        has_more: result.has_more,
      }, null, 2));

      if (!result.has_more || !result.next_cursor || options.employee_id) break;
      cursor = result.next_cursor;
    }

    console.log(JSON.stringify({
      success: true,
      rounds,
      total_processed: totalProcessed,
      total_created: totalCreated,
      total_skipped: totalSkipped,
      total_errors: allErrors.length,
      errors: allErrors.length ? allErrors : undefined,
    }, null, 2));

    process.exit(0);
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
})();

/**
Usage:
cd backend
node scripts/runGenerarAsistenciaDiariaBackfill.js --date_from=2026-01-01 --employee_batch=50

1 only employee:
cd backend
node scripts/runGenerarAsistenciaDiariaBackfill.js --employee_id=<ID_NUEVO> --date_from=2026-01-01
*/