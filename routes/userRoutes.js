const express = require('express');
const router = express.Router();
const { registerUser, loginUser, getMe, updateMe, getSecurityStatus, changePassword } = require('../controllers/userController');
const { logoutAll, logoutCurrent } = require('../controllers/sessionController');
const { authenticateCustomer, authenticateCustomerForLogout } = require('../middlewares/authMiddleware');

// Kullanıcı işlemleri için yollarımız
router.post('/register', registerUser);
router.post('/login', loginUser);
router.post('/logout', authenticateCustomerForLogout, logoutCurrent);
router.post('/logout-all', authenticateCustomer, logoutAll);
router.get('/me', authenticateCustomer, getMe);
router.patch('/me', authenticateCustomer, updateMe);
router.get('/security-status', authenticateCustomer, getSecurityStatus);
router.post('/change-password', authenticateCustomer, changePassword);

module.exports = router;
