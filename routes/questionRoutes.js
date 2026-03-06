const express = require('express');
const router = express.Router();
const questionController = require('../controllers/questionController');

// === Müşteri İşlemleri ===
// Soru Sor
router.post('/ask', questionController.askQuestion);

// Kullanıcının Sorduğu Soruları Getir
router.get('/user', questionController.getUserQuestions);

// Ürüne Ait Cevaplanmış Soruları Getir
router.get('/product/:productId', questionController.getProductQuestions);

// === Admin İşlemleri ===
// Tüm Soruları (Cevaplanmış/Cevaplanmamış) Getir
router.get('/admin/all', questionController.getAllQuestionsAdmin);

// Soruya Cevap Ver
router.patch('/admin/answer/:id', questionController.answerQuestion);

module.exports = router;
