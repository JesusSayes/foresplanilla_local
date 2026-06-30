import express from 'express';
import { authenticateToken } from '../../middleware/auth.js';
import { loadAccessContext, requireAnyPermission } from '../../middleware/authorization.js';
import { backfillAsistenciaEmpleado } from '../../scripts/backfillAsistenciaEmpleado.js';

const router = express.Router();

router.use(authenticateToken, loadAccessContext, requireAnyPermission('system.admin'));

router.post('/', async (req, res) => {
  try {
    const result = await backfillAsistenciaEmpleado(req.body || {});
    res.json(result);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

export default router;
