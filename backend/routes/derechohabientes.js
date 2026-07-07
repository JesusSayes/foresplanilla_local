import express from 'express'
import { authenticateToken } from '../middleware/auth.js'
import controller from '../controllers/derechohabienteController.js'
import {
  attachEmployeeScope,
  loadAccessContext,
  requireAnyPermission,
} from '../middleware/authorization.js'

const router = express.Router()

router.use(authenticateToken, loadAccessContext)

const VIEW_PERMISSIONS = ['system.admin', 'employees.view']
const CREATE_PERMISSIONS = ['system.admin', 'employees.create']
const UPDATE_PERMISSIONS = ['system.admin', 'employees.edit']
const DELETE_PERMISSIONS = ['system.admin', 'employees.delete']

router.get('/', requireAnyPermission(...VIEW_PERMISSIONS), attachEmployeeScope(...VIEW_PERMISSIONS), controller.getAll)
router.get('/:id', requireAnyPermission(...VIEW_PERMISSIONS), attachEmployeeScope(...VIEW_PERMISSIONS), controller.getById)
router.post('/', requireAnyPermission(...CREATE_PERMISSIONS), attachEmployeeScope(...CREATE_PERMISSIONS), controller.create)
router.put('/:id', requireAnyPermission(...UPDATE_PERMISSIONS), attachEmployeeScope(...UPDATE_PERMISSIONS), controller.update)
router.delete('/:id', requireAnyPermission(...DELETE_PERMISSIONS), attachEmployeeScope(...DELETE_PERMISSIONS), controller.delete)
router.post('/filter', requireAnyPermission(...VIEW_PERMISSIONS), attachEmployeeScope(...VIEW_PERMISSIONS), controller.filter)

export default router
