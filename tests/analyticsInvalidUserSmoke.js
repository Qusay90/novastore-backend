const assert = require('assert');
const pool = require('../config/db');
const {
    trackPageEnter,
    trackPageHeartbeat,
    trackPageLeave,
    trackProductAction
} = require('../controllers/analyticsController');

const validUsers = new Set([10]);
const sessions = new Map();
const pageVisits = new Map();
const productActions = [];

const resolveUserId = (userId) => validUsers.has(userId) ? userId : null;
const pageVisitKey = (sessionKey, pageKey) => `${sessionKey}:${pageKey}`;

pool.query = async (sql, params = []) => {
    if (/INSERT INTO visitor_sessions/i.test(sql)) {
        assert.match(
            sql,
            /\(SELECT id FROM users WHERE id = \$3\)/i,
            'session user_id must be resolved through users'
        );

        const sessionKey = params[0];
        const existing = sessions.get(sessionKey);
        const resolvedUserId = resolveUserId(params[2]);
        sessions.set(sessionKey, {
            visitorKey: params[1],
            userId: existing?.userId ?? resolvedUserId
        });
        return { rows: [], rowCount: 1 };
    }

    if (/INSERT INTO page_visits/i.test(sql)) {
        const key = pageVisitKey(params[1], params[0]);
        pageVisits.set(key, {
            pageKey: params[0],
            sessionKey: params[1],
            durationSeconds: pageVisits.get(key)?.durationSeconds ?? 0,
            left: false
        });
        return { rows: [], rowCount: 1 };
    }

    if (/UPDATE page_visits/i.test(sql)) {
        const key = pageVisitKey(params[0], params[1]);
        const existing = pageVisits.get(key);
        if (!existing) {
            return { rows: [], rowCount: 0 };
        }

        pageVisits.set(key, {
            ...existing,
            durationSeconds: Math.max(existing.durationSeconds, params[2] || 0),
            left: existing.left || /left_at = NOW\(\)/i.test(sql)
        });
        return {
            rows: /RETURNING id/i.test(sql) ? [{ id: 1 }] : [],
            rowCount: 1
        };
    }

    if (/UPDATE visitor_sessions/i.test(sql)) {
        assert.match(
            sql,
            /\(SELECT id FROM users WHERE id = \$2\)/i,
            'page-leave session update must resolve user_id through users'
        );

        const sessionKey = params[0];
        const existing = sessions.get(sessionKey);
        assert.ok(existing, `missing session ${sessionKey}`);
        sessions.set(sessionKey, {
            ...existing,
            userId: existing.userId ?? resolveUserId(params[1])
        });
        return { rows: [], rowCount: 1 };
    }

    if (/INSERT INTO product_actions/i.test(sql)) {
        assert.match(
            sql,
            /\(SELECT id FROM users WHERE id = \$4\)/i,
            'product action user_id must be resolved through users'
        );

        productActions.push({
            actionKey: params[0],
            sessionKey: params[1],
            visitorKey: params[2],
            userId: resolveUserId(params[3]),
            productId: params[4],
            actionType: params[5],
            quantity: params[6],
            pagePath: params[7]
        });
        return { rows: [], rowCount: 1 };
    }

    throw new Error(`Unhandled fake pool SQL: ${sql}`);
};

const createReq = ({ userId, sessionId, actionKey = `action_${sessionId}` }) => ({
    headers: { 'user-agent': 'analytics-smoke' },
    body: {
        sessionId,
        visitorId: 'visitor_smoke',
        pageKey: `page_${sessionId}`,
        pageType: 'product',
        pagePath: '/product.html?id=101',
        pageTitle: 'Smoke Product',
        productId: 101,
        referrer: '',
        durationMs: 1200,
        userId,
        actionKey,
        actionType: 'add_to_cart',
        quantity: 1
    }
});

const createRes = () => ({
    statusCode: 200,
    body: null,
    status(code) {
        this.statusCode = code;
        return this;
    },
    json(payload) {
        this.body = payload;
        return this;
    }
});

const runAccepted = async (handler, request) => {
    const response = createRes();
    await handler(request, response);
    assert.strictEqual(response.statusCode, 202);
    assert.deepStrictEqual(response.body, { ok: true });
};

(async () => {
    await runAccepted(
        trackPageEnter,
        createReq({ userId: 9999, sessionId: 'page_enter_invalid_user' })
    );
    assert.strictEqual(sessions.get('page_enter_invalid_user').userId, null);
    assert.ok(pageVisits.has('page_enter_invalid_user:page_page_enter_invalid_user'));

    await runAccepted(
        trackPageHeartbeat,
        createReq({ userId: 9999, sessionId: 'heartbeat_invalid_user' })
    );
    assert.strictEqual(sessions.get('heartbeat_invalid_user').userId, null);
    assert.ok(pageVisits.has('heartbeat_invalid_user:page_heartbeat_invalid_user'));

    await runAccepted(
        trackPageHeartbeat,
        createReq({ userId: null, sessionId: 'heartbeat_null_user' })
    );
    assert.strictEqual(sessions.get('heartbeat_null_user').userId, null);

    await runAccepted(
        trackPageEnter,
        createReq({ userId: 10, sessionId: 'existing_valid_session' })
    );
    assert.strictEqual(sessions.get('existing_valid_session').userId, 10);

    await runAccepted(
        trackPageLeave,
        createReq({ userId: 9999, sessionId: 'existing_valid_session' })
    );
    assert.strictEqual(
        sessions.get('existing_valid_session').userId,
        10,
        'page-leave must preserve the valid user on an existing session'
    );
    assert.strictEqual(
        pageVisits.get('existing_valid_session:page_existing_valid_session').left,
        true
    );

    await runAccepted(
        trackProductAction,
        createReq({
            userId: 9999,
            sessionId: 'product_action_invalid_user',
            actionKey: 'action_invalid_user'
        })
    );
    assert.strictEqual(sessions.get('product_action_invalid_user').userId, null);
    assert.strictEqual(productActions.at(-1).userId, null);

    await runAccepted(
        trackProductAction,
        createReq({
            userId: 10,
            sessionId: 'product_action_valid_user',
            actionKey: 'action_valid_user'
        })
    );
    assert.strictEqual(sessions.get('product_action_valid_user').userId, 10);
    assert.strictEqual(productActions.at(-1).userId, 10);

    console.log('analytics invalid user smoke passed');
})().catch((err) => {
    console.error(err);
    process.exit(1);
});
