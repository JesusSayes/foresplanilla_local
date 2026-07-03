import express from 'express'
import { authenticateToken } from '../middleware/auth.js'
import controller from '../controllers/derechohabienteController.js'
import {
  attachOwnOrAdminScope,
  loadAccessContext,
  requireAnyPermission,
} from '../middleware/authorization.js'

const router = express.Router()

router.use(authenticateToken, loadAccessContext)

router.get('/', attachOwnOrAdminScope, controller.getAll)
router.get('/:id', attachOwnOrAdminScope, controller.getById)
router.post('/', requireAnyPermission('system.admin'), controller.create)
router.put('/:id', requireAnyPermission('system.admin'), controller.update)
router.delete('/:id', requireAnyPermission('system.admin'), controller.delete)
router.post('/filter', attachOwnOrAdminScope, controller.filter)

export default router
