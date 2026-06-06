import express from "express";
import controller from "../../controllers/attendance/logsController.js";
import { authenticateToken } from "../../middleware/auth.js";
import { attachEmployeeScope, loadAccessContext, requireAnyPermission } from "../../middleware/authorization.js";

const router = express.Router();

router.use(
  authenticateToken,
  loadAccessContext,
  requireAnyPermission('attendance.edit', 'attendance.view_all', 'attendance.view_department', 'attendance.view_own'),
  attachEmployeeScope('attendance.edit', 'attendance.view_all', 'attendance.view_department', 'attendance.view_own'),
);

router.get("/", controller.getByEmployeeAndDate);

export default router;
