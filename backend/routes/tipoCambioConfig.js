import express from 'express';
import controller from '../controllers/tipoCambioController.js';
import { authenticateToken } from '../middleware/auth.js';
import { loadAccessContext, requireAnyPermission } from '../middleware/authorization.js';

const router = express.Router();
const requireManage = requireAnyPermission('system.admin', 'system.settings');

router.use(authenticateToken, loadAccessContext);
router.get('/', requireManage, controller.listConfigs);
router.post('/filter', requireManage, controller.listConfigs);
router.get('/:id', requireManage, controller.getConfig);
router.post('/', requireManage, controller.createConfig);
router.put('/:id', requireManage, controller.updateConfig);
router.delete('/:id', requireManage, controller.removeConfig);

export default router;
