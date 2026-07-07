import express from "express";
import controller from "../../controllers/attendance/editRequestController.js";
import { authenticateToken } from "../../middleware/auth.js";
import { attachEmployeeScope, loadAccessContext, requireAnyPermission } from "../../middleware/authorization.js";

const router = express.Router();
const VIEW_PERMISSIONS = [
  "attendance.view_all",
  "attendance.view_department",
  "attendance.edit",
  "attendance.approve_edits",
  "attendance.manage",
];

router.use(authenticateToken, loadAccessContext);

router.get("/", requireAnyPermission(...VIEW_PERMISSIONS), attachEmployeeScope(...VIEW_PERMISSIONS), controller.getAll);
router.post("/filter", requireAnyPermission(...VIEW_PERMISSIONS), attachEmployeeScope(...VIEW_PERMISSIONS), controller.filter);
router.post("/:id/approve", requireAnyPermission("attendance.approve_edits", "attendance.manage"), attachEmployeeScope("attendance.approve_edits", "attendance.manage"), controller.approve);
router.post("/:id/reject", requireAnyPermission("attendance.approve_edits", "attendance.manage"), attachEmployeeScope("attendance.approve_edits", "attendance.manage"), controller.reject);
router.post("/:id/cancel", requireAnyPermission("attendance.edit", "attendance.approve_edits", "attendance.manage"), attachEmployeeScope("attendance.edit", "attendance.approve_edits", "attendance.manage"), controller.cancel);
router.get("/:id", requireAnyPermission(...VIEW_PERMISSIONS), attachEmployeeScope(...VIEW_PERMISSIONS), controller.getById);
router.post("/", requireAnyPermission("attendance.edit", "attendance.manage"), attachEmployeeScope("attendance.edit", "attendance.manage"), controller.create);

export default router;
