const express = require('express');
const router = express.Router();
const { createReturnRequest, getReturnById, getAllReturnRequests, updateReturnStatus } = require('../controllers/returnController');
const { authenticate, requireAdmin } = require('../middlewares/authMiddleware');
const { requireCurrentAdmin, requireCurrentAdminIfClaimed } = require('../middlewares/currentAdmin');

router.post('/', authenticate, requireCurrentAdminIfClaimed, createReturnRequest);
router.get('/admin/all', authenticate, requireAdmin, requireCurrentAdmin, getAllReturnRequests);
router.patch('/:id/status', authenticate, requireAdmin, requireCurrentAdmin, updateReturnStatus);
router.get('/:id', authenticate, requireCurrentAdminIfClaimed, getReturnById);

module.exports = router;
