import {
  restoreExemptAttendance,
} from "./restoreExemptAttendance.js";

const startDate = process.argv[2];
const endDate = process.argv[3];

if (!startDate || !endDate) {
  console.error(
    "Uso: node scripts/runRestoreExemptAttendance.js YYYY-MM-DD YYYY-MM-DD"
  );

  process.exit(1);
}

try {

  console.log(
    `[EXONERADOS] Procesando desde ${startDate} hasta ${endDate}`
  );

  const result =
    await restoreExemptAttendance({
      startDate,
      endDate,
    });

  console.log(result);

  process.exit(0);

} catch (error) {

  console.error(
    "[EXONERADOS] Error:",
    error
  );

  process.exit(1);
}
