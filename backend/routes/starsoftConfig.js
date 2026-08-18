import express from 'express';
import controller from '../controllers/starsoftController.js';
import { authenticateToken } from '../middleware/auth.js';
import { loadAccessContext, requireAnyPermission } from '../middleware/authorization.js';

const router = express.Router();
const requireManageAccess = requireAnyPermission('system.admin', 'accounting.manage');

router.use(authenticateToken, loadAccessContext, requireManageAccess);
router.get('/', controller.listConfigs);
router.post('/filter', controller.listConfigs);
router.get('/:id', controller.getConfig);
router.post('/', controller.createConfig);
router.put('/:id', controller.updateConfig);
router.delete('/:id', controller.deleteConfig);

export default router;
