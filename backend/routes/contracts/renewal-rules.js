import express from 'express';
import { authenticateToken } from '../../middleware/auth.js';
import { loadAccessContext, requireAnyPermission } from '../../middleware/authorization.js';
import { list, create, update, remove } from '../../controllers/contracts/renewalRuleController.js';

const router = express.Router();
router.use(authenticateToken, loadAccessContext, requireAnyPermission('system.admin', 'contracts.renewal'));
router.get('/', list);
router.post('/', create);
router.put('/:id', update);
router.delete('/:id', remove);
export default router;
