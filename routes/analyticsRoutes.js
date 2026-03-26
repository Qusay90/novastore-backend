const express = require('express');
const router = express.Router();
const {
    trackPageEnter,
    trackPageHeartbeat,
    trackPageLeave,
    trackProductAction
} = require('../controllers/analyticsController');

router.post('/page-enter', trackPageEnter);
router.post('/page-heartbeat', trackPageHeartbeat);
router.post('/page-leave', trackPageLeave);
router.post('/product-action', trackProductAction);

module.exports = router;
