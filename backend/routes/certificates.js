import express from 'express';
const router = express.Router();
import controller from '../controllers/certificateController.js';
import { authenticateToken } from '../middleware/auth.js';
import { attachEmployeeScope, loadAccessContext, requireAnyPermission } from '../middleware/authorization.js';

const VIEW_PERMISSIONS = ['system.admin', 'certificates.view_all', 'certificates.view_own', 'certificates.create', 'certificates.approve'];
const CREATE_PERMISSIONS = ['system.admin', 'certificates.create', 'certificates.view_own'];
const APPROVE_PERMISSIONS = ['system.admin', 'certificates.approve'];

router.use(authenticateToken, loadAccessContext);

router.get('/', requireAnyPermission(...VIEW_PERMISSIONS), attachEmployeeScope(...VIEW_PERMISSIONS), controller.getAll);
router.post('/filter', requireAnyPermission(...VIEW_PERMISSIONS), attachEmployeeScope(...VIEW_PERMISSIONS), controller.filter);
router.get('/:id', requireAnyPermission(...VIEW_PERMISSIONS), attachEmployeeScope(...VIEW_PERMISSIONS), controller.getById);
router.post('/', requireAnyPermission(...CREATE_PERMISSIONS), attachEmployeeScope(...CREATE_PERMISSIONS), controller.create);
router.put('/:id', requireAnyPermission(...APPROVE_PERMISSIONS), attachEmployeeScope(...APPROVE_PERMISSIONS), controller.update);
router.delete('/:id', requireAnyPermission(...APPROVE_PERMISSIONS), attachEmployeeScope(...APPROVE_PERMISSIONS), controller.delete);

export default router
