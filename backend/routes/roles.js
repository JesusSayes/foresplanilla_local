import express from 'express';
import { getAllRoles, getRoleById, createRole, updateRole, deleteRole } from '../controllers/roleController.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

router.get('/', authenticateToken, getAllRoles);
router.get('/:id', authenticateToken, getRoleById);
router.post('/', authenticateToken, createRole);
router.put('/:id', authenticateToken, updateRole);
router.delete('/:id', authenticateToken, deleteRole);

export default router;
