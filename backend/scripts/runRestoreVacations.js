import "dotenv/config";

import {
  restoreVacationsAttendance,
} from "./restoreVacationsAttendance.js";

const [, , startDate, endDate] =
  process.argv;

(async () => {
  const result =
    await restoreVacationsAttendance({
      startDate,
      endDate,
    });

  console.log(result);
  process.exit(0);
})();

/*
 * RUN
 * node scripts/runRestoreVacations.js 2026-05-15 2026-05-18
 */
