import express from 'express';
import { getEmployeeReport, getAttendanceReport, getVacationReport, getPayrollReport } from '../controllers/reportController.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

router.get('/employees', authenticateToken, getEmployeeReport);
router.get('/attendance', authenticateToken, getAttendanceReport);
router.get('/vacations', authenticateToken, getVacationReport);
router.get('/payroll', authenticateToken, getPayrollReport);

export default router;
