const buckets = new Map();

const cleanup = () => {
    const now = Date.now();
    for (const [key, value] of buckets.entries()) {
        if (value.expiresAt <= now) {
            buckets.delete(key);
        }
    }
};

setInterval(cleanup, 60 * 1000).unref();

const simpleRateLimit = ({ windowMs = 60 * 1000, max = 120 } = {}) => (req, res, next) => {
    const ip = req.ip || req.connection.remoteAddress || 'unknown';
    const key = `${ip}:${req.path}`;
    const now = Date.now();

    const existing = buckets.get(key);
    if (!existing || existing.expiresAt <= now) {
        buckets.set(key, { count: 1, expiresAt: now + windowMs });
        return next();
    }

    existing.count += 1;
    if (existing.count > max) {
        return res.status(429).json({ error: 'Cok fazla istek gonderildi. Lutfen kisa sure sonra tekrar deneyin.' });
    }

    next();
};

const sanitizeString = (value) =>
    value
        .replace(/<\s*script/gi, '&lt;script')
        .replace(/<\s*\/\s*script\s*>/gi, '&lt;/script&gt;')
        .replace(/onerror\s*=|onload\s*=/gi, '');

const sanitizePayload = (value) => {
    if (typeof value === 'string') return sanitizeString(value);
    if (Array.isArray(value)) return value.map(sanitizePayload);
    if (value && typeof value === 'object') {
        const output = {};
        Object.keys(value).forEach((key) => {
            output[key] = sanitizePayload(value[key]);
        });
        return output;
    }
    return value;
};

const sanitizeBody = (req, _res, next) => {
    if (req.body && typeof req.body === 'object') {
        req.body = sanitizePayload(req.body);
    }
    next();
};

module.exports = {
    simpleRateLimit,
    sanitizeBody
};
