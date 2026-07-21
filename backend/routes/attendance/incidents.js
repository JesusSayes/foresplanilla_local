import express from 'express';
const router = express.Router();
import controller from '../../controllers/attendance/incidentController.js';
import { authenticateToken } from '../../middleware/auth.js';
import { attachEmployeeScope, loadAccessContext, requireAnyPermission } from '../../middleware/authorization.js';

const CREATE_PERMISSIONS = ['attendance.view_all', 'attendance.view_department', 'attendance.view_own', 'attendance.approve_compensations', 'attendance.manage'];
const VIEW_PERMISSIONS = [...CREATE_PERMISSIONS, 'attendance.approve_edits', 'attendance.approve_incidents'];

router.use(authenticateToken, loadAccessContext);

router.get('/', requireAnyPermission(...VIEW_PERMISSIONS), attachEmployeeScope(...VIEW_PERMISSIONS), controller.getAll);
router.get('/:id', requireAnyPermission(...VIEW_PERMISSIONS), attachEmployeeScope(...VIEW_PERMISSIONS), controller.getById);
router.post('/', requireAnyPermission(...CREATE_PERMISSIONS), attachEmployeeScope(...CREATE_PERMISSIONS), controller.create);
router.put('/:id', requireAnyPermission('attendance.edit', 'attendance.approve_incidents', 'attendance.approve_compensations', 'attendance.manage'), attachEmployeeScope('attendance.edit', 'attendance.approve_incidents', 'attendance.approve_compensations', 'attendance.manage'), controller.update);
router.delete('/:id', requireAnyPermission('attendance.edit', 'attendance.approve_compensations', 'attendance.manage'), attachEmployeeScope('attendance.edit', 'attendance.approve_compensations', 'attendance.manage'), controller.delete);

router.post('/filter', requireAnyPermission(...VIEW_PERMISSIONS), attachEmployeeScope(...VIEW_PERMISSIONS), controller.filter);

export default router
