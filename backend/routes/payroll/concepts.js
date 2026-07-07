import express from 'express';
const router = express.Router();
import controller from '../../controllers/payroll/conceptController.js';
import { authenticateToken } from '../../middleware/auth.js';
import { loadAccessContext, requireAnyPermission } from '../../middleware/authorization.js';

router.use(authenticateToken, loadAccessContext);

router.get('/', requireAnyPermission('system.admin', 'payroll.view_all', 'payroll.view_department'), controller.getAll);
router.get('/:id', requireAnyPermission('system.admin', 'payroll.view_all', 'payroll.view_department'), controller.getById);
router.post('/', requireAnyPermission('system.admin', 'payroll.create'), controller.create);
router.put('/:id', requireAnyPermission('system.admin', 'payroll.edit'), controller.update);
router.delete('/:id', requireAnyPermission('system.admin', 'payroll.delete'), controller.delete);
router.post('/filter', requireAnyPermission('system.admin', 'payroll.view_all', 'payroll.view_department'), controller.filter);

export default router
