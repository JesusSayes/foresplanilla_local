import express from 'express';
import { authenticateToken } from '../middleware/auth.js';
import cuentaContableController from '../controllers/cuentaContableController.js';

const router = express.Router();

router.use(authenticateToken);

router.get('/', cuentaContableController.getAll);
router.get('/:id', cuentaContableController.getById);
router.post('/', cuentaContableController.create);
router.put('/:id', cuentaContableController.update);
router.delete('/:id', cuentaContableController.delete);

export default router;
