const authSessionService = require('../services/authSessionService');
const { socketRevocationService } = require('../services/socketRevocationService');

const sendFailure = (res, error) => {
    if (error instanceof authSessionService.AuthSessionError) {
        return res.status(error.statusCode).json({ error: error.publicMessage });
    }
    return res.status(503).json({ error: authSessionService.SESSION_STATE_UNAVAILABLE_MESSAGE });
};

const logoutCurrent = async (req, res) => {
    try {
        const sessionIds = await authSessionService.revokeCurrentSession({
            sessionId: req.auth.session.id,
            userId: req.user.id,
            principal: req.user.principal
        });
        socketRevocationService.disconnectSessions(sessionIds);
        return res.status(204).end();
    } catch (error) {
        return sendFailure(res, error);
    }
};

const logoutAll = async (req, res) => {
    try {
        const sessionIds = await authSessionService.revokeAllSessions({
            userId: req.user.id,
            principal: req.user.principal
        });
        socketRevocationService.disconnectSessions(sessionIds);
        return res.status(204).end();
    } catch (error) {
        return sendFailure(res, error);
    }
};

module.exports = { logoutAll, logoutCurrent };
