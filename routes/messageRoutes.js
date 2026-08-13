const express = require('express');
const router = express.Router();
const messageController = require('../controllers/messageController');
const { authenticate, requireAdmin } = require('../middlewares/authMiddleware');
const {
    requireAdminCommerceCapability,
    requireAdminCommerceCapabilityIfClaimed
} = require('../middlewares/adminCommerceCapability');
const { requireCurrentAdmin, requireCurrentAdminIfClaimed } = require('../middlewares/currentAdmin');

router.get(
    '/history/:userId',
    authenticate,
    requireAdminCommerceCapabilityIfClaimed('supportRead'),
    requireCurrentAdminIfClaimed,
    messageController.getChatHistory
);
router.get(
    '/users',
    authenticate,
    requireAdmin,
    requireAdminCommerceCapability('supportRead'),
    requireCurrentAdmin,
    messageController.getChatUsers
);
router.get(
    '/handoffs',
    authenticate,
    requireAdmin,
    requireAdminCommerceCapability('supportRead'),
    requireCurrentAdmin,
    messageController.getAiHandoffs
);
router.delete(
    '/handoffs/:userId',
    authenticate,
    requireAdmin,
    requireAdminCommerceCapability('supportWrite'),
    requireCurrentAdmin,
    messageController.deleteAiHandoffThread
);
router.post(
    '/threads/:threadId/takeover',
    authenticate,
    requireAdmin,
    requireAdminCommerceCapability('supportWrite'),
    requireCurrentAdmin,
    messageController.takeOverSupportThread
);
router.patch(
    '/threads/:threadId/status',
    authenticate,
    requireAdmin,
    requireAdminCommerceCapability('supportWrite'),
    requireCurrentAdmin,
    messageController.updateSupportThreadStatus
);
router.post(
    '/send',
    authenticate,
    requireAdminCommerceCapabilityIfClaimed('supportWrite'),
    requireCurrentAdminIfClaimed,
    messageController.sendMessage
);

module.exports = router;
