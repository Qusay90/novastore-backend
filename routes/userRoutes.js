const express = require('express');
const router = express.Router();
const { registerUser, loginUser, getMe, updateMe, getSecurityStatus, changePassword } = require('../controllers/userController');
const { logoutAll, logoutCurrent } = require('../controllers/sessionController');
const { authenticateCustomer, authenticateCustomerForLogout } = require('../middlewares/authMiddleware');
const {
    customerLoginRateLimit,
    customerPasswordResetCompleteRateLimit,
    customerPasswordResetRequestRateLimit,
    customerPasswordResetVerifyRateLimit
} = require('../middlewares/customerAuthRateLimit');
const {
    completePasswordResetWithCode,
    requestPasswordReset,
    verifyPasswordReset
} = require('../controllers/customerVerificationController');

// Kullanıcı işlemleri için yollarımız
router.post('/register', registerUser);
router.post('/login', customerLoginRateLimit, loginUser);
router.post('/password-reset/request', customerPasswordResetRequestRateLimit, requestPasswordReset);
router.post('/password-reset/verify', customerPasswordResetVerifyRateLimit, verifyPasswordReset);
router.post('/password-reset/complete', customerPasswordResetCompleteRateLimit, completePasswordResetWithCode);
router.post('/logout', authenticateCustomerForLogout, logoutCurrent);
router.post('/logout-all', authenticateCustomer, logoutAll);
router.get('/me', authenticateCustomer, getMe);
router.patch('/me', authenticateCustomer, updateMe);
router.get('/security-status', authenticateCustomer, getSecurityStatus);
router.post('/change-password', authenticateCustomer, changePassword);

module.exports = router;
