import express from 'express';
const router = express.Router();
import controller from '../../controllers/attendance/recalcularAsistenciaController.js';
import { authenticateToken } from '../../middleware/auth.js';
import recalcularAsistenciaRoutes from './routes/attendance/recalcularAsistencia.js';

router.use(authenticateToken);

router.post('/', controller.recalcularAsistencia);

app.use('/api/attendance/recalcular', recalcularAsistenciaRoutes);

export default router;