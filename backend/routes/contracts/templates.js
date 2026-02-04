import express from 'express';
const router = express.Router();
import controller from '../../controllers/contracts/template/Controller.js';
import { authenticateToken } from '../../middleware/auth.js';
// import { v4 as uuidv4 } from 'uuid';
// import { withLog } from '../../middleware/withLog.js';

router.use(authenticateToken);

router.get('/', controller.getAll);
// router.get('/', withLog('ContractTemplatesController#getAll', controller.getAll));
router.get('/:id', controller.getById);
router.post('/', controller.create);
router.put('/:id', controller.update);
router.delete('/:id', controller.delete);

router.post('/filter', controller.filter);

export default router;
