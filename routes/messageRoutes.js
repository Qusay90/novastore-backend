const express = require('express');
const router = express.Router();
const messageController = require('../controllers/messageController');

// İki kullanıcı arasındaki eski sohbet geçmişini getir
router.get('/history/:userId', messageController.getChatHistory);

// Sohbet eden tüm müşterilerin listesini getir (Admin için)
router.get('/users', messageController.getChatUsers);

// Yeni mesaj gönderimi (REST API)
router.post('/send', messageController.sendMessage);

module.exports = router;
