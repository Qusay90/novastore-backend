'use strict';

const crypto = require('node:crypto');
const { toSafeError } = require('../services/sellerLoginService');

const safeFailure = (res, error) => {
    const safe = toSafeError(error);
    return res.status(safe.statusCode || 503).json({ code: safe.code, error: safe.code });
};

const requestCorrelationId = (req) => {
    const supplied = String(req.get?.('x-request-id') || req.headers?.['x-request-id'] || '');
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(supplied)
        ? supplied
        : crypto.randomUUID();
};

const auditContext = (req) => Object.freeze({
    correlationId: requestCorrelationId(req),
    actor: req.sellerSession ? Object.freeze({
        userId: req.sellerSession.userId,
        membershipId: req.sellerSession.membershipId,
        organizationId: req.sellerSession.organizationId,
        sessionId: req.sellerSession.sessionId
    }) : null
});

const createSellerAuthController = ({ loginService, tokenService } = {}) => {
    if (!loginService || !tokenService) throw new TypeError('Seller auth dependencies are required.');
    return Object.freeze({
        login: async (req, res) => {
            try { return res.status(200).json(await loginService.login(req.app.locals.sellerDatabase, tokenService, req.body)); }
            catch (error) { return safeFailure(res, error); }
        },
        refresh: async (req, res) => {
            try { return res.status(200).json(await loginService.refresh(req.app.locals.sellerDatabase, tokenService, req.body, auditContext(req))); }
            catch (error) { return safeFailure(res, error); }
        },
        logout: async (req, res) => {
            try { await loginService.logoutCurrent(req.app.locals.sellerDatabase, req.sellerSession.sessionId, auditContext(req)); return res.status(200).json({ logged_out: true }); }
            catch (error) { return safeFailure(res, error); }
        },
        logoutAll: async (req, res) => {
            try { const result = await loginService.logoutAll(req.app.locals.sellerDatabase, req.sellerSession.userId, req.sellerSession.sessionId, auditContext(req)); return res.status(200).json({ logged_out_all: true, revoked_session_count: result.revokedSessionIds.length }); }
            catch (error) { return safeFailure(res, error); }
        },
        sessions: async (req, res) => {
            try { return res.status(200).json({ sessions: await loginService.sessions(req.app.locals.sellerDatabase, req.sellerSession.userId, req.sellerSession.sessionId) }); }
            catch (error) { return safeFailure(res, error); }
        }
    });
};

module.exports = Object.freeze({ createSellerAuthController, safeFailure, requestCorrelationId });
