import express from 'express';
import { authenticateToken } from '../middleware/auth.js';
import {
  listEmployees,
  filterEmployees,
  getEmployee,
  createEmployee,
  updateEmployee,
  deleteEmployee
} from '../controllers/employeeController.js';

const router = express.Router();

router.use(authenticateToken);

router.get('/', listEmployees);
router.post('/filter', filterEmployees);
router.get('/:id', getEmployee);
router.post('/', createEmployee);
router.put('/:id', updateEmployee);
router.delete('/:id', deleteEmployee);

export default router;
