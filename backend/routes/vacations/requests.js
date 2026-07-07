import express from 'express';
const router = express.Router();
import controller from '../../controllers/vacations/requestController.js';
import { authenticateToken } from '../../middleware/auth.js';
import {
  attachEmployeeScope,
  loadAccessContext,
  requireAnyPermission,
} from '../../middleware/authorization.js';

router.use(authenticateToken, loadAccessContext);

const VIEW_PERMISSIONS = ['system.admin', 'vacations.view_all', 'vacations.view_department', 'vacations.view_own', 'vacations.approve', 'vacations.manage'];
const CREATE_PERMISSIONS = ['system.admin', 'vacations.view_own', 'vacations.approve', 'vacations.manage'];
const UPDATE_PERMISSIONS = ['system.admin', 'vacations.approve', 'vacations.manage', 'vacations.view_own'];
const DELETE_PERMISSIONS = ['system.admin', 'vacations.manage', 'vacations.view_own'];

router.get('/', requireAnyPermission(...VIEW_PERMISSIONS), attachEmployeeScope(...VIEW_PERMISSIONS), controller.getAll);
router.get('/:id', requireAnyPermission(...VIEW_PERMISSIONS), attachEmployeeScope(...VIEW_PERMISSIONS), controller.getById);
router.post('/', requireAnyPermission(...CREATE_PERMISSIONS), attachEmployeeScope(...CREATE_PERMISSIONS), controller.create);
router.put('/:id', requireAnyPermission(...UPDATE_PERMISSIONS), attachEmployeeScope(...UPDATE_PERMISSIONS), controller.update);
router.delete('/:id', requireAnyPermission(...DELETE_PERMISSIONS), attachEmployeeScope(...DELETE_PERMISSIONS), controller.delete);
router.post('/filter', requireAnyPermission(...VIEW_PERMISSIONS), attachEmployeeScope(...VIEW_PERMISSIONS), controller.filter);

export default router
