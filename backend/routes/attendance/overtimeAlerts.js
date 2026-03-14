import express from 'express'
import controller from '../../controllers/attendance/overtimeAlertController.js'

const router = express.Router()

router.get('/', controller.getAll)
router.post('/filter', controller.filter)
router.get('/:id', controller.getById)
router.post('/', controller.create)
router.put('/:id', controller.update)
router.delete('/:id', controller.delete)

export default router
