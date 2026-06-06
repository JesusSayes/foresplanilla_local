import express from 'express';
import { getAllRoles, getRoleById, createRole, updateRole, deleteRole } from '../controllers/roleController.js';
import { authenticateToken } from '../middleware/auth.js';
import { loadAccessContext, requireAnyPermission } from '../middleware/authorization.js';

const router = express.Router();

router.use(authenticateToken, loadAccessContext);

// La lectura se mantiene autenticada porque el frontend la usa para resolver
// los permisos del propio usuario. Las mutaciones sí requieren autorización.
router.get('/', getAllRoles);
router.get('/:id', getRoleById);
router.post('/', requireAnyPermission('roles.create', 'roles.manage'), createRole);
router.put('/:id', requireAnyPermission('roles.edit', 'roles.manage'), updateRole);
router.delete('/:id', requireAnyPermission('roles.delete', 'roles.manage'), deleteRole);

export default router;
