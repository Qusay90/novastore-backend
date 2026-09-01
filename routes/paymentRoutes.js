const express = require('express');
const router = express.Router();
const {
    getCheckoutAgreementPreview,
    getPaymentCapability,
    getPaymentStatus,
    initializePayment,
    webhookIyzico,
    webhookPaytr
} = require('../controllers/paymentController');
const { authenticate, authenticateCustomer } = require('../middlewares/authMiddleware');

router.get('/capability', getPaymentCapability);
router.post('/agreements/preview', authenticateCustomer, getCheckoutAgreementPreview);
router.post('/initialize', authenticateCustomer, initializePayment);
router.get('/status', authenticate, getPaymentStatus);
router.post('/webhook/iyzico', webhookIyzico);
router.post('/webhook/paytr', express.urlencoded({ extended: false }), webhookPaytr);

module.exports = router;
