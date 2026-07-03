import express from 'express';
const router = express.Router();
import controller from '../../controllers/payroll/payslipController.js';
import { authenticateToken } from '../../middleware/auth.js';
import {
  attachOwnOrAdminScope,
  loadAccessContext,
  requireAnyPermission,
} from '../../middleware/authorization.js';

router.use(authenticateToken, loadAccessContext);

router.get('/', attachOwnOrAdminScope, controller.getAll);
router.get('/:id', attachOwnOrAdminScope, controller.getById);
router.post('/', requireAnyPermission('system.admin'), controller.create);
router.put('/:id', requireAnyPermission('system.admin'), controller.update);
router.delete('/:id', requireAnyPermission('system.admin'), controller.delete);

router.post('/filter', attachOwnOrAdminScope, controller.filter);
router.post('/bulk', requireAnyPermission('system.admin'), controller.bulkCreate);

export default router
