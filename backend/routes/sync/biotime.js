import express from 'express';
import { authenticateToken } from '../../middleware/auth.js';
import controller from '../../controllers/sync/biotimeSyncController.js';
import { loadAccessContext, requireAnyPermission } from '../../middleware/authorization.js';

const router = express.Router();

router.use(authenticateToken, loadAccessContext, requireAnyPermission('system.admin'));

router.post('/trigger', controller.triggerSync);

export default router;
