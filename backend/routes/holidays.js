import express from 'express';
import { getAllHolidays, getHolidayById, createHoliday, updateHoliday, deleteHoliday } from '../controllers/holidayController.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

router.get('/', authenticateToken, getAllHolidays);
router.get('/:id', authenticateToken, getHolidayById);
router.post('/', authenticateToken, createHoliday);
router.put('/:id', authenticateToken, updateHoliday);
router.delete('/:id', authenticateToken, deleteHoliday);

export default router;
