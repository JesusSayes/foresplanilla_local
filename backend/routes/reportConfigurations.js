import express from 'express';
import controller from '../controllers/reportConfigurationController.js';
import { authenticateToken } from '../middleware/auth.js';
import { loadAccessContext, requireAnyPermission } from '../middleware/authorization.js';

const router = express.Router();

router.use(authenticateToken, loadAccessContext, requireAnyPermission('reports.view'));
router.get('/', controller.getAll);
router.post('/filter', controller.filter);
router.get('/:id', controller.getById);
router.post('/', requireAnyPermission('system.admin'), controller.create);
router.put('/:id', controller.update);
router.delete('/:id', controller.delete);

export default router;
