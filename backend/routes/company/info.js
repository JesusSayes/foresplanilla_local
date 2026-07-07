import express from 'express';
const router = express.Router();
import controller from '../../controllers/company/infoController.js';
import { authenticateToken } from '../../middleware/auth.js';
import { loadAccessContext, requireAnyPermission } from '../../middleware/authorization.js';

router.use(authenticateToken, loadAccessContext);

router.get('/', controller.getAll);
router.get('/:id', controller.getById);
router.post('/', requireAnyPermission('system.admin', 'system.settings'), controller.create);
router.put('/:id', requireAnyPermission('system.admin', 'system.settings'), controller.update);
router.delete('/:id', requireAnyPermission('system.admin', 'system.settings'), controller.delete);
router.post('/filter', controller.filter);

export default router
