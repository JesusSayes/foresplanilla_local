import express from 'express';
const router = express.Router();
import controller from '../../controllers/payroll/loanController.js';
import { authenticateToken } from '../../middleware/auth.js';
import {
  attachEmployeeScope,
  loadAccessContext,
  requireAnyPermission,
} from '../../middleware/authorization.js';

router.use(authenticateToken, loadAccessContext);

const VIEW_PERMISSIONS = ['system.admin', 'loans.view', 'loans.manage', 'payroll.view_all'];
const MANAGE_PERMISSIONS = ['system.admin', 'loans.manage'];

router.get('/', requireAnyPermission(...VIEW_PERMISSIONS), attachEmployeeScope(...VIEW_PERMISSIONS), controller.getAll);
router.get('/:id', requireAnyPermission(...VIEW_PERMISSIONS), attachEmployeeScope(...VIEW_PERMISSIONS), controller.getById);
router.post('/', requireAnyPermission(...MANAGE_PERMISSIONS), attachEmployeeScope(...MANAGE_PERMISSIONS), controller.create);
router.put('/:id', requireAnyPermission(...MANAGE_PERMISSIONS), attachEmployeeScope(...MANAGE_PERMISSIONS), controller.update);
router.delete('/:id', requireAnyPermission(...MANAGE_PERMISSIONS), attachEmployeeScope(...MANAGE_PERMISSIONS), controller.delete);
router.post('/filter', requireAnyPermission(...VIEW_PERMISSIONS), attachEmployeeScope(...VIEW_PERMISSIONS), controller.filter);

export default router;
