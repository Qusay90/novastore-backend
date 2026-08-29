'use strict';

const authSessionService = require('../services/authSessionService');

const ALLOWED_REFRESH_FIELDS = new Set(['refreshToken', 'sessionId']);

const invalidRequest = () => new authSessionService.AuthSessionError(
    'AUTH_REFRESH_REQUEST_INVALID',
    400,
    'Refresh request is invalid.'
);

const normalizeRefreshRequest = (body) => {
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw invalidRequest();
    if (Object.keys(body).some((key) => !ALLOWED_REFRESH_FIELDS.has(key))) throw invalidRequest();
    return Object.freeze({
        expectedSessionId: body.sessionId,
        refreshToken: body.refreshToken
    });
};

const publicFailureCode = (error) => {
    if (error.statusCode === 401) return 'AUTH_REFRESH_REJECTED';
    return error.code || 'AUTH_REFRESH_REJECTED';
};

const sendRefreshFailure = (res, error) => {
    if (error instanceof authSessionService.AuthSessionError) {
        return res.status(error.statusCode).json({
            code: publicFailureCode(error),
            error: error.publicMessage
        });
    }
    return res.status(503).json({
        code: 'AUTH_SESSION_STATE_UNAVAILABLE',
        error: authSessionService.SESSION_STATE_UNAVAILABLE_MESSAGE
    });
};

const refreshCustomerSession = async (req, res) => {
    try {
        const input = normalizeRefreshRequest(req.body);
        const rotated = await authSessionService.rotateCustomerRefreshSession(input);
        return res.status(200).json({
            accessToken: rotated.accessToken,
            refreshToken: rotated.refreshToken,
            tokenType: 'Bearer',
            accessExpiresAt: rotated.accessExpiresAt.toISOString(),
            refreshExpiresAt: rotated.refreshExpiresAt.toISOString(),
            sessionId: rotated.sessionId
        });
    } catch (error) {
        return sendRefreshFailure(res, error);
    }
};

module.exports = {
    normalizeRefreshRequest,
    refreshCustomerSession,
    sendRefreshFailure
};
