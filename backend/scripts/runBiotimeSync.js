// backend/scripts/runBiotimeSync.js
import 'dotenv/config';
import { syncBiotimeAttendance } from '../controllers/sync/biotimeSyncController.js';

(async () => {
  try {
    const result = await syncBiotimeAttendance();
    console.log('Sync result:', result);
    process.exit(0);
  } catch (err) {
    console.error('Error running Biotime sync:', err);
    process.exit(1);
  }
})();

// cd backend
// npm run sync:biotime

