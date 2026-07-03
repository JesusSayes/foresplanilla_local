import express from 'express';
import { authenticateToken } from '../middleware/auth.js';
import {
  listEmployees,
  filterEmployees,
  getEmployee,
  createEmployee,
  updateEmployee,
  deleteEmployee
} from '../controllers/employeeController.js';
import { listAccessibleEmployees } from '../controllers/employeeController.js';
import {
  attachOwnOrAdminScope,
  attachEmployeeScope,
  loadAccessContext,
  requireAnyPermission,
} from '../middleware/authorization.js';

const router = express.Router();

router.use(authenticateToken);

router.get('/accessible', loadAccessContext, listAccessibleEmployees);
router.get('/', loadAccessContext, attachOwnOrAdminScope, listEmployees);
router.post('/filter', loadAccessContext, attachOwnOrAdminScope, filterEmployees);
router.get('/:id', loadAccessContext, attachOwnOrAdminScope, getEmployee);
router.post('/', loadAccessContext, requireAnyPermission('system.admin'), createEmployee);
router.put('/:id', loadAccessContext, requireAnyPermission('system.admin'), attachEmployeeScope('system.admin'), updateEmployee);
router.delete('/:id', loadAccessContext, requireAnyPermission('system.admin'), attachEmployeeScope('system.admin'), deleteEmployee);

export default router;
