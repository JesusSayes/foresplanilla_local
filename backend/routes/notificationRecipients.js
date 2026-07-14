import express from 'express';
import controller from '../controllers/notificationRecipientController.js';
import { authenticateToken } from '../middleware/auth.js';
import { loadAccessContext, requireAnyPermission } from '../middleware/authorization.js';

const router = express.Router();

router.use(
  authenticateToken,
  loadAccessContext,
  requireAnyPermission('system.admin', 'notifications.manage_contract_alerts')
);
router.get('/', controller.getAll);
router.post('/filter', controller.filter);
router.get('/:id', controller.getById);
router.post('/', controller.create);
router.put('/:id', controller.update);
router.delete('/:id', controller.delete);

export default router;
