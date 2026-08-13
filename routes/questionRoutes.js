const express = require('express');
const router = express.Router();
const questionController = require('../controllers/questionController');
const {
    authenticateAdmin,
    authenticateCustomer,
    requireAdmin
} = require('../middlewares/authMiddleware');
const { requireCurrentAdmin } = require('../middlewares/currentAdmin');
const { requireAdminCommerceCapability } = require('../middlewares/adminCommerceCapability');
const { privateNoStore } = require('../middlewares/privateNoStore');

// === Müşteri İşlemleri ===
// Soru Sor
router.post('/ask', privateNoStore, authenticateCustomer, questionController.askQuestion);

// Kullanıcının Sorduğu Soruları Getir
router.get('/user', privateNoStore, authenticateCustomer, questionController.getUserQuestions);

// Ürüne Ait Cevaplanmış Soruları Getir
router.get('/product/:productId', questionController.getProductQuestions);

// === Admin İşlemleri ===
// Tüm Soruları (Cevaplanmış/Cevaplanmamış) Getir
router.get(
    '/admin/all',
    privateNoStore,
    authenticateAdmin,
    requireAdmin,
    requireAdminCommerceCapability('questionsRead'),
    requireCurrentAdmin,
    questionController.getAllQuestionsAdmin
);

router.get(
    '/admin/products',
    privateNoStore,
    authenticateAdmin,
    requireAdmin,
    requireAdminCommerceCapability('questionsRead'),
    requireCurrentAdmin,
    questionController.getProductQuestionSummaryAdmin
);

// Soruya Cevap Ver
router.patch(
    '/admin/answer/:id',
    privateNoStore,
    authenticateAdmin,
    requireAdmin,
    requireAdminCommerceCapability('questionAnswerWrite'),
    requireCurrentAdmin,
    questionController.answerQuestion
);

module.exports = router;
