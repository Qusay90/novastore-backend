const authSessionService = require('../services/authSessionService');

const extractBearerToken = (req) => {
    const authHeader = String(req.headers?.authorization || '');
    if (!authHeader.startsWith('Bearer ')) return null;
    const token = authHeader.slice(7).trim();
    return token || null;
};

const requestPath = (req) => String(req.originalUrl || `${req.baseUrl || ''}${req.path || ''}`)
    .split('?')[0];

const inferExpectedPrincipal = (req) => {
    const path = requestPath(req);
    const method = String(req.method || 'GET').toUpperCase();

    if (/^\/api\/(?:admin(?:\/|$)|auth(?:\/|$)|questions\/admin(?:\/|$))/.test(path)) return 'admin';
    if (/^\/api\/(?:users|addresses|favorites|shared-state)(?:\/|$)/.test(path)) return 'customer';
    if (/^\/api\/payments(?:\/|$)/.test(path)) return 'customer';
    if (path === '/api/reviews' && method === 'POST') return 'customer';
    if (/^\/api\/reviews\/product(?:\/|$)/.test(path)) return 'customer';
    if (/^\/api\/(?:assistant|analytics)(?:\/|$)/.test(path)) return 'customer';
    if (/^\/api\/questions\/(?:ask|user)(?:\/|$)/.test(path)) return 'customer';
    if (/^\/api\/products(?:\/|$)/.test(path) && method !== 'GET') return 'admin';
    if (/^\/api\/categories(?:\/|$)/.test(path) && method !== 'GET') return 'admin';
    if (/^\/api\/campaigns\/(?:coupons(?:\/\d+)?|config)(?:\/|$)/.test(path)
        && !/^\/api\/campaigns\/coupons\/active(?:\/|$)/.test(path)) return 'admin';
    if (/^\/api\/campaigns\/coupons\/active(?:\/|$)/.test(path)) return 'customer';
    if (/^\/api\/messages\/(?:users|handoffs)(?:\/|$)/.test(path)) return 'admin';
    if (/^\/api\/notifications\/(?:admin|test)(?:\/|$)/.test(path)) return 'admin';
    if (path === '/api/orders' && method === 'GET') return 'admin';
    if (path === '/api/orders' && method === 'POST') return 'customer';
    if (/^\/api\/orders\/\d+(?:\/status)?\/?$/.test(path) && ['PUT', 'DELETE'].includes(method)) return 'admin';
    if (/^\/api\/returns\/admin(?:\/|$)/.test(path)
        || (/^\/api\/returns\/\d+\/status\/?$/.test(path) && method === 'PATCH')) return 'admin';
    if (/^\/api\/shipments\/\d+\/(?:create|manual)\/?$/.test(path) && method === 'POST') return 'admin';
    return null;
};

const sendAuthError = (res, error) => {
    if (error instanceof authSessionService.AuthSessionError) {
        return res.status(error.statusCode).json({ error: error.publicMessage });
    }
    return res.status(401).json({ error: authSessionService.GENERIC_AUTH_MESSAGE });
};

const authenticateRequest = async (req, res, next, options = {}) => {
    const token = extractBearerToken(req);
    if (!token) return res.status(401).json({ error: 'Authentication required.' });

    try {
        const auth = await authSessionService.verifyAccessToken(token, {
            expectedPrincipal: options.expectedPrincipal || inferExpectedPrincipal(req),
            allowRevoked: options.allowRevoked === true
        });
        req.user = auth.user;
        req.auth = auth;
        return next();
    } catch (error) {
        return sendAuthError(res, error);
    }
};

const authenticate = (req, res, next) => authenticateRequest(req, res, next);
const authenticateCustomer = (req, res, next) => authenticateRequest(
    req,
    res,
    next,
    { expectedPrincipal: 'customer' }
);
const authenticateAdmin = (req, res, next) => authenticateRequest(
    req,
    res,
    next,
    { expectedPrincipal: 'admin' }
);
const authenticateCustomerForLogout = (req, res, next) => authenticateRequest(
    req,
    res,
    next,
    { expectedPrincipal: 'customer', allowRevoked: true }
);
const authenticateAdminForLogout = (req, res, next) => authenticateRequest(
    req,
    res,
    next,
    { expectedPrincipal: 'admin', allowRevoked: true }
);

const requirePrincipal = (...principals) => (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Authentication required.' });
    if (!principals.includes(req.user.principal)) {
        return res.status(401).json({ error: authSessionService.GENERIC_AUTH_MESSAGE });
    }
    return next();
};

const requireRole = (...roles) => (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Authentication required.' });
    if (!roles.includes(req.user.role)) {
        return res.status(403).json({ error: 'Insufficient permissions.' });
    }
    return next();
};

const requireAdmin = (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Authentication required.' });
    if (req.user.principal !== 'admin') {
        return res.status(401).json({ error: authSessionService.GENERIC_AUTH_MESSAGE });
    }
    if (req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Insufficient permissions.' });
    }
    return next();
};

const requireSelfOrAdmin = (paramName = 'userId') => (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Authentication required.' });
    if (req.user.principal === 'admin' && req.user.role === 'admin') return next();

    const paramId = Number(req.params[paramName]);
    if (!Number.isInteger(paramId)) {
        return res.status(400).json({ error: 'Invalid user id.' });
    }
    if (paramId !== req.user.id) return res.status(403).json({ error: 'Access denied.' });
    return next();
};

const getUserFromRequestIfAny = async (req) => {
    const authHeader = String(req.headers?.authorization || '');
    if (!authHeader) return null;
    const token = extractBearerToken(req);
    if (!token) {
        throw new authSessionService.AuthSessionError(
            'AUTH_TOKEN_INVALID',
            401,
            authSessionService.GENERIC_AUTH_MESSAGE
        );
    }
    const auth = await authSessionService.verifyAccessToken(token, {
        expectedPrincipal: inferExpectedPrincipal(req)
    });
    req.user = auth.user;
    req.auth = auth;
    return auth.user;
};

module.exports = {
    authenticate,
    authenticateAdmin,
    authenticateAdminForLogout,
    authenticateCustomer,
    authenticateCustomerForLogout,
    extractBearerToken,
    getUserFromRequestIfAny,
    inferExpectedPrincipal,
    requireAdmin,
    requirePrincipal,
    requireRole,
    requireSelfOrAdmin,
    sendAuthError
};
