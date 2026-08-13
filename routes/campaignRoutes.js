const express = require('express');
const router = express.Router();
const {
    getQuote,
    getCoupons,
    getActiveCoupons,
    createCoupon,
    updateCoupon,
    setCouponStatus,
    deleteCoupon,
    getCampaignConfig,
    updateCampaignConfig
} = require('../controllers/campaignController');
const { authenticate, requireAdmin } = require('../middlewares/authMiddleware');
const { requireCurrentAdmin } = require('../middlewares/currentAdmin');
const { privateNoStore } = require('../middlewares/privateNoStore');
const { requireAdminCommerceCapability } = require('../middlewares/adminCommerceCapability');

const requireCouponAdminJson = (req, res, next) => {
    const mediaType = String(req.headers?.['content-type'] || '')
        .split(';', 1)[0]
        .trim()
        .toLowerCase();
    if (mediaType !== 'application/json') {
        return res.status(415).json({
            code: 'COUPON_JSON_REQUIRED',
            error: 'Kupon işlemi Content-Type application/json gerektirir.'
        });
    }
    return next();
};

const adminCouponRead = [
    privateNoStore,
    authenticate,
    requireAdmin,
    requireAdminCommerceCapability('couponsRead'),
    requireCurrentAdmin
];
const adminCouponWrite = [
    privateNoStore,
    authenticate,
    requireAdmin,
    requireAdminCommerceCapability('couponWrite'),
    requireCurrentAdmin,
    requireCouponAdminJson
];
const adminCouponMutation = [
    privateNoStore,
    authenticate,
    requireAdmin,
    requireAdminCommerceCapability('couponWrite'),
    requireCurrentAdmin
];

router.post('/quote', getQuote);

router.get('/coupons/active', authenticate, getActiveCoupons);
router.get('/coupons', ...adminCouponRead, getCoupons);
router.post('/coupons', ...adminCouponWrite, createCoupon);
router.put('/coupons/:id', ...adminCouponWrite, updateCoupon);
router.patch('/coupons/:id/status', ...adminCouponWrite, setCouponStatus);
router.delete('/coupons/:id', ...adminCouponMutation, deleteCoupon);

router.get('/config', authenticate, requireAdmin, getCampaignConfig);
router.put('/config', authenticate, requireAdmin, updateCampaignConfig);

module.exports = router;
