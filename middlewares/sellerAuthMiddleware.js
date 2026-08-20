'use strict';

const { SellerSessionError, loadLiveSellerSession } = require('../services/sellerSessionService');

const sellerError = (res, code, statusCode) => res.status(statusCode).json({ code, error: code });

const extractBearer = (req) => {
    const header = String(req?.headers?.authorization || '');
    if (!header.startsWith('Bearer ')) return null;
    const token = header.slice(7).trim();
    return token || null;
};

const normalizedPrincipal = (claims) => {
    if (!claims || claims.aud !== 'seller' || typeof claims.iss !== 'string' || !claims.iss || !claims.sid || !claims.sub) {
        throw new SellerSessionError('SELLER_AUDIENCE_REQUIRED');
    }
    const userId = Number(claims.sub);
    if (!Number.isSafeInteger(userId) || userId < 1) throw new SellerSessionError('SELLER_AUDIENCE_REQUIRED');
    return Object.freeze({ sessionId: String(claims.sid), userId, issuer: claims.iss, audience: 'seller' });
};

const createSellerAuthMiddleware = ({ verifyAccessToken, loadSession = loadLiveSellerSession } = {}) => {
    if (typeof verifyAccessToken !== 'function') throw new TypeError('Seller access-token verifier is required.');
    if (typeof loadSession !== 'function') throw new TypeError('Seller live-session loader is required.');
    const sellerAudienceAuthenticate = async (req, res, next) => {
        try {
            const token = extractBearer(req);
            if (!token) return sellerError(res, 'AUTH_REQUIRED', 401);
            const claims = await verifyAccessToken(token);
            req.sellerPrincipal = normalizedPrincipal(claims);
            return next();
        } catch (_) {
            return sellerError(res, 'SELLER_AUDIENCE_REQUIRED', 401);
        }
    };
    const requireLiveSellerSession = async (req, res, next) => {
        try {
            req.sellerSession = await loadSession(req.app?.locals?.sellerDatabase, req.sellerPrincipal);
            return next();
        } catch (error) {
            const code = error instanceof SellerSessionError ? error.code : 'SELLER_SESSION_REVOKED';
            const status = error instanceof SellerSessionError ? error.statusCode : 401;
            return sellerError(res, code, status);
        }
    };
    return Object.freeze({ sellerAudienceAuthenticate, requireLiveSellerSession });
};

module.exports = Object.freeze({ extractBearer, normalizedPrincipal, createSellerAuthMiddleware });
