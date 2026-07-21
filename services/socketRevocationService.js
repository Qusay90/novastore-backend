const pool = require('../config/db');

const CHANNEL = 'novastore_auth_session_revoked';

const createSocketRevocationService = ({ database = pool } = {}) => {
    const socketsBySession = new Map();
    let listenerClient = null;
    let listenerPromise = null;

    const unregister = (socket) => {
        const sessionId = Number(socket?.authSessionId);
        if (!Number.isInteger(sessionId)) return;
        const sockets = socketsBySession.get(sessionId);
        if (!sockets) return;
        sockets.delete(socket);
        if (sockets.size === 0) socketsBySession.delete(sessionId);
    };

    const register = (socket) => {
        const sessionId = Number(socket?.authSessionId);
        if (!Number.isInteger(sessionId)) throw new TypeError('Socket auth session id is required.');
        const sockets = socketsBySession.get(sessionId) || new Set();
        sockets.add(socket);
        socketsBySession.set(sessionId, sockets);
        socket.once?.('disconnect', () => unregister(socket));
        return () => unregister(socket);
    };

    const disconnectSession = (sessionId) => {
        const normalizedId = Number(sessionId);
        const sockets = socketsBySession.get(normalizedId);
        if (!sockets) return 0;
        let count = 0;
        for (const socket of [...sockets]) {
            count += 1;
            socket.emit?.('session_revoked', { code: 'SESSION_REVOKED' });
            socket.disconnect?.(true);
        }
        socketsBySession.delete(normalizedId);
        return count;
    };

    const disconnectSessions = (sessionIds = []) => sessionIds
        .reduce((count, sessionId) => count + disconnectSession(sessionId), 0);

    const onNotification = (message) => {
        if (message.channel !== CHANNEL) return;
        try {
            const payload = JSON.parse(message.payload || '{}');
            disconnectSession(payload.session_id);
        } catch (_) {
            // Invalid notifications carry no authority and are ignored.
        }
    };

    const start = async () => {
        if (listenerClient) return;
        if (listenerPromise) return listenerPromise;
        listenerPromise = (async () => {
            const client = await database.connect();
            try {
                client.on('notification', onNotification);
                await client.query(`LISTEN ${CHANNEL}`);
                listenerClient = client;
            } catch (error) {
                client.removeListener?.('notification', onNotification);
                client.release();
                throw error;
            } finally {
                listenerPromise = null;
            }
        })();
        return listenerPromise;
    };

    const stop = async () => {
        const client = listenerClient;
        listenerClient = null;
        if (!client) return;
        try {
            await client.query(`UNLISTEN ${CHANNEL}`);
        } finally {
            client.removeListener?.('notification', onNotification);
            client.release();
        }
    };

    return Object.freeze({
        disconnectSession,
        disconnectSessions,
        register,
        start,
        stop,
        unregister
    });
};

const socketRevocationService = createSocketRevocationService();

module.exports = {
    CHANNEL,
    createSocketRevocationService,
    socketRevocationService
};
