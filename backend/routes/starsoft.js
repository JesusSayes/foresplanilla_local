import express from 'express';
import controller from '../controllers/starsoftController.js';
import { authenticateToken } from '../middleware/auth.js';
import { loadAccessContext, requireAnyPermission } from '../middleware/authorization.js';

const router = express.Router();

router.use(authenticateToken, loadAccessContext);
router.post('/migrate', requireAnyPermission('system.admin', 'accounting.manage'), controller.migrate);

export default router;
