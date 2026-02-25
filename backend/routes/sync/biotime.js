import express from 'express';
import { authenticateToken } from '../../middleware/auth.js';
import controller from '../../controllers/sync/biotimeSyncController.js';

const router = express.Router();

router.use(authenticateToken);

router.post('/trigger', controller.triggerSync);

export default router;
