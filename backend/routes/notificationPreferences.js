import express from 'express';
import controller from '../controllers/notificationPreferenceController.js';
import { authenticateToken } from '../middleware/auth.js';
import { loadAccessContext } from '../middleware/authorization.js';

const router = express.Router();

router.use(authenticateToken, loadAccessContext);

router.get('/', controller.getAll);
router.get('/:id', controller.getById);
router.post('/filter', controller.filter);
router.post('/', controller.create);
router.put('/:id', controller.update);
router.delete('/:id', controller.delete);

export default router;
