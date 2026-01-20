// const express = require('express');
import express from 'express';
const router = express.Router();
// const controller = require('../../controllers/vacations/balanceController');
// const { authenticate } = require('../../middleware/auth');
import controller from '../../controllers/vacations/balanceController.js';
import { authenticateToken } from '../../middleware/auth.js';

router.use(authenticateToken);

router.get('/', controller.getAll);
router.get('/:id', controller.getById);
router.post('/', controller.create);
router.put('/:id', controller.update);
router.delete('/:id', controller.delete);

// module.exports = router;
export default router
