const jwt = require('jsonwebtoken');

const socketAuthError = (code, message) => {
    const err = new Error(message);
    err.data = { code };
    return err;
};

const extractSocketToken = (socket) => {
    const authToken = socket?.handshake?.auth?.token;
    if (typeof authToken === 'string' && authToken.trim()) {
        return authToken.trim();
    }

    const queryToken = socket?.handshake?.query?.token;
    if (typeof queryToken === 'string' && queryToken.trim()) {
        return queryToken.trim();
    }

    const authHeader = socket?.handshake?.headers?.authorization || '';
    if (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
        return authHeader.slice(7).trim() || null;
    }

    return null;
};

const verifySocketToken = (token) => {
    if (!process.env.JWT_SECRET) {
        throw socketAuthError('SOCKET_JWT_CONFIG_MISSING', 'Socket JWT config missing.');
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = {
        id: Number(decoded.id),
        role: decoded.role || 'customer'
    };

    if (!Number.isInteger(user.id)) {
        throw socketAuthError('SOCKET_INVALID_TOKEN', 'Invalid socket token.');
    }

    return user;
};

const normalizeRoom = (room) => String(room || '').trim();

const allowedRoomsForUser = (user) => {
    if (!user || !Number.isInteger(Number(user.id))) return new Set();

    const rooms = new Set([`user_${Number(user.id)}`]);
    if (user.role === 'admin') {
        rooms.add('admin_room');
    }
    return rooms;
};

const canJoinRoom = (user, room) => allowedRoomsForUser(user).has(normalizeRoom(room));

const authenticateSocket = (socket, next) => {
    try {
        const token = extractSocketToken(socket);
        if (!token) {
            return next(socketAuthError('SOCKET_AUTH_REQUIRED', 'Socket authentication required.'));
        }

        socket.user = verifySocketToken(token);
        return next();
    } catch (err) {
        if (err && err.data) return next(err);
        return next(socketAuthError('SOCKET_INVALID_TOKEN', 'Invalid or expired socket token.'));
    }
};

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
        return rejectSocketAction(
            socket,
            'ROOM_FORBIDDEN',
            'Bu odaya katılma yetkiniz yok.',
            ack
        );
    }

    socket.join(normalizedRoom);
    const payload = { ok: true, room: normalizedRoom };
    if (typeof ack === 'function') ack(payload);
    return payload;
};

const buildMessageTargetRoom = (user, data = {}) => {
    if (!user || !Number.isInteger(Number(user.id))) return null;

    if (user.role === 'admin') {
        if (data.receiver_role === 'admin' || data.receiver_id === 'admin') {
            return 'admin_room';
        }

        const receiverId = Number(data.receiver_id);
        return Number.isInteger(receiverId) ? `user_${receiverId}` : null;
    }

    const isAdminTarget =
        data.receiver_role === 'admin' ||
        data.receiver_id === 1 ||
        data.receiver_id === 'admin';

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
    verifySocketToken
};
