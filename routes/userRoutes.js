const express = require('express');
const router = express.Router();
const { registerUser, loginUser, getMe, updateMe, getSecurityStatus, changePassword } = require('../controllers/userController');
const { refreshCustomerSession } = require('../controllers/customerRefreshController');
const { logoutAll, logoutCurrent } = require('../controllers/sessionController');
const { authenticateCustomer, authenticateCustomerForLogout } = require('../middlewares/authMiddleware');
const { simpleRateLimit } = require('../middlewares/securityMiddleware');

// Kullanıcı işlemleri için yollarımız
router.post('/register', registerUser);
router.post('/login', loginUser);
router.post('/refresh', simpleRateLimit({ windowMs: 60 * 1000, max: 30 }), refreshCustomerSession);
router.post('/logout', authenticateCustomerForLogout, logoutCurrent);
router.post('/logout-all', authenticateCustomer, logoutAll);
router.get('/me', authenticateCustomer, getMe);
router.patch('/me', authenticateCustomer, updateMe);
router.get('/security-status', authenticateCustomer, getSecurityStatus);
router.post('/change-password', authenticateCustomer, changePassword);

module.exports = router;
