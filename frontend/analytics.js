(function () {
    if (window.NovaAnalytics && window.NovaAnalytics.__initialized) return;

    const VISITOR_KEY = 'nova_visitor_id';
    const SESSION_KEY = 'nova_analytics_session';
    const SESSION_TIMEOUT_MS = 30 * 60 * 1000;
    const HEARTBEAT_INTERVAL_MS = 15000;
    const MAX_ID_LENGTH = 120;

    const state = {
        pageKey: null,
        enteredAt: Date.now(),
        heartbeatTimer: null,
        leaving: false,
        initRan: false
    };

    function safeJsonParse(value) {
        try {
            return JSON.parse(value);
        } catch (_) {
            return null;
        }
    }

    function randomId(prefix) {
        const randomPart = Math.random().toString(36).slice(2, 10);
        return `${prefix}_${Date.now().toString(36)}_${randomPart}`.slice(0, MAX_ID_LENGTH);
    }

    function getVisitorId() {
        let visitorId = localStorage.getItem(VISITOR_KEY);
        if (!visitorId) {
            visitorId = randomId('visitor');
            localStorage.setItem(VISITOR_KEY, visitorId);
        }
        return visitorId;
    }

    function getUserId() {
        const info = safeJsonParse(localStorage.getItem('nova_user_info'));
        const userId = Number(info && info.id);
        return Number.isInteger(userId) && userId > 0 ? userId : null;
    }

    function ensureSession() {
        const now = Date.now();
        const visitorId = getVisitorId();
        const existing = safeJsonParse(localStorage.getItem(SESSION_KEY));

        if (
            existing &&
            typeof existing.sessionId === 'string' &&
            typeof existing.lastActivityAt === 'number' &&
            now - existing.lastActivityAt < SESSION_TIMEOUT_MS
        ) {
            const refreshed = {
                ...existing,
                visitorId,
                lastActivityAt: now
            };
            localStorage.setItem(SESSION_KEY, JSON.stringify(refreshed));
            return refreshed;
        }

        const nextSession = {
            sessionId: randomId('session'),
            visitorId,
            startedAt: now,
            lastActivityAt: now
        };

        localStorage.setItem(SESSION_KEY, JSON.stringify(nextSession));
        return nextSession;
    }

    function touchSession() {
        const session = ensureSession();
        session.lastActivityAt = Date.now();
        localStorage.setItem(SESSION_KEY, JSON.stringify(session));
        return session;
    }

    function resolvePageType() {
        const fileName = (window.location.pathname.split('/').pop() || 'index.html').toLowerCase();

        if (fileName === '' || fileName === 'index.html') return 'home';
        if (fileName === 'product.html') return 'product';
        if (fileName === 'checkout.html') return 'checkout';
        if (fileName === 'payment-result.html') return 'payment_result';
        if (fileName === 'profile.html') return 'profile';
        if (fileName.includes('login') || fileName.includes('password')) return 'auth';
        return 'other';
    }

    function resolveProductId(pageType) {
        if (pageType !== 'product') return null;
        const params = new URLSearchParams(window.location.search);
        const productId = Number.parseInt(params.get('id'), 10);
        return Number.isInteger(productId) && productId > 0 ? productId : null;
    }

    function buildPayload() {
        const session = touchSession();
        const pageType = resolvePageType();

        return {
            sessionId: session.sessionId,
            visitorId: session.visitorId,
            pageKey: state.pageKey,
            pageType,
            pagePath: `${window.location.pathname}${window.location.search}`,
            pageTitle: document.title || '',
            productId: resolveProductId(pageType),
            referrer: document.referrer || '',
            durationMs: Date.now() - state.enteredAt,
            userId: getUserId()
        };
    }

    function post(endpoint, keepalive, customPayload) {
        return fetch(`/api/analytics/${endpoint}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(customPayload || buildPayload()),
            keepalive: Boolean(keepalive)
        }).catch(() => null);
    }

    function trackProductAction(actionType, product, quantity) {
        const productId = Number.parseInt(product && product.id, 10);
        if (!Number.isInteger(productId) || productId <= 0) return;

        const safeQuantity = Number.isInteger(quantity) && quantity > 0 ? quantity : 1;
        const payload = {
            ...buildPayload(),
            actionKey: randomId('action'),
            actionType,
            productId,
            quantity: safeQuantity
        };

        post('product-action', false, payload);
    }

    function stopHeartbeat() {
        if (!state.heartbeatTimer) return;
        window.clearInterval(state.heartbeatTimer);
        state.heartbeatTimer = null;
    }

    function startHeartbeat() {
        stopHeartbeat();
        state.heartbeatTimer = window.setInterval(() => {
            post('page-heartbeat', false);
        }, HEARTBEAT_INTERVAL_MS);
    }

    function leavePage() {
        if (state.leaving) return;
        state.leaving = true;
        stopHeartbeat();
        post('page-leave', true);
    }

    function init() {
        if (state.initRan) return;
        if (window.location.pathname.toLowerCase().includes('admin')) return;

        state.initRan = true;
        state.pageKey = randomId('page');
        state.enteredAt = Date.now();
        state.leaving = false;

        post('page-enter', false);
        startHeartbeat();

        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'hidden') {
                post('page-heartbeat', true);
            }
        });

        window.addEventListener('pagehide', leavePage, { capture: true });
        window.addEventListener('beforeunload', leavePage, { capture: true });
    }

    window.NovaAnalytics = {
        __initialized: true,
        init,
        getSessionId() {
            return ensureSession().sessionId;
        },
        getVisitorId() {
            return getVisitorId();
        },
        trackAddToCart(product, quantity = 1) {
            trackProductAction('add_to_cart', product, Number.parseInt(quantity, 10));
        }
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init, { once: true });
    } else {
        init();
    }
})();
