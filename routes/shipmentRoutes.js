const express = require('express');
const router = express.Router();
const { createShipment, getShipment } = require('../controllers/shipmentController');
const { authenticate, requireAdmin } = require('../middlewares/authMiddleware');
const { requireCurrentAdmin, requireCurrentAdminIfClaimed } = require('../middlewares/currentAdmin');

router.post('/:orderId/create', authenticate, requireAdmin, requireCurrentAdmin, createShipment);
router.get('/:orderId', authenticate, requireCurrentAdminIfClaimed, getShipment);

module.exports = router;
