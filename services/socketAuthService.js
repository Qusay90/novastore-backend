const authSessionService = require('./authSessionService');

const socketAuthError = (code, message) => {
    const err = new Error(message);
    err.data = { code };
    return err;
};

const extractSocketToken = (socket) => {
    const authToken = socket?.handshake?.auth?.token;
    if (typeof authToken === 'string' && authToken.trim()) return authToken.trim();

    const queryToken = socket?.handshake?.query?.token;
    if (typeof queryToken === 'string' && queryToken.trim()) return queryToken.trim();

    const authHeader = socket?.handshake?.headers?.authorization || '';
    if (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
        return authHeader.slice(7).trim() || null;
    }
    return null;
};

const verifySocketToken = async (token) => {
    try {
        const auth = await authSessionService.verifyAccessToken(token);
        return Object.freeze({
            ...auth.user,
            sessionId: auth.session.id,
            expiresAt: auth.session.expiresAt
        });
    } catch (error) {
        if (error instanceof authSessionService.AuthSessionError && error.statusCode === 503) {
            throw socketAuthError('SOCKET_AUTH_UNAVAILABLE', 'Socket authentication temporarily unavailable.');
        }
        if (error instanceof authSessionService.AuthSessionError && error.statusCode === 500) {
            throw socketAuthError('SOCKET_JWT_CONFIG_MISSING', 'Socket security configuration missing.');
        }
        throw socketAuthError('SOCKET_INVALID_TOKEN', 'Invalid or expired socket token.');
    }
};

const authenticateSocket = async (socket, next) => {
    try {
        const token = extractSocketToken(socket);
        if (!token) return next(socketAuthError('SOCKET_AUTH_REQUIRED', 'Socket authentication required.'));
        const user = await verifySocketToken(token);
        socket.user = Object.freeze({ id: user.id, role: user.role, principal: user.principal });
        socket.authSessionId = user.sessionId;
        return next();
    } catch (error) {
        return next(error?.data ? error : socketAuthError('SOCKET_INVALID_TOKEN', 'Invalid or expired socket token.'));
    }
};

const revalidateSocketSession = async (socket) => {
    try {
        const user = await authSessionService.revalidateSession({
            sessionId: socket?.authSessionId,
            userId: socket?.user?.id,
            principal: socket?.user?.principal
        });
        socket.user = Object.freeze({ id: user.id, role: user.role, principal: user.principal });
        return socket.user;
    } catch (error) {
        if (error instanceof authSessionService.AuthSessionError && error.statusCode === 503) {
            throw socketAuthError('SOCKET_AUTH_UNAVAILABLE', 'Socket authentication temporarily unavailable.');
        }
        throw socketAuthError('SOCKET_SESSION_REVOKED', 'Socket session is no longer active.');
    }
};

const normalizeRoom = (room) => String(room || '').trim();

const allowedRoomsForUser = (user) => {
    if (!user || !Number.isInteger(Number(user.id))) return new Set();
    const rooms = new Set([`user_${Number(user.id)}`]);
    if (user.role === 'admin' && user.principal === 'admin') rooms.add('admin_room');
    return rooms;
};

const canJoinRoom = (user, room) => allowedRoomsForUser(user).has(normalizeRoom(room));

const autoJoinAllowedRooms = (socket) => {
    const joinedRooms = [];
    allowedRoomsForUser(socket.user).forEach((room) => {
        socket.join(room);
        joinedRooms.push(room);
    });
    return joinedRooms;
};

const rejectSocketAction = (socket, code, message, ack) => {
    const payload = { ok: false, code, message };
    if (typeof ack === 'function') ack(payload);
    socket.emit('socket_error', payload);
    return payload;
};

const handleJoinRoom = (socket, room, ack) => {
    const normalizedRoom = normalizeRoom(room);
    if (!canJoinRoom(socket.user, normalizedRoom)) {
        return rejectSocketAction(socket, 'ROOM_FORBIDDEN', 'Bu odaya katılma yetkiniz yok.', ack);
    }

    socket.join(normalizedRoom);
    const payload = { ok: true, room: normalizedRoom };
    if (typeof ack === 'function') ack(payload);
    return payload;
};

const buildMessageTargetRoom = (user, data = {}) => {
    if (!user || !Number.isInteger(Number(user.id))) return null;

    if (user.role === 'admin' && user.principal === 'admin') {
        if (data.receiver_role === 'admin' || data.receiver_id === 'admin') return 'admin_room';
        const receiverId = Number(data.receiver_id);
        return Number.isInteger(receiverId) ? `user_${receiverId}` : null;
    }

    const isAdminTarget = data.receiver_role === 'admin'
        || data.receiver_id === 1
        || data.receiver_id === 'admin';
    return isAdminTarget ? 'admin_room' : null;
};

const buildSafeMessagePayload = (user, data = {}) => ({
    ...data,
    sender_id: Number(user.id),
    sender_role: user.role || 'customer'
});

module.exports = {
    allowedRoomsForUser,
    authenticateSocket,
    autoJoinAllowedRooms,
    buildMessageTargetRoom,
    buildSafeMessagePayload,
    canJoinRoom,
    extractSocketToken,
    handleJoinRoom,
    revalidateSocketSession,
    verifySocketToken
};
