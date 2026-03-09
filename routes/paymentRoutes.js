const express = require('express');
const router = express.Router();
const { initializePayment, webhookIyzico } = require('../controllers/paymentController');

router.post('/initialize', initializePayment);
router.post('/webhook/iyzico', webhookIyzico);

module.exports = router;
