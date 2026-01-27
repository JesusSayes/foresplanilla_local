import express from 'express';
const router = express.Router();
import * as controller from '../../controllers/contracts/template/Controller.js';
import { authenticateToken } from '../../middleware/auth.js';
import { v4 as uuidv4 } from 'uuid';

router.use(authenticateToken);

router.get('/', controller.getAll);
router.get('/:id', controller.getById);
router.post('/', controller.create);
router.put('/:id', controller.update);
router.delete('/:id', controller.deleteTemplate);

router.post('/filter', controller.filter);

router.get('/ping', (req, res) => {
  res.json({ ok: true });
});

export default router
