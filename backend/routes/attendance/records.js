import express from 'express';
const router = express.Router();
import controller from '../../controllers/attendance/recordController.js';
import { authenticateToken } from '../../middleware/auth.js';
import {
  attachEmployeeScope,
  loadAccessContext,
  requireAnyPermission,
} from '../../middleware/authorization.js';

const VIEW_PERMISSIONS = [
  'attendance.view_all',
  'attendance.view_department',
  'attendance.view_own',
  'attendance.approve_edits',
  'attendance.manage',
];

router.use(authenticateToken, loadAccessContext);

router.get('/', requireAnyPermission(...VIEW_PERMISSIONS), attachEmployeeScope(...VIEW_PERMISSIONS), controller.getAll);
router.get('/:id', requireAnyPermission(...VIEW_PERMISSIONS), attachEmployeeScope(...VIEW_PERMISSIONS), controller.getById);
router.post('/', requireAnyPermission('attendance.edit', 'attendance.manage'), attachEmployeeScope('attendance.edit', 'attendance.manage'), controller.create);
router.put('/:id', requireAnyPermission('attendance.edit', 'attendance.manage'), attachEmployeeScope('attendance.edit', 'attendance.manage'), controller.update);
router.delete('/:id', requireAnyPermission('attendance.edit', 'attendance.manage'), attachEmployeeScope('attendance.edit', 'attendance.manage'), controller.delete);
router.post('/filter', requireAnyPermission(...VIEW_PERMISSIONS), attachEmployeeScope(...VIEW_PERMISSIONS), controller.filter);

export default router
