import express from "express";
import { externalAttendanceController } from "../../controllers/attendance/externalAttendanceController.js";
import { authenticateToken } from "../../middleware/auth.js";
import { loadAccessContext, requireAnyPermission } from "../../middleware/authorization.js";

const router = express.Router();

router.use(authenticateToken, loadAccessContext, requireAnyPermission("system.admin"));

router.get(
  "/external-asistencias",
  externalAttendanceController.getExternalAsistencias
);

router.post(
  "/sync",
  externalAttendanceController.syncExternalAttendance
);

export default router;
