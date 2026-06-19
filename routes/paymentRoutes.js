const express = require('express');
const router = express.Router();
const { initializePayment, webhookIyzico, getPaymentStatus } = require('../controllers/paymentController');

router.post('/initialize', initializePayment);
router.get('/status', getPaymentStatus);
router.post('/webhook/iyzico', webhookIyzico);

module.exports = router;
