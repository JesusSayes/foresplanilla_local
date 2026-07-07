import express from 'express';
const router = express.Router();
import controller from '../../controllers/payroll/loanInstallmentController.js';
import { authenticateToken } from '../../middleware/auth.js';
import { loadAccessContext, requireAnyPermission } from '../../middleware/authorization.js';

router.use(authenticateToken, loadAccessContext);

router.get('/', requireAnyPermission('system.admin', 'loans.view', 'loans.manage', 'payroll.view_all'), controller.getAll);
router.get('/:id', requireAnyPermission('system.admin', 'loans.view', 'loans.manage', 'payroll.view_all'), controller.getById);
router.post('/', requireAnyPermission('system.admin', 'loans.manage'), controller.create);
router.put('/:id', requireAnyPermission('system.admin', 'loans.manage'), controller.update);
router.delete('/:id', requireAnyPermission('system.admin', 'loans.manage'), controller.delete);
router.post('/filter', requireAnyPermission('system.admin', 'loans.view', 'loans.manage', 'payroll.view_all'), controller.filter);

export default router;
