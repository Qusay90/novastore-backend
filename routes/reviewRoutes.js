const express = require('express');
const router = express.Router();
const { addReview, getProductReviews, getUserReviews } = require('../controllers/reviewController');
const { reviewUpload } = require('../config/cloudinary');
const { authenticate, requireSelfOrAdmin } = require('../middlewares/authMiddleware');

router.post('/', authenticate, reviewUpload.array('media', 4), addReview);
router.get('/product/:productId', getProductReviews);
router.get('/user/:userId', authenticate, requireSelfOrAdmin('userId'), getUserReviews);

module.exports = router;
