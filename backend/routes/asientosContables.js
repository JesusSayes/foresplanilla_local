import express from 'express';
import { authenticateToken } from '../middleware/auth.js';
import asientoContableController from '../controllers/asientoContableController.js';

const router = express.Router();

router.use(authenticateToken);

router.get('/', asientoContableController.getAll);
router.get('/:id', asientoContableController.getById);
router.post('/filter', asientoContableController.filter);
router.post('/bulk', asientoContableController.bulkCreate);
router.post('/', asientoContableController.create);
router.put('/:id', asientoContableController.update);
router.delete('/:id', asientoContableController.delete);

export default router;
