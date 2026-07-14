import express from 'express';
import controller from '../controllers/contractNotificationController.js';
import { authenticateToken } from '../middleware/auth.js';
import { loadAccessContext, requireAnyPermission } from '../middleware/authorization.js';

const router = express.Router();

router.get(
  '/recipients',
  authenticateToken,
  loadAccessContext,
  requireAnyPermission('system.admin', 'notifications.manage_contract_alerts'),
  controller.listRecipients
);

router.post(
  '/run',
  authenticateToken,
  loadAccessContext,
  requireAnyPermission('system.admin', 'notifications.manage_contract_alerts'),
  controller.runNow
);

export default router;
