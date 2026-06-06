import express from 'express';
const router = express.Router();
import controller from '../../controllers/attendance/recalcularAsistenciaController.js';
import { authenticateToken } from '../../middleware/auth.js';
import { attachEmployeeScope, loadAccessContext, requireAnyPermission } from '../../middleware/authorization.js';

router.use(authenticateToken, loadAccessContext, requireAnyPermission('attendance.edit'), attachEmployeeScope('attendance.edit'));

router.post('/', controller.recalcularAsistencia);

export default router;
