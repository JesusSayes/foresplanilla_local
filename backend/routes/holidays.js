import express from 'express';
import controller from '../controllers/holidayController.js';
const router = express.Router();
import { authenticateToken } from '../middleware/auth.js';

router.use(authenticateToken);

router.get('/', controller.getAll);
router.get('/:id', controller.getById);
router.post('/', controller.create);
router.put('/:id', controller.update);
router.delete('/:id', controller.delete);

export default router;
