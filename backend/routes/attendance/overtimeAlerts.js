import express from 'express'
import controller from '../../controllers/attendance/overtimeAlertController.js'
import { authenticateToken } from '../../middleware/auth.js'
import { attachEmployeeScope, loadAccessContext, requireAnyPermission } from '../../middleware/authorization.js'

const router = express.Router()

router.use(authenticateToken, loadAccessContext)

router.get('/', requireAnyPermission('attendance.edit', 'attendance.approve_incidents'), attachEmployeeScope('attendance.edit', 'attendance.approve_incidents'), controller.getAll)
router.post('/filter', requireAnyPermission('attendance.edit', 'attendance.approve_incidents'), attachEmployeeScope('attendance.edit', 'attendance.approve_incidents'), controller.filter)
router.get('/:id', requireAnyPermission('attendance.edit', 'attendance.approve_incidents'), attachEmployeeScope('attendance.edit', 'attendance.approve_incidents'), controller.getById)
router.post('/', requireAnyPermission('attendance.edit'), attachEmployeeScope('attendance.edit'), controller.create)
router.put('/:id', requireAnyPermission('attendance.edit', 'attendance.approve_incidents'), attachEmployeeScope('attendance.edit', 'attendance.approve_incidents'), controller.update)
router.delete('/:id', requireAnyPermission('attendance.edit'), attachEmployeeScope('attendance.edit'), controller.delete)

export default router
