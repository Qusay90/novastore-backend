const pool = require('../config/db');

const CHANNEL = 'novastore_auth_session_revoked';

const createSocketRevocationService = ({ database = pool } = {}) => {
    const socketsBySession = new Map();
    let listenerClient = null;
    let listenerHandlers = null;
    let listenerPromise = null;
    let ready = false;

    const unregister = (socket) => {
        const sessionId = Number(socket?.authSessionId);
        if (!Number.isInteger(sessionId)) return;
        const sockets = socketsBySession.get(sessionId);
        if (!sockets) return;
        sockets.delete(socket);
        if (sockets.size === 0) socketsBySession.delete(sessionId);
    };

    const disconnectAll = () => [...socketsBySession.keys()]
        .reduce((count, sessionId) => count + disconnectSession(sessionId), 0);

    const register = (socket) => {
        if (!ready) {
            socket.emit?.('session_revoked', { code: 'SOCKET_AUTH_UNAVAILABLE' });
            socket.disconnect?.(true);
            return false;
        }
        const sessionId = Number(socket?.authSessionId);
        if (!Number.isInteger(sessionId)) throw new TypeError('Socket auth session id is required.');
        const sockets = socketsBySession.get(sessionId) || new Set();
        sockets.add(socket);
        socketsBySession.set(sessionId, sockets);
        socket.once?.('disconnect', () => unregister(socket));
        return true;
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

    const detachListenerHandlers = (client, handlers) => {
        if (!client || !handlers) return;
        client.removeListener?.('notification', handlers.notification);
        client.removeListener?.('error', handlers.error);
        client.removeListener?.('end', handlers.end);
    };

    const markListenerUnavailable = (client) => {
        if (!client || listenerClient !== client) return;
        const handlers = listenerHandlers;
        ready = false;
        listenerClient = null;
        listenerHandlers = null;
        detachListenerHandlers(client, handlers);
        disconnectAll();
        client.release(true);
    };

    const start = async () => {
        if (ready) return;
        if (listenerPromise) return listenerPromise;
        const pending = (async () => {
            const client = await database.connect();
            const handlers = {
                notification: onNotification,
                error: () => markListenerUnavailable(client),
                end: () => markListenerUnavailable(client)
            };
            listenerClient = client;
            listenerHandlers = handlers;
            client.on('notification', handlers.notification);
            client.on('error', handlers.error);
            client.on('end', handlers.end);
            try {
                await client.query(`LISTEN ${CHANNEL}`);
                if (listenerClient !== client) {
                    throw new Error('Socket revocation listener became unavailable during startup.');
                }
                ready = true;
            } catch (error) {
                if (listenerClient === client) {
                    ready = false;
                    listenerClient = null;
                    listenerHandlers = null;
                    detachListenerHandlers(client, handlers);
                    client.release(true);
                }
                throw error;
            }
        })();
        listenerPromise = pending;
        try {
            return await pending;
        } finally {
            if (listenerPromise === pending) listenerPromise = null;
        }
    };

    const stop = async () => {
        const client = listenerClient;
        const handlers = listenerHandlers;
        ready = false;
        listenerClient = null;
        listenerHandlers = null;
        disconnectAll();
        if (!client) return;
        try {
            await client.query(`UNLISTEN ${CHANNEL}`);
        } finally {
            detachListenerHandlers(client, handlers);
            client.release();
        }
    };

    const isReady = () => ready;

    const guardSocketAuthentication = (_socket, next) => {
        if (ready) return next();
        const error = new Error('Socket authentication temporarily unavailable.');
        error.data = { code: 'SOCKET_AUTH_UNAVAILABLE' };
        return next(error);
    };

    return Object.freeze({
        disconnectSession,
        disconnectSessions,
        guardSocketAuthentication,
        isReady,
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
