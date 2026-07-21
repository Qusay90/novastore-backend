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
const { logoutAll, logoutCurrent } = require('../controllers/sessionController');
const { authenticateAdmin, authenticateAdminForLogout } = require('../middlewares/authMiddleware');

// Sadece POST isteği alacağız çünkü şifre gönderiliyor
router.post('/login', login);
router.post('/forgot-password', forgotPassword);
router.post('/reset-password', resetPassword);
router.post('/logout', authenticateAdminForLogout, logoutCurrent);
router.post('/logout-all', authenticateAdmin, logoutAll);
router.get('/security-status', authenticateAdmin, getSecurityStatus);
router.post('/change-password', authenticateAdmin, changePassword);
router.post('/phone/send-code', authenticateAdmin, sendPhoneCode);
router.post('/phone/verify-code', authenticateAdmin, verifyPhoneCode);
router.post('/email/send-verification', authenticateAdmin, sendEmailVerification);
router.post('/2fa/setup', authenticateAdmin, setupTwoFactor);

module.exports = router;
