import express from 'express';
import { authenticateToken } from '../middleware/auth.js';
import controller from '../controllers/historialRemunerativoController.js';
import {
  attachEmployeeScope,
  loadAccessContext,
  requireAnyPermission,
} from '../middleware/authorization.js';

const router = express.Router();

router.use(authenticateToken, loadAccessContext);

const VIEW_PERMISSIONS = ['system.admin', 'payroll.view_all', 'payroll.view_department', 'payroll.view_own'];
const CREATE_PERMISSIONS = ['system.admin', 'payroll.create', 'payroll.calculate'];
const UPDATE_PERMISSIONS = ['system.admin', 'payroll.edit'];
const DELETE_PERMISSIONS = ['system.admin', 'payroll.delete'];

router.get('/', requireAnyPermission(...VIEW_PERMISSIONS), attachEmployeeScope(...VIEW_PERMISSIONS), controller.getAll);
router.get('/:id', requireAnyPermission(...VIEW_PERMISSIONS), attachEmployeeScope(...VIEW_PERMISSIONS), controller.getById);
router.post('/filter', requireAnyPermission(...VIEW_PERMISSIONS), attachEmployeeScope(...VIEW_PERMISSIONS), controller.filter);
router.post('/bulk', requireAnyPermission(...CREATE_PERMISSIONS), attachEmployeeScope(...CREATE_PERMISSIONS), controller.bulkCreate);
router.post('/', requireAnyPermission(...CREATE_PERMISSIONS), attachEmployeeScope(...CREATE_PERMISSIONS), controller.create);
router.put('/:id', requireAnyPermission(...UPDATE_PERMISSIONS), attachEmployeeScope(...UPDATE_PERMISSIONS), controller.update);
router.delete('/:id', requireAnyPermission(...DELETE_PERMISSIONS), attachEmployeeScope(...DELETE_PERMISSIONS), controller.delete);

export default router;
