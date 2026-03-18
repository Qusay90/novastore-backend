const express = require('express');
const router = express.Router();
const { createReturnRequest, getReturnById, getAllReturnRequests, updateReturnStatus } = require('../controllers/returnController');
const { authenticate, requireAdmin } = require('../middlewares/authMiddleware');

router.post('/', authenticate, createReturnRequest);
router.get('/admin/all', authenticate, requireAdmin, getAllReturnRequests);
router.patch('/:id/status', authenticate, requireAdmin, updateReturnStatus);
router.get('/:id', authenticate, getReturnById);

module.exports = router;
