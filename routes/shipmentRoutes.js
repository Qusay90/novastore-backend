const express = require('express');
const router = express.Router();
const { createManualShipment, createShipment, getShipment } = require('../controllers/shipmentController');
const { authenticate, requireAdmin } = require('../middlewares/authMiddleware');
const { requireAdminCommerceCapability } = require('../middlewares/adminCommerceCapability');
const { requireCurrentAdmin, requireCurrentAdminIfClaimed } = require('../middlewares/currentAdmin');

router.post('/:orderId/create', authenticate, requireAdmin, requireCurrentAdmin, createShipment);
router.post(
    '/:orderId/manual',
    authenticate,
    requireAdmin,
    requireAdminCommerceCapability('manualShipmentWrite'),
    requireCurrentAdmin,
    createManualShipment
);
router.get('/:orderId', authenticate, requireCurrentAdminIfClaimed, getShipment);

module.exports = router;
