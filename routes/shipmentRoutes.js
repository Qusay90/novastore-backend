const express = require('express');
const router = express.Router();
const { createShipment, getShipment } = require('../controllers/shipmentController');
const { authenticate, requireAdmin } = require('../middlewares/authMiddleware');

router.post('/:orderId/create', authenticate, requireAdmin, createShipment);
router.get('/:orderId', authenticate, getShipment);

module.exports = router;
