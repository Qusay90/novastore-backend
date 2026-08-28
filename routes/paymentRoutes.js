const express = require('express');
const router = express.Router();
const { initializePayment, webhookIyzico, webhookPaytr, getPaymentStatus } = require('../controllers/paymentController');
const { authenticate, authenticateCustomer } = require('../middlewares/authMiddleware');

router.post('/initialize', authenticateCustomer, initializePayment);
router.get('/status', authenticate, getPaymentStatus);
router.post('/webhook/iyzico', webhookIyzico);
router.post('/webhook/paytr', express.urlencoded({ extended: false }), webhookPaytr);

module.exports = router;
