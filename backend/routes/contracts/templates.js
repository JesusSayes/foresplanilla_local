const express = require('express');
const router = express.Router();
const controller = require('../../controllers/contracts/templateController');
const { authenticate } = require('../../middleware/auth');

router.use(authenticate);

router.get('/', controller.getAll);
router.get('/:id', controller.getById);
router.post('/', controller.create);
router.put('/:id', controller.update);
router.delete('/:id', controller.delete);

module.exports = router;
