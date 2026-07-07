import express from 'express';
import { authenticateToken } from '../middleware/auth.js';
import asientoContableController from '../controllers/asientoContableController.js';
import { loadAccessContext, requireAnyPermission } from '../middleware/authorization.js';

const router = express.Router();

router.use(authenticateToken, loadAccessContext);

router.get('/', requireAnyPermission('system.admin', 'accounting.view', 'accounting.manage', 'payroll.view_all'), asientoContableController.getAll);
router.get('/:id', requireAnyPermission('system.admin', 'accounting.view', 'accounting.manage', 'payroll.view_all'), asientoContableController.getById);
router.post('/filter', requireAnyPermission('system.admin', 'accounting.view', 'accounting.manage', 'payroll.view_all'), asientoContableController.filter);
router.post('/bulk', requireAnyPermission('system.admin', 'accounting.manage'), asientoContableController.bulkCreate);
router.post('/', requireAnyPermission('system.admin', 'accounting.manage'), asientoContableController.create);
router.put('/:id', requireAnyPermission('system.admin', 'accounting.manage'), asientoContableController.update);
router.delete('/:id', requireAnyPermission('system.admin', 'accounting.manage'), asientoContableController.delete);

export default router;
