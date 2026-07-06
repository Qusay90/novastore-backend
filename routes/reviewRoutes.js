const express = require('express');
const router = express.Router();
const { addReview, getProductReviews, getUserReviews } = require('../controllers/reviewController');
const { authenticate, requireSelfOrAdmin } = require('../middlewares/authMiddleware');

router.post('/', authenticate, addReview);
router.get('/product/:productId', getProductReviews);
router.get('/user/:userId', authenticate, requireSelfOrAdmin('userId'), getUserReviews);

module.exports = router;
