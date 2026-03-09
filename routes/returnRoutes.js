const express = require('express');
const router = express.Router();
const { createReturnRequest, getReturnById } = require('../controllers/returnController');
const { authenticate } = require('../middlewares/authMiddleware');

router.post('/', authenticate, createReturnRequest);
router.get('/:id', authenticate, getReturnById);

module.exports = router;
