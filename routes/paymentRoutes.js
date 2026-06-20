const express = require('express');
const router = express.Router();
const { initializePayment, webhookIyzico, getPaymentStatus } = require('../controllers/paymentController');
const { authenticate } = require('../middlewares/authMiddleware');

router.post('/initialize', initializePayment);
router.get('/status', authenticate, getPaymentStatus);
router.post('/webhook/iyzico', webhookIyzico);

module.exports = router;
