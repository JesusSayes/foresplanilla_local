import express from 'express';
const router = express.Router();
import controller from '../../controllers/attendance/scheduleController.js';
import { authenticateToken } from '../../middleware/auth.js';
import { attachEmployeeScope, loadAccessContext, requireAnyPermission } from '../../middleware/authorization.js';

router.use(authenticateToken, loadAccessContext);

router.get('/', requireAnyPermission('attendance.view_all', 'attendance.view_department', 'attendance.view_own', 'attendance.manage_schedules'), attachEmployeeScope('attendance.view_all', 'attendance.view_department', 'attendance.view_own', 'attendance.manage_schedules'), controller.getAll);
router.get('/:id', requireAnyPermission('attendance.view_all', 'attendance.view_department', 'attendance.view_own', 'attendance.manage_schedules'), attachEmployeeScope('attendance.view_all', 'attendance.view_department', 'attendance.view_own', 'attendance.manage_schedules'), controller.getById);
router.post('/', requireAnyPermission('attendance.manage_schedules'), attachEmployeeScope('attendance.manage_schedules'), controller.create);
router.put('/:id', requireAnyPermission('attendance.manage_schedules'), attachEmployeeScope('attendance.manage_schedules'), controller.update);
router.delete('/:id', requireAnyPermission('attendance.manage_schedules'), attachEmployeeScope('attendance.manage_schedules'), controller.delete);
router.post('/filter', requireAnyPermission('attendance.view_all', 'attendance.view_department', 'attendance.view_own', 'attendance.manage_schedules'), attachEmployeeScope('attendance.view_all', 'attendance.view_department', 'attendance.view_own', 'attendance.manage_schedules'), controller.filter);

export default router
