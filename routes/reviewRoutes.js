const express = require('express');
const router = express.Router();
const {
    addReview,
    getProductReviews,
    getUserReviews,
    getAdminReviews,
    moderateReview
} = require('../controllers/reviewController');
const {
    authenticate,
    authenticateAdmin,
    authenticateCustomer,
    requireAdmin,
    requireSelfOrAdmin
} = require('../middlewares/authMiddleware');
const { requireCurrentAdmin } = require('../middlewares/currentAdmin');
const { requireAdminCommerceCapability } = require('../middlewares/adminCommerceCapability');
const { privateNoStore } = require('../middlewares/privateNoStore');

router.get(
    '/admin/all',
    privateNoStore,
    authenticateAdmin,
    requireAdmin,
    requireAdminCommerceCapability('reviewsRead'),
    requireCurrentAdmin,
    getAdminReviews
);
router.patch(
    '/admin/:reviewId/moderation',
    privateNoStore,
    authenticateAdmin,
    requireAdmin,
    requireAdminCommerceCapability('reviewModerationWrite'),
    requireCurrentAdmin,
    moderateReview
);

router.post('/', privateNoStore, authenticateCustomer, addReview);
router.get('/product/:productId', privateNoStore, getProductReviews);
router.get('/user/:userId', privateNoStore, authenticate, requireSelfOrAdmin('userId'), getUserReviews);

module.exports = router;
