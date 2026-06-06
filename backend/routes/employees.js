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
  attachEmployeeScope,
  loadAccessContext,
  requireAnyPermission,
} from '../middleware/authorization.js';

const router = express.Router();

router.use(authenticateToken);

router.get('/accessible', loadAccessContext, listAccessibleEmployees);
router.get('/', listEmployees);
router.post('/filter', filterEmployees);
router.get('/:id', getEmployee);
router.post('/', loadAccessContext, requireAnyPermission('employees.create'), createEmployee);
router.put('/:id', loadAccessContext, requireAnyPermission('employees.edit'), attachEmployeeScope('employees.edit'), updateEmployee);
router.delete('/:id', loadAccessContext, requireAnyPermission('employees.delete'), attachEmployeeScope('employees.delete'), deleteEmployee);

export default router;
