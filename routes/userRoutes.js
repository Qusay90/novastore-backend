const express = require('express');
const router = express.Router();
const { registerUser, loginUser, getMe, updateMe, getSecurityStatus, changePassword } = require('../controllers/userController');
const { authenticate } = require('../middlewares/authMiddleware');

// Kullanıcı işlemleri için yollarımız
router.post('/register', registerUser);
router.post('/login', loginUser);
router.get('/me', authenticate, getMe);
router.patch('/me', authenticate, updateMe);
router.get('/security-status', authenticate, getSecurityStatus);
router.post('/change-password', authenticate, changePassword);

module.exports = router;
