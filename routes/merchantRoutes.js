const express = require('express');
const router = express.Router();
const { getMerchantFeed } = require('../controllers/merchantController');

router.get('/feed.xml', getMerchantFeed);

module.exports = router;
