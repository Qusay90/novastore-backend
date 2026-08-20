'use strict';

const assert = require('node:assert/strict');
const { redactMetadata, runAtomicSellerMutation } = require('../services/sellerAuditOutboxService');

const audit = Object.freeze({ eventType: 'SESSION_REVOKED', targetType: 'session', targetId: 'session-1', resultCode: 'OK', metadata: { authorization: 'Bearer raw', email: 'owner@example.test', reason: 'operator_action' } });
const outbox = Object.freeze({ aggregateType: 'seller_session', aggregateId: 'session-1', eventType: 'seller.session.revoked', aggregateRevision: 1, payload: { token: 'raw', reason: 'operator_action' } });

;(async () => {
    const redacted = redactMetadata({ ...audit.metadata, note: 'unclassified secret' });
    assert.equal(redacted.authorization, '[REDACTED]');
    assert.equal(redacted.email, '[REDACTED]');
    assert.equal(redacted.reason, 'operator_action');
    assert.equal(redacted.note, '[REDACTED]');
    const calls = [];
    const client = { release() { calls.push('release'); }, async query(sql) { calls.push(sql); if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') return { rows: [] }; return { rows: [{ id: calls.length }] }; } };
    const result = await runAtomicSellerMutation({ connect: async () => client }, { organizationId: 11, mutation: async () => 'mutation-ok', audit, outbox });
    assert.equal(result.mutationResult, 'mutation-ok');
    assert.equal(calls.includes('COMMIT'), true);
    assert.equal(calls.at(-1), 'release');
    const failingCalls = [];
    const failingClient = { release() { failingCalls.push('release'); }, async query(sql) { failingCalls.push(sql); if (sql.includes('seller_outbox_events')) throw new Error('database detail must not escape'); return { rows: [{ id: 1 }] }; } };
    await assert.rejects(() => runAtomicSellerMutation({ connect: async () => failingClient }, { organizationId: 11, mutation: async () => 'mutation-ok', audit, outbox }), /SELLER_AUDIT_TRANSACTION_FAILED/u);
    assert.equal(failingCalls.includes('ROLLBACK'), true);
    console.log('sellerF1AuditOutboxSmoke: PASS');
})().catch((error) => { console.error('sellerF1AuditOutboxSmoke: FAIL'); console.error(error.stack); process.exitCode = 1; });
