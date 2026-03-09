const express = require('express');
const router = express.Router();
const {
    getQuote,
    getCoupons,
    createCoupon,
    updateCoupon,
    deleteCoupon,
    getCampaignConfig,
    updateCampaignConfig
} = require('../controllers/campaignController');
const { authenticate, requireAdmin } = require('../middlewares/authMiddleware');

router.post('/quote', getQuote);

router.get('/coupons', authenticate, requireAdmin, getCoupons);
router.post('/coupons', authenticate, requireAdmin, createCoupon);
router.put('/coupons/:id', authenticate, requireAdmin, updateCoupon);
router.delete('/coupons/:id', authenticate, requireAdmin, deleteCoupon);

router.get('/config', authenticate, requireAdmin, getCampaignConfig);
router.put('/config', authenticate, requireAdmin, updateCampaignConfig);

module.exports = router;
