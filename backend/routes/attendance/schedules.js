import express from 'express';
const router = express.Router();
import controller from '../../controllers/attendance/scheduleController.js';
import { authenticateToken } from '../../middleware/auth.js';
import { attachEmployeeScope, loadAccessContext, requireAnyPermission } from '../../middleware/authorization.js';
import { SCHEDULE_PERMISSION_GROUPS } from '../../config/permissions.js';

router.use(authenticateToken, loadAccessContext);

const {
  view: VIEW_PERMISSIONS,
  create: CREATE_PERMISSIONS,
  update: UPDATE_PERMISSIONS,
  delete: DELETE_PERMISSIONS,
} = SCHEDULE_PERMISSION_GROUPS;

router.get('/', requireAnyPermission(...VIEW_PERMISSIONS), attachEmployeeScope(...VIEW_PERMISSIONS), controller.getAll);
router.get('/:id', requireAnyPermission(...VIEW_PERMISSIONS), attachEmployeeScope(...VIEW_PERMISSIONS), controller.getById);
router.post('/', requireAnyPermission(...CREATE_PERMISSIONS), attachEmployeeScope(...CREATE_PERMISSIONS), controller.create);
router.put('/:id', requireAnyPermission(...UPDATE_PERMISSIONS), attachEmployeeScope(...UPDATE_PERMISSIONS), controller.update);
router.delete('/:id', requireAnyPermission(...DELETE_PERMISSIONS), attachEmployeeScope(...DELETE_PERMISSIONS), controller.delete);
router.post('/filter', requireAnyPermission(...VIEW_PERMISSIONS), attachEmployeeScope(...VIEW_PERMISSIONS), controller.filter);

export default router
