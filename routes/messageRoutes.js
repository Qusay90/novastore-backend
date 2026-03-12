const express = require('express');
const router = express.Router();
const messageController = require('../controllers/messageController');
const { authenticate, requireAdmin } = require('../middlewares/authMiddleware');

router.get('/history/:userId', authenticate, messageController.getChatHistory);
router.get('/users', authenticate, requireAdmin, messageController.getChatUsers);
router.get('/handoffs', authenticate, requireAdmin, messageController.getAiHandoffs);
router.delete('/handoffs/:userId', authenticate, requireAdmin, messageController.deleteAiHandoffThread);
router.post('/send', authenticate, messageController.sendMessage);

module.exports = router;
