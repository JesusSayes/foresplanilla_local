import express from 'express';
const router = express.Router();
import controller from '../../controllers/attendance/recalcularAsistenciaController.js';
import { authenticateToken } from '../../middleware/auth.js';

router.use(authenticateToken);

router.post('/', controller.recalcularAsistencia);

export default router;
