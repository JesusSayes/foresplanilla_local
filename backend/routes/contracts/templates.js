import express from 'express';
const router = express.Router();
import controller from '../../controllers/contracts/template/Controller.js';
import { authenticateToken } from '../../middleware/auth.js';
// import { v4 as uuidv4 } from 'uuid';

router.use(authenticateToken);

// router.get('/', controller.getAll);
router.get('/', (req, res, next) => {
  console.log('GET /api/contracts/templates');
  return controller.getAll(req, res, next);
});
router.post('/filter', (req, res, next) => {
  console.log('POST /api/contracts/templates/filter');
  return controller.filter(req, res, next);
});
router.get('/:id', controller.getById);
router.post('/', controller.create);
router.put('/:id', controller.update);
router.delete('/:id', controller.delete);

// router.post('/filter', controller.filter);

export default router
