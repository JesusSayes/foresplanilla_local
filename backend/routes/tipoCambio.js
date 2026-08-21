import express from 'express';
import controller from '../controllers/tipoCambioController.js';
import { authenticateToken } from '../middleware/auth.js';
import { loadAccessContext, requireAnyPermission } from '../middleware/authorization.js';

const router = express.Router();
const requireManage = requireAnyPermission('system.admin', 'system.settings');

router.use(authenticateToken, loadAccessContext);
router.post('/obtener-diario', requireManage, controller.obtenerDiario);
router.get('/', controller.list);
router.post('/filter', controller.list);
router.get('/:id', controller.get);
router.post('/', requireManage, controller.create);
router.put('/:id', requireManage, controller.update);
router.delete('/:id', requireManage, controller.remove);

export default router;
