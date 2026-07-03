import express from 'express';
const router = express.Router();
import controller from '../controllers/certificateController.js';
import { authenticateToken } from '../middleware/auth.js';
import { loadAccessContext, requireAnyPermission } from '../middleware/authorization.js';

router.use(authenticateToken, loadAccessContext, requireAnyPermission('system.admin'));

router.get('/', controller.getAll);
router.get('/:id', controller.getById);
router.post('/', controller.create);
router.put('/:id', controller.update);
router.delete('/:id', controller.delete);

export default router
