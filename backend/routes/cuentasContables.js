import express from 'express';
import { authenticateToken } from '../middleware/auth.js';
import cuentaContableController from '../controllers/cuentaContableController.js';
import { loadAccessContext, requireAnyPermission } from '../middleware/authorization.js';

const router = express.Router();

router.use(authenticateToken, loadAccessContext);

router.get('/', requireAnyPermission('system.admin', 'accounting.view', 'accounting.manage', 'payroll.view_all'), cuentaContableController.getAll);
router.get('/:id', requireAnyPermission('system.admin', 'accounting.view', 'accounting.manage', 'payroll.view_all'), cuentaContableController.getById);
router.post('/', requireAnyPermission('system.admin', 'accounting.manage'), cuentaContableController.create);
router.put('/:id', requireAnyPermission('system.admin', 'accounting.manage'), cuentaContableController.update);
router.delete('/:id', requireAnyPermission('system.admin', 'accounting.manage'), cuentaContableController.delete);

export default router;
