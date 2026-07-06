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
  attachEmployeeReadScope,
  attachEmployeeScope,
  loadAccessContext,
  requireAnyPermission,
} from '../middleware/authorization.js';

const router = express.Router();

router.use(authenticateToken);

router.get('/accessible', loadAccessContext, listAccessibleEmployees);
router.get('/', loadAccessContext, attachEmployeeReadScope, listEmployees);
router.post('/filter', loadAccessContext, attachEmployeeReadScope, filterEmployees);
router.get('/:id', loadAccessContext, attachEmployeeReadScope, getEmployee);
router.post('/', loadAccessContext, requireAnyPermission('system.admin', 'employees.create'), createEmployee);
router.put('/:id', loadAccessContext, requireAnyPermission('system.admin', 'employees.edit'), attachEmployeeScope('system.admin', 'employees.edit'), updateEmployee);
router.delete('/:id', loadAccessContext, requireAnyPermission('system.admin', 'employees.delete'), attachEmployeeScope('system.admin', 'employees.delete'), deleteEmployee);

export default router;
