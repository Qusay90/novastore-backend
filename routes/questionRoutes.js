const express = require('express');
const router = express.Router();
const questionController = require('../controllers/questionController');
const {
    authenticateAdmin,
    authenticateCustomer,
    requireAdmin
} = require('../middlewares/authMiddleware');
const { requireCurrentAdmin } = require('../middlewares/currentAdmin');

// === Müşteri İşlemleri ===
// Soru Sor
router.post('/ask', authenticateCustomer, questionController.askQuestion);

// Kullanıcının Sorduğu Soruları Getir
router.get('/user', authenticateCustomer, questionController.getUserQuestions);

// Ürüne Ait Cevaplanmış Soruları Getir
router.get('/product/:productId', questionController.getProductQuestions);

// === Admin İşlemleri ===
// Tüm Soruları (Cevaplanmış/Cevaplanmamış) Getir
router.get('/admin/all', authenticateAdmin, requireAdmin, requireCurrentAdmin, questionController.getAllQuestionsAdmin);

router.get('/admin/products', authenticateAdmin, requireAdmin, requireCurrentAdmin, questionController.getProductQuestionSummaryAdmin);

// Soruya Cevap Ver
router.patch('/admin/answer/:id', authenticateAdmin, requireAdmin, requireCurrentAdmin, questionController.answerQuestion);

module.exports = router;
