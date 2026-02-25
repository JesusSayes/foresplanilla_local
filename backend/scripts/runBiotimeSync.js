// backend/scripts/runBiotimeSync.js
import 'dotenv/config';
import { syncBiotimeAttendance } from '../controllers/sync/biotimeSyncController.js';

const [,, startDate, endDate] = process.argv;

(async () => {
  try {
    const result = await syncBiotimeAttendance({ startDate, endDate });
    console.log('Sync result:', result);
    process.exit(0);
  } catch (err) {
    console.error('Error running Biotime sync:', err);
    process.exit(1);
  }
})();

// cd backend
// npm run sync:biotime 2026-02-01 2026-02-25

