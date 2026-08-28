const express = require('express');
const router = express.Router();
const { createReturnRequest, getReturnById, getAllReturnRequests, getMyReturnRequests, updateReturnStatus } = require('../controllers/returnController');
const { authenticate, requireAdmin } = require('../middlewares/authMiddleware');
const { requireCurrentAdmin, requireCurrentAdminIfClaimed } = require('../middlewares/currentAdmin');
const { requireAdminCommerceCapabilityInStaging } = require('../middlewares/adminCommerceCapability');

const requireStagingReturnWrite = requireAdminCommerceCapabilityInStaging('returnWrite');

router.post('/', authenticate, requireCurrentAdminIfClaimed, createReturnRequest);
router.get('/admin/all', authenticate, requireAdmin, requireCurrentAdmin, getAllReturnRequests);
router.get('/mine', authenticate, requireCurrentAdminIfClaimed, getMyReturnRequests);
router.patch('/:id/status', authenticate, requireAdmin, requireCurrentAdmin, requireStagingReturnWrite, updateReturnStatus);
router.get('/:id', authenticate, requireCurrentAdminIfClaimed, getReturnById);

module.exports = router;
