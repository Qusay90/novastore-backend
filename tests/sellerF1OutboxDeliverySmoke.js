'use strict';

const assert = require('node:assert/strict');
const { appendOutboxDeliveryAttempt } = require('../services/sellerAuditOutboxService');

;(async () => {
    const calls = [];
    const attempt = await appendOutboxDeliveryAttempt({ query: async (sql, params) => { calls.push([sql, params]); return { rows: [{ id: 'attempt-1' }] }; } }, { outboxEventId: 'event-1', attemptNumber: 1, outcome: 'leased', leaseExpiresAt: new Date(Date.now() + 60000).toISOString() });
    assert.deepEqual(attempt, { id: 'attempt-1', outcome: 'leased' });
    assert.match(calls[0][0], /^INSERT INTO seller_outbox_delivery_attempts/u);
    assert.doesNotMatch(calls[0][0], /UPDATE|DELETE/u);
    await assert.rejects(() => appendOutboxDeliveryAttempt({ query: async () => ({ rows: [] }) }, { outboxEventId: 'event-1', attemptNumber: 2, outcome: 'replayed' }), /SELLER_AUDIT_INPUT_INVALID/u);
    console.log('sellerF1OutboxDeliverySmoke: PASS');
})().catch((error) => { console.error('sellerF1OutboxDeliverySmoke: FAIL'); console.error(error.stack); process.exitCode = 1; });
