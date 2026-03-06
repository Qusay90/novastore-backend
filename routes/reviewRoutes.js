const express = require('express');
const router = express.Router();
const { addReview, getProductReviews, getUserReviews } = require('../controllers/reviewController');

router.post('/', addReview); // Yorum yapma yolu
router.get('/product/:productId', getProductReviews); // Yorumları çekme yolu
router.get('/user/:userId', getUserReviews); // Kullanıcının yorumlarını çekme yolu

module.exports = router;