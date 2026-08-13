const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'postgresql://novastore_test:novastore_test@127.0.0.1:55432/novastore_support_contract';

const {
    SUPPORT_MESSAGE_MAX_LENGTH,
    SupportThreadError,
    appendSupportMessage,
    claimSupportThread,
    getOrCreateSupportThread,
    normalizeSupportText,
    reopenSupportThreadForCustomer,
    setSupportThreadStatus
} = require('../services/supportThreadService');
const {
    NotificationTargetError,
    normalizeNotificationTarget
} = require('../services/notificationTargetService');
const {
    getPolicyAnswer
} = require('../services/policyService');
const pool = require('../config/db');
const messageController = require('../controllers/messageController');

const root = path.join(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

const clone = (value) => JSON.parse(JSON.stringify(value));

const createSupportClient = () => {
    const state = {
        users: new Map([
            [10, { id: 10, role: 'admin' }],
            [11, { id: 11, role: 'admin' }],
            [42, { id: 42, role: 'customer' }]
        ]),
        thread: null,
        events: [],
        messages: []
    };

    const query = async (sql, params = []) => {
        const text = String(sql).replace(/\s+/g, ' ').trim();
        if (/SELECT id FROM users WHERE id = \$1 AND role = 'customer'/i.test(text)) {
            const user = state.users.get(Number(params[0]));
            return { rows: user?.role === 'customer' ? [{ id: user.id }] : [] };
        }
        if (/INSERT INTO support_threads/i.test(text)) {
            if (state.thread) return { rows: [] };
            state.thread = {
                id: 700,
                customer_id: Number(params[0]),
                status: 'OPEN',
                assigned_admin_id: null,
                source: params[1],
                created_at: '2026-08-13T00:00:00.000Z',
                updated_at: '2026-08-13T00:00:00.000Z',
                last_message_at: null
            };
            return { rows: [clone(state.thread)] };
        }
        if (/SELECT \* FROM support_threads WHERE customer_id = \$1 FOR UPDATE/i.test(text)) {
            return { rows: state.thread?.customer_id === Number(params[0]) ? [clone(state.thread)] : [] };
        }
        if (/SELECT \* FROM support_threads WHERE id = \$1 FOR UPDATE/i.test(text)) {
            return { rows: state.thread?.id === Number(params[0]) ? [clone(state.thread)] : [] };
        }
        if (/INSERT INTO support_thread_events/i.test(text)) {
            state.events.push({
                threadId: Number(params[0]),
                actorId: params[1] == null ? null : Number(params[1]),
                eventType: params[2],
                payload: JSON.parse(params[3])
            });
            return { rows: [], rowCount: 1 };
        }
        if (/INSERT INTO messages/i.test(text)) {
            const message = {
                id: state.messages.length + 1,
                support_thread_id: Number(params[0]),
                sender_id: Number(params[1]),
                receiver_id: Number(params[2]),
                message: params[3],
                created_at: `2026-08-13T00:00:0${state.messages.length + 1}.000Z`
            };
            state.messages.push(message);
            return { rows: [clone(message)] };
        }
        if (/UPDATE support_threads SET last_message_at/i.test(text)) {
            state.thread.last_message_at = params[1];
            return { rows: [], rowCount: 1 };
        }
        if (/UPDATE support_threads SET status = 'TAKEN_OVER'/i.test(text)) {
            state.thread.status = 'TAKEN_OVER';
            state.thread.assigned_admin_id = Number(params[1]);
            return { rows: [clone(state.thread)] };
        }
        if (/UPDATE support_threads SET status = 'OPEN', assigned_admin_id = NULL/i.test(text)) {
            state.thread.status = 'OPEN';
            state.thread.assigned_admin_id = null;
            return { rows: [clone(state.thread)] };
        }
        if (/UPDATE support_threads SET status = \$2/i.test(text)) {
            state.thread.status = params[1];
            if (params[1] !== 'CLOSED') state.thread.assigned_admin_id = null;
            return { rows: [clone(state.thread)] };
        }
        throw new Error(`Unexpected support query: ${text}`);
    };

    return { query, state };
};

const expectSupportError = async (work, code) => {
    await assert.rejects(work, (error) => error instanceof SupportThreadError && error.code === code);
};

const createResponse = () => {
    const state = { statusCode: 200, payload: null };
    return {
        state,
        response: {
            status(code) { state.statusCode = code; return this; },
            json(payload) { state.payload = payload; return this; }
        }
    };
};

const run = async () => {
    assert.equal(normalizeSupportText('  Merhaba  '), 'Merhaba');
    assert.throws(
        () => normalizeSupportText('x'.repeat(SUPPORT_MESSAGE_MAX_LENGTH + 1)),
        (error) => error instanceof SupportThreadError && error.code === 'SUPPORT_TEXT_INVALID'
    );
    for (const control of ['\u0000', '\u0007', '\u001f', '\u007f']) {
        assert.throws(
            () => normalizeSupportText(`geçersiz${control}mesaj`),
            (error) => error instanceof SupportThreadError && error.code === 'SUPPORT_TEXT_INVALID'
        );
    }
    assert.equal(normalizeSupportText('Satır 1\nSatır 2\tson'), 'Satır 1\nSatır 2\tson');

    const client = createSupportClient();
    let thread = await getOrCreateSupportThread(client, {
        customerId: 42,
        source: 'DIRECT',
        actorId: 42
    });
    assert.equal(thread.customer_id, 42);
    assert.equal(client.state.events[0].eventType, 'THREAD_CREATED');

    const message = await appendSupportMessage(client, {
        thread,
        senderId: 42,
        receiverId: 10,
        message: 'Siparişim için desteğe ihtiyacım var.'
    });
    assert.equal(message.support_thread_id, thread.id);
    assert.equal(client.state.events.at(-1).eventType, 'MESSAGE_CREATED');

    thread = await claimSupportThread(client, { threadId: thread.id, adminId: 10 });
    assert.equal(thread.status, 'TAKEN_OVER');
    assert.equal(thread.assigned_admin_id, 10);
    await expectSupportError(
        () => claimSupportThread(client, { threadId: thread.id, adminId: 11 }),
        'SUPPORT_THREAD_ASSIGNED_TO_ANOTHER_ADMIN'
    );

    thread = await setSupportThreadStatus(client, {
        threadId: thread.id,
        adminId: 10,
        status: 'CLOSED'
    });
    assert.equal(thread.status, 'CLOSED');
    await expectSupportError(
        () => claimSupportThread(client, { threadId: thread.id, adminId: 10 }),
        'SUPPORT_THREAD_CLOSED'
    );
    thread = await reopenSupportThreadForCustomer(client, { thread, customerId: 42 });
    assert.equal(thread.status, 'OPEN');
    assert.equal(thread.assigned_admin_id, null);
    await expectSupportError(
        () => getOrCreateSupportThread(client, { customerId: 99 }),
        'SUPPORT_CUSTOMER_NOT_FOUND'
    );

    assert.deepEqual(
        normalizeNotificationTarget({ entityType: 'support_thread', entityId: 700 }),
        { entityType: 'support_thread', entityId: 700 }
    );
    for (const target of [
        { entityType: 'external_url', entityId: 1 },
        { entityType: 'order', entityId: 0 },
        { entityType: 'order' },
        { entityType: 'order', entityId: 1, url: 'https://evil.example' },
        { entityType: 'order', entity_type: 'review', entityId: 1 }
    ]) {
        assert.throws(
            () => normalizeNotificationTarget(target),
            (error) => error instanceof NotificationTargetError
        );
    }

    const unpublished = await getPolicyAnswer('İade süresi nedir?', { env: {} });
    assert.equal(unpublished.topic, 'returns');
    assert.equal(unpublished.published, false);
    assert.equal(unpublished.requiresLegalCompanyInput, true);
    assert.doesNotMatch(unpublished.answer, /14 gün|1-3 iş günü/i);

    const approved = await getPolicyAnswer('İade süresi nedir?', {
        env: {
            NOVASTORE_POLICY_RETURNS_APPROVED: 'true',
            NOVASTORE_POLICY_RETURNS_VERSION: 'legal-2026-08-13',
            NOVASTORE_POLICY_RETURNS_TEXT: 'Hukuk biriminin sağladığı sentetik onaylı metin.'
        }
    });
    assert.equal(approved.published, true);
    assert.equal(approved.contentVersion, 'legal-2026-08-13');
    assert.equal(approved.answer, 'Hukuk biriminin sağladığı sentetik onaylı metin.');

    const migration = read('migrations/20260813_02_support_notification_operations.sql');
    assert.match(migration, /CREATE TABLE IF NOT EXISTS support_threads/i);
    assert.match(migration, /UNIQUE \(customer_id\)/i);
    assert.match(migration, /ADD COLUMN IF NOT EXISTS support_thread_id/i);
    assert.match(migration, /ADD COLUMN IF NOT EXISTS handoff_dismissed_at/i);
    assert.match(migration, /ADD COLUMN IF NOT EXISTS handoff_dismissed_by/i);
    assert.match(migration, /chk_messages_message_no_control/i);
    assert.match(migration, /HANDOFF_DISMISSED/i);
    assert.match(migration, /CREATE TABLE IF NOT EXISTS support_thread_events/i);
    assert.match(migration, /ADD COLUMN IF NOT EXISTS entity_type/i);
    assert.match(migration, /chk_notifications_entity_pair/i);
    assert.doesNotMatch(migration, /target_url|external_url|deep_link/i);

    const routes = read('routes/messageRoutes.js');
    assert.match(routes, /requireAdminCommerceCapability\('supportRead'\)/);
    assert.match(routes, /requireAdminCommerceCapability\('supportWrite'\)/);
    assert.match(routes, /requireCurrentAdmin/);
    assert.match(routes, /threads\/:threadId\/takeover/);
    assert.match(routes, /threads\/:threadId\/status/);

    const controller = read('controllers/messageController.js');
    assert.match(controller, /await requireCustomer\(pool, requestedUserId\)/);
    assert.match(controller, /claimSupportThread/);
    assert.match(controller, /entityType: 'support_thread'/);
    assert.match(controller, /UPDATE messages[\s\S]*handoff_dismissed_at/i);
    assert.match(controller, /entity_type IS NULL[\s\S]*entity_id IS NULL[\s\S]*message ~ \$2/i);
    assert.match(controller, /\(\[\^0-9\]\|\$\)/);
    assert.doesNotMatch(controller, /DELETE FROM messages/i);

    const forbiddenHistory = createResponse();
    await messageController.getChatHistory({
        params: { userId: '43' },
        user: { id: 42, role: 'customer', principal: 'customer' }
    }, forbiddenHistory.response);
    assert.equal(forbiddenHistory.state.statusCode, 403);

    const oversizedMessage = createResponse();
    await messageController.sendMessage({
        body: { message: 'x'.repeat(SUPPORT_MESSAGE_MAX_LENGTH + 1) },
        user: { id: 42, role: 'customer', principal: 'customer' }
    }, oversizedMessage.response);
    assert.equal(oversizedMessage.state.statusCode, 400);
    assert.equal(oversizedMessage.state.payload.code, 'SUPPORT_TEXT_INVALID');

    const originalConnect = pool.connect;
    const roleCheckClient = createSupportClient();
    pool.connect = async () => ({
        query: async (sql, params) => {
            if (/^(BEGIN|COMMIT|ROLLBACK)$/i.test(String(sql).trim())) return { rows: [] };
            return roleCheckClient.query(sql, params);
        },
        release() {}
    });
    try {
        const invalidAdminTarget = createResponse();
        await messageController.sendMessage({
            body: { receiver_id: 10, message: 'Bu hedef müşteri değildir.' },
            user: { id: 10, role: 'admin', principal: 'admin' },
            currentAdmin: { id: 10, role: 'admin' }
        }, invalidAdminTarget.response);
        assert.equal(invalidAdminTarget.state.statusCode, 404);
        assert.equal(invalidAdminTarget.state.payload.code, 'SUPPORT_CUSTOMER_NOT_FOUND');
        assert.equal(roleCheckClient.state.messages.length, 0);
    } finally {
        pool.connect = originalConnect;
    }

    const policy = read('services/policyService.js');
    assert.doesNotMatch(policy, /14 gün|1-3 iş günü|2-3 iş günü|Yurtici Kargo/i);
    assert.match(policy, /NOVASTORE_POLICY_\$\{config\.envKey\}/);

    console.log('support notification operations smoke passed');
};

run().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
