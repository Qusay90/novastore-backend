const express = require('express');
const router = express.Router();
const assistantController = require('../controllers/assistantController');
const { privateNoStore } = require('../middlewares/privateNoStore');
const { simpleRateLimit } = require('../middlewares/securityMiddleware');

const assistantChatRateLimit = simpleRateLimit({ windowMs: 5 * 60 * 1000, max: 30 });

router.post('/chat', privateNoStore, assistantChatRateLimit, assistantController.chat);
router.post('/escalate', privateNoStore, assistantController.escalate);

module.exports = router;
