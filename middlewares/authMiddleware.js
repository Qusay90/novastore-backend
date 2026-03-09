const jwt = require('jsonwebtoken');

const extractBearerToken = (req) => {
    const authHeader = req.headers.authorization || '';
    if (!authHeader.startsWith('Bearer ')) return null;
    const token = authHeader.slice(7).trim();
    return token || null;
};

const verifyJwt = (token) => {
    if (!process.env.JWT_SECRET) {
        const err = new Error('Server JWT config missing.');
        err.statusCode = 500;
        throw err;
    }
    return jwt.verify(token, process.env.JWT_SECRET);
};

const toUserPayload = (decoded) => ({
    id: Number(decoded.id),
    role: decoded.role || 'customer'
});

const authenticate = (req, res, next) => {
    try {
        const token = extractBearerToken(req);
        if (!token) {
            return res.status(401).json({ error: 'Authentication required.' });
        }

        const decoded = verifyJwt(token);
        const user = toUserPayload(decoded);
        if (!Number.isInteger(user.id)) {
            return res.status(401).json({ error: 'Invalid token.' });
        }

        req.user = user;
        next();
    } catch (err) {
        if (err.statusCode === 500) {
            return res.status(500).json({ error: 'Server JWT config missing.' });
        }
        return res.status(401).json({ error: 'Invalid or expired token.' });
    }
};

const requireRole = (...roles) => (req, res, next) => {
    if (!req.user) {
        return res.status(401).json({ error: 'Authentication required.' });
    }

    if (!roles.includes(req.user.role)) {
        return res.status(403).json({ error: 'Insufficient permissions.' });
    }
    next();
};

const requireAdmin = requireRole('admin');

const requireSelfOrAdmin = (paramName = 'userId') => (req, res, next) => {
    if (!req.user) {
        return res.status(401).json({ error: 'Authentication required.' });
    }
    if (req.user.role === 'admin') {
        return next();
    }

    const paramId = Number(req.params[paramName]);
    if (!Number.isInteger(paramId)) {
        return res.status(400).json({ error: 'Invalid user id.' });
    }

    if (paramId !== req.user.id) {
        return res.status(403).json({ error: 'Access denied.' });
    }
    next();
};

const getUserFromRequestIfAny = (req) => {
    try {
        const token = extractBearerToken(req);
        if (!token) return null;
        const decoded = verifyJwt(token);
        const user = toUserPayload(decoded);
        return Number.isInteger(user.id) ? user : null;
    } catch (_) {
        return null;
    }
};

module.exports = {
    authenticate,
    requireAdmin,
    requireRole,
    requireSelfOrAdmin,
    getUserFromRequestIfAny
};
