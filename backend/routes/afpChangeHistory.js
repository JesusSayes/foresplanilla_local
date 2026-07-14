import express from 'express';
import controller from '../controllers/afpChangeHistoryController.js';
import { authenticateToken } from '../middleware/auth.js';
import {
  attachEmployeeReadScope,
  attachEmployeeScope,
  loadAccessContext,
  requireAnyPermission,
} from '../middleware/authorization.js';

const router = express.Router();

router.use(authenticateToken, loadAccessContext);
router.get('/', attachEmployeeReadScope, controller.getAll);
router.post('/filter', attachEmployeeReadScope, controller.filter);
router.get('/:id', attachEmployeeReadScope, controller.getById);
router.post('/', requireAnyPermission('system.admin', 'employees.edit'), attachEmployeeScope('system.admin', 'employees.edit'), controller.create);
router.put('/:id', requireAnyPermission('system.admin', 'employees.edit'), attachEmployeeScope('system.admin', 'employees.edit'), controller.update);
router.delete('/:id', requireAnyPermission('system.admin', 'employees.delete'), attachEmployeeScope('system.admin', 'employees.delete'), controller.delete);

export default router;
