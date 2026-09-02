const express = require('express');
const router = express.Router();
const {
    confirmManualDelivery,
    createManualShipment,
    createShipment,
    getShipment
} = require('../controllers/shipmentController');
const { authenticate, requireAdmin } = require('../middlewares/authMiddleware');
const { requireAdminCommerceCapability } = require('../middlewares/adminCommerceCapability');
const { requireCurrentAdmin, requireCurrentAdminIfClaimed } = require('../middlewares/currentAdmin');

router.post('/:orderId/create', authenticate, requireAdmin, requireCurrentAdmin, createShipment);
router.post(
    '/:orderId/manual',
    authenticate,
    requireAdmin,
    requireCurrentAdmin,
    requireAdminCommerceCapability('manualShipmentWrite'),
    createManualShipment
);
router.post(
    '/:orderId/manual-delivery-confirmation',
    authenticate,
    requireAdmin,
    requireCurrentAdmin,
    requireAdminCommerceCapability('manualShipmentWrite'),
    confirmManualDelivery
);
router.get('/:orderId', authenticate, requireCurrentAdminIfClaimed, getShipment);

module.exports = router;
