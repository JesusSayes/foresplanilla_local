import express from 'express';
const router = express.Router();
import controller from '../../controllers/attendance/scheduleController.js';
import { authenticateToken } from '../../middleware/auth.js';

router.use(authenticateToken);

router.get('/', controller.getAll);
router.get('/:id', controller.getById);
router.post('/', controller.create);
router.put('/:id', controller.update);
router.delete('/:id', controller.delete);
router.post('/filter', controller.filter);

export default router
