import express from 'express';
const router = express.Router();
import controller, { reorder } from '../../controllers/contracts/clauseController.js';
import { authenticateToken } from '../../middleware/auth.js';

router.use(authenticateToken);

router.post('/reorder', reorder);
router.get('/', controller.getAll);
router.get('/:id', controller.getById);
router.post('/', controller.create);
router.put('/:id', controller.update);
router.delete('/:id', controller.delete);

export default router
