import "dotenv/config";
import { syncExternalAttendance } from "../services/externalAttendanceSync.js";

(async () => {
  try {
    const result = await syncExternalAttendance();

    console.log(result);

    process.exit(0);
  } catch (err) {
    console.error(err);

    process.exit(1);
  }
})();
