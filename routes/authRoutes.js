const express = require('express');
const router = express.Router();
const {
    login,
    forgotPassword,
    resetPassword,
    getSecurityStatus,
    changePassword,
    sendPhoneCode,
    verifyPhoneCode,
    sendEmailVerification,
    setupTwoFactor
} = require('../controllers/authController');
const { authenticate } = require('../middlewares/authMiddleware');

// Sadece POST isteği alacağız çünkü şifre gönderiliyor
router.post('/login', login);
router.post('/forgot-password', forgotPassword);
router.post('/reset-password', resetPassword);
router.get('/security-status', authenticate, getSecurityStatus);
router.post('/change-password', authenticate, changePassword);
router.post('/phone/send-code', authenticate, sendPhoneCode);
router.post('/phone/verify-code', authenticate, verifyPhoneCode);
router.post('/email/send-verification', authenticate, sendEmailVerification);
router.post('/2fa/setup', authenticate, setupTwoFactor);

module.exports = router;
