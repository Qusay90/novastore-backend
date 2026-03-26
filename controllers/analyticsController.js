const pool = require('../config/db');
const { getUserFromRequestIfAny } = require('../middlewares/authMiddleware');

const MAX_ID_LENGTH = 120;
const MAX_TEXT_LENGTH = 500;
const MAX_TITLE_LENGTH = 255;
const PAGE_TYPES = new Set(['home', 'product', 'checkout', 'payment_result', 'profile', 'auth', 'other']);
const PRODUCT_ACTION_TYPES = new Set(['add_to_cart']);

const normalizeIdentifier = (value, fieldName) => {
    const normalized = String(value || '').trim().slice(0, MAX_ID_LENGTH);
    if (!normalized) {
        const err = new Error(`${fieldName} zorunludur.`);
        err.statusCode = 400;
        throw err;
    }
    return normalized;
};

const normalizeText = (value, maxLength = MAX_TEXT_LENGTH) => {
    const normalized = String(value || '').trim();
    return normalized ? normalized.slice(0, maxLength) : null;
};

const normalizePath = (value) => {
    const normalized = String(value || '').trim();
    if (!normalized) return '/';
    return normalized.slice(0, MAX_TEXT_LENGTH);
};

const normalizePageType = (value) => {
    const normalized = String(value || 'other').trim().toLowerCase();
    return PAGE_TYPES.has(normalized) ? normalized : 'other';
};

const normalizeProductId = (value) => {
    const parsed = Number.parseInt(value, 10);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
};

const normalizeDurationSeconds = (value) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < 0) return 0;
    return Math.min(Math.floor(parsed / 1000), 60 * 60 * 6);
};

const normalizeQuantity = (value) => {
    const parsed = Number.parseInt(value, 10);
    if (!Number.isInteger(parsed) || parsed <= 0) return 1;
    return Math.min(parsed, 999);
};

const normalizeActionType = (value) => {
    const normalized = String(value || '').trim().toLowerCase();
    if (!PRODUCT_ACTION_TYPES.has(normalized)) {
        const err = new Error('Gecersiz urun aksiyonu.');
        err.statusCode = 400;
        throw err;
    }
    return normalized;
};

const resolveUserId = (req, body) => {
    const authUser = getUserFromRequestIfAny(req);
    if (authUser && Number.isInteger(authUser.id)) {
        return authUser.id;
    }

    const bodyUserId = Number.parseInt(body && body.userId, 10);
    return Number.isInteger(bodyUserId) && bodyUserId > 0 ? bodyUserId : null;
};

const upsertSession = async ({
    sessionKey,
    visitorKey,
    userId,
    landingPath,
    pageType,
    referrer,
    userAgent
}) => {
    await pool.query(
        `INSERT INTO visitor_sessions
            (session_key, visitor_key, user_id, landing_path, entry_page_type, referrer, user_agent, started_at, last_seen_at, ended_at)
         VALUES
            ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW(), NULL)
         ON CONFLICT (session_key)
         DO UPDATE SET
            user_id = COALESCE(visitor_sessions.user_id, EXCLUDED.user_id),
            last_seen_at = NOW(),
            ended_at = NULL,
            referrer = COALESCE(visitor_sessions.referrer, EXCLUDED.referrer),
            user_agent = COALESCE(visitor_sessions.user_agent, EXCLUDED.user_agent)`,
        [sessionKey, visitorKey, userId, landingPath, pageType, referrer, userAgent]
    );
};

const upsertPageVisit = async ({
    pageKey,
    sessionKey,
    pageType,
    pagePath,
    pageTitle,
    productId,
    referrer
}) => {
    await pool.query(
        `INSERT INTO page_visits
            (page_key, session_key, page_type, page_path, page_title, product_id, referrer, entered_at, last_seen_at)
         VALUES
            ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
         ON CONFLICT (page_key)
         DO UPDATE SET
            page_type = EXCLUDED.page_type,
            page_path = EXCLUDED.page_path,
            page_title = COALESCE(EXCLUDED.page_title, page_visits.page_title),
            product_id = COALESCE(EXCLUDED.product_id, page_visits.product_id),
            referrer = COALESCE(page_visits.referrer, EXCLUDED.referrer),
            last_seen_at = NOW()`,
        [pageKey, sessionKey, pageType, pagePath, pageTitle, productId, referrer]
    );
};

const readTrackingPayload = (req) => {
    const body = req.body || {};
    return {
        sessionKey: normalizeIdentifier(body.sessionId, 'sessionId'),
        visitorKey: normalizeIdentifier(body.visitorId, 'visitorId'),
        pageKey: normalizeIdentifier(body.pageKey, 'pageKey'),
        pageType: normalizePageType(body.pageType),
        pagePath: normalizePath(body.pagePath),
        pageTitle: normalizeText(body.pageTitle, MAX_TITLE_LENGTH),
        productId: normalizeProductId(body.productId),
        referrer: normalizeText(body.referrer, MAX_TEXT_LENGTH),
        durationSeconds: normalizeDurationSeconds(body.durationMs),
        userId: resolveUserId(req, body)
    };
};

const readProductActionPayload = (req) => {
    const trackingPayload = readTrackingPayload(req);
    const body = req.body || {};

    return {
        ...trackingPayload,
        actionKey: normalizeIdentifier(body.actionKey, 'actionKey'),
        actionType: normalizeActionType(body.actionType),
        quantity: normalizeQuantity(body.quantity)
    };
};

const trackPageEnter = async (req, res) => {
    try {
        const payload = readTrackingPayload(req);
        const userAgent = normalizeText(req.headers['user-agent'], MAX_TEXT_LENGTH);

        await upsertSession({
            sessionKey: payload.sessionKey,
            visitorKey: payload.visitorKey,
            userId: payload.userId,
            landingPath: payload.pagePath,
            pageType: payload.pageType,
            referrer: payload.referrer,
            userAgent
        });

        await upsertPageVisit(payload);

        res.status(202).json({ ok: true });
    } catch (err) {
        const statusCode = Number(err && err.statusCode) || 500;
        const message = statusCode === 500 ? 'Analytics kaydi olusturulamadi.' : err.message;
        console.error('Analytics enter hatasi:', err.message);
        res.status(statusCode).json({ error: message });
    }
};

const trackPageHeartbeat = async (req, res) => {
    try {
        const payload = readTrackingPayload(req);
        const userAgent = normalizeText(req.headers['user-agent'], MAX_TEXT_LENGTH);

        await upsertSession({
            sessionKey: payload.sessionKey,
            visitorKey: payload.visitorKey,
            userId: payload.userId,
            landingPath: payload.pagePath,
            pageType: payload.pageType,
            referrer: payload.referrer,
            userAgent
        });

        const updateResult = await pool.query(
            `UPDATE page_visits
             SET last_seen_at = NOW(),
                 duration_seconds = GREATEST(duration_seconds, $3),
                 heartbeat_count = heartbeat_count + 1
             WHERE session_key = $1 AND page_key = $2
             RETURNING id`,
            [payload.sessionKey, payload.pageKey, payload.durationSeconds]
        );

        if (updateResult.rows.length === 0) {
            await upsertPageVisit(payload);
        }

        res.status(202).json({ ok: true });
    } catch (err) {
        const statusCode = Number(err && err.statusCode) || 500;
        const message = statusCode === 500 ? 'Analytics heartbeat kaydedilemedi.' : err.message;
        console.error('Analytics heartbeat hatasi:', err.message);
        res.status(statusCode).json({ error: message });
    }
};

const trackPageLeave = async (req, res) => {
    try {
        const payload = readTrackingPayload(req);
        const userAgent = normalizeText(req.headers['user-agent'], MAX_TEXT_LENGTH);

        await upsertSession({
            sessionKey: payload.sessionKey,
            visitorKey: payload.visitorKey,
            userId: payload.userId,
            landingPath: payload.pagePath,
            pageType: payload.pageType,
            referrer: payload.referrer,
            userAgent
        });

        const updateResult = await pool.query(
            `UPDATE page_visits
             SET last_seen_at = NOW(),
                 left_at = NOW(),
                 duration_seconds = GREATEST(duration_seconds, $3)
             WHERE session_key = $1 AND page_key = $2
             RETURNING id`,
            [payload.sessionKey, payload.pageKey, payload.durationSeconds]
        );

        if (updateResult.rows.length === 0) {
            await upsertPageVisit(payload);
            await pool.query(
                `UPDATE page_visits
                 SET left_at = NOW(),
                     duration_seconds = GREATEST(duration_seconds, $3)
                 WHERE session_key = $1 AND page_key = $2`,
                [payload.sessionKey, payload.pageKey, payload.durationSeconds]
            );
        }

        await pool.query(
            `UPDATE visitor_sessions
             SET last_seen_at = NOW(),
                 ended_at = NOW(),
                 user_id = COALESCE(user_id, $2)
             WHERE session_key = $1`,
            [payload.sessionKey, payload.userId]
        );

        res.status(202).json({ ok: true });
    } catch (err) {
        const statusCode = Number(err && err.statusCode) || 500;
        const message = statusCode === 500 ? 'Analytics cikis kaydedilemedi.' : err.message;
        console.error('Analytics leave hatasi:', err.message);
        res.status(statusCode).json({ error: message });
    }
};

const trackProductAction = async (req, res) => {
    try {
        const payload = readProductActionPayload(req);
        const userAgent = normalizeText(req.headers['user-agent'], MAX_TEXT_LENGTH);

        await upsertSession({
            sessionKey: payload.sessionKey,
            visitorKey: payload.visitorKey,
            userId: payload.userId,
            landingPath: payload.pagePath,
            pageType: payload.pageType,
            referrer: payload.referrer,
            userAgent
        });

        await pool.query(
            `INSERT INTO product_actions
                (action_key, session_key, visitor_key, user_id, product_id, action_type, quantity, page_path, created_at)
             VALUES
                ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
             ON CONFLICT (action_key) DO NOTHING`,
            [
                payload.actionKey,
                payload.sessionKey,
                payload.visitorKey,
                payload.userId,
                payload.productId,
                payload.actionType,
                payload.quantity,
                payload.pagePath
            ]
        );

        res.status(202).json({ ok: true });
    } catch (err) {
        const statusCode = Number(err && err.statusCode) || 500;
        const message = statusCode === 500 ? 'Urun aksiyonu kaydedilemedi.' : err.message;
        console.error('Analytics urun aksiyonu hatasi:', err.message);
        res.status(statusCode).json({ error: message });
    }
};

module.exports = {
    trackPageEnter,
    trackPageHeartbeat,
    trackPageLeave,
    trackProductAction
};
