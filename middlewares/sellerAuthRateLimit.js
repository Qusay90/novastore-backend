'use strict';

const crypto = require('node:crypto');

const boundedPositiveInteger = (value, fallback, label) => {
    const resolved = value === undefined ? fallback : value;
    if (!Number.isSafeInteger(resolved) || resolved < 1) throw new TypeError(`${label} must be a positive integer.`);
    return resolved;
};

const normalizeIdentifier = (value) => (
    typeof value === 'string' && value.trim()
        ? value.trim().slice(0, 320).toLocaleLowerCase('tr-TR')
        : 'missing'
);

const opaqueKey = (namespace, value) => crypto
    .createHash('sha256')
    .update(`${namespace}\u0000${value}`, 'utf8')
    .digest('hex');

const createSellerLoginRateLimit = ({
    windowMs = 5 * 60 * 1000,
    ipMaxFailures = 20,
    identifierMaxFailures = 5,
    now = Date.now
} = {}) => {
    const effectiveWindowMs = boundedPositiveInteger(windowMs, 5 * 60 * 1000, 'windowMs');
    const effectiveIpMax = boundedPositiveInteger(ipMaxFailures, 20, 'ipMaxFailures');
    const effectiveIdentifierMax = boundedPositiveInteger(identifierMaxFailures, 5, 'identifierMaxFailures');
    if (typeof now !== 'function') throw new TypeError('now must be a function.');

    const buckets = new Map();
    const currentBucket = (key, timestamp) => {
        const existing = buckets.get(key);
        if (existing && existing.expiresAt > timestamp) return existing;
        const created = { failures: 0, pending: 0, expiresAt: timestamp + effectiveWindowMs };
        buckets.set(key, created);
        return created;
    };

    return (req, res, next) => {
        const timestamp = now();
        for (const [key, bucket] of buckets.entries()) {
            if (bucket.expiresAt <= timestamp) buckets.delete(key);
        }

        const ip = String(req.ip || req.socket?.remoteAddress || req.connection?.remoteAddress || 'unknown');
        const identifier = normalizeIdentifier(req.body?.identifier);
        const ipKey = opaqueKey('seller-login-ip', ip);
        const identifierKey = opaqueKey('seller-login-identifier', identifier);
        const ipBucket = currentBucket(ipKey, timestamp);
        const identifierBucket = currentBucket(identifierKey, timestamp);

        if (
            ipBucket.failures + ipBucket.pending >= effectiveIpMax ||
            identifierBucket.failures + identifierBucket.pending >= effectiveIdentifierMax
        ) {
            const retryAfterSeconds = Math.max(1, Math.ceil(
                (Math.min(ipBucket.expiresAt, identifierBucket.expiresAt) - timestamp) / 1000
            ));
            res.set?.('Retry-After', String(retryAfterSeconds));
            return res.status(429).json({
                code: 'SELLER_LOGIN_RATE_LIMITED',
                error: 'SELLER_LOGIN_RATE_LIMITED'
            });
        }

        ipBucket.pending += 1;
        identifierBucket.pending += 1;
        res.once('finish', () => {
            ipBucket.pending = Math.max(0, ipBucket.pending - 1);
            identifierBucket.pending = Math.max(0, identifierBucket.pending - 1);
            if (res.statusCode === 401) {
                ipBucket.failures += 1;
                identifierBucket.failures += 1;
            } else if (res.statusCode >= 200 && res.statusCode < 300) {
                buckets.delete(identifierKey);
            }
        });
        return next();
    };
};

module.exports = Object.freeze({ createSellerLoginRateLimit, normalizeIdentifier });
