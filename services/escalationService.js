const pool = require('../config/db');
const { assertExternalSideEffectAllowed } = require('../config/stagingRuntimePolicy');
const {
    SUPPORT_SUMMARY_MAX_LENGTH,
    SupportThreadError,
    appendSupportMessage,
    getOrCreateSupportThread,
    normalizeSupportText,
    reopenSupportThreadForCustomer,
    requirePositiveId,
    serializeThread,
    withSupportTransaction
} = require('./supportThreadService');

const AI_HANDOFF_PREFIX = '[AI DESTEK DEVRI]';

const getPrimaryAdminId = async (database = pool) => {
    const result = await database.query(
        "SELECT id FROM users WHERE role = 'admin' AND auth_enabled = TRUE ORDER BY id ASC LIMIT 1"
    );
    if (!result.rows.length) return null;
    return Number(result.rows[0].id);
};

const createEscalationMessage = async ({ userId, summary }) => {
    assertExternalSideEffectAllowed('outbound_notification');
    const customerId = requirePositiveId(userId, 'userId');
    const normalizedSummary = normalizeSupportText(summary, {
        field: 'summary',
        maxLength: SUPPORT_SUMMARY_MAX_LENGTH
    });

    return withSupportTransaction(async (client) => {
        const adminId = await getPrimaryAdminId(client);
        if (!adminId) {
            throw new SupportThreadError('Etkin destek yöneticisi bulunamadı.', {
                code: 'SUPPORT_ADMIN_NOT_FOUND',
                statusCode: 503
            });
        }
        let thread = await getOrCreateSupportThread(client, {
            customerId,
            source: 'NOVABOT',
            actorId: customerId
        });
        thread = await reopenSupportThreadForCustomer(client, { thread, customerId });
        const message = await appendSupportMessage(client, {
            thread,
            senderId: customerId,
            receiverId: adminId,
            message: `${AI_HANDOFF_PREFIX}\n${normalizedSummary}`,
            eventType: 'NOVABOT_ESCALATED'
        });
        return {
            adminId,
            thread: serializeThread(thread),
            message
        };
    });
};

module.exports = {
    AI_HANDOFF_PREFIX,
    createEscalationMessage,
    getPrimaryAdminId
};
