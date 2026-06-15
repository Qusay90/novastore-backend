const assert = require('assert');
const jwt = require('jsonwebtoken');
const {
    allowedRoomsForUser,
    authenticateSocket,
    buildMessageTargetRoom,
    buildSafeMessagePayload,
    canJoinRoom,
    handleJoinRoom,
    verifySocketToken
} = require('../services/socketAuthService');

process.env.JWT_SECRET = 'socket-smoke-secret';

const userToken = jwt.sign({ id: 42, role: 'customer' }, process.env.JWT_SECRET);
const adminToken = jwt.sign({ id: 1, role: 'admin' }, process.env.JWT_SECRET);

const user = verifySocketToken(userToken);
const admin = verifySocketToken(adminToken);

authenticateSocket({ handshake: { auth: { token: userToken } } }, (err) => {
    assert.strictEqual(err, undefined);
});

authenticateSocket({ handshake: { auth: {} } }, (err) => {
    assert.strictEqual(err.data.code, 'SOCKET_AUTH_REQUIRED');
});

authenticateSocket({ handshake: { auth: { token: 'bad-token' } } }, (err) => {
    assert.strictEqual(err.data.code, 'SOCKET_INVALID_TOKEN');
});

assert.deepStrictEqual([...allowedRoomsForUser(user)].sort(), ['user_42']);
assert.deepStrictEqual([...allowedRoomsForUser(admin)].sort(), ['admin_room', 'user_1']);

assert.strictEqual(canJoinRoom(user, 'user_42'), true);
assert.strictEqual(canJoinRoom(user, 'user_43'), false);
assert.strictEqual(canJoinRoom(user, 'admin_room'), false);
assert.strictEqual(canJoinRoom(admin, 'admin_room'), true);

let joinedRoom = null;
const mockSocket = {
    user,
    join: (room) => {
        joinedRoom = room;
    },
    emit: () => {}
};

assert.deepStrictEqual(handleJoinRoom(mockSocket, 'user_42'), { ok: true, room: 'user_42' });
assert.strictEqual(joinedRoom, 'user_42');

const forbidden = handleJoinRoom(mockSocket, 'admin_room');
assert.strictEqual(forbidden.ok, false);
assert.strictEqual(forbidden.code, 'ROOM_FORBIDDEN');

assert.strictEqual(buildMessageTargetRoom(user, { receiver_role: 'admin' }), 'admin_room');
assert.strictEqual(buildMessageTargetRoom(user, { receiver_id: 7 }), null);
assert.strictEqual(buildMessageTargetRoom(admin, { receiver_id: 42 }), 'user_42');

const safePayload = buildSafeMessagePayload(user, {
    sender_id: 999,
    sender_role: 'admin',
    receiver_role: 'admin',
    message: 'Merhaba'
});

assert.strictEqual(safePayload.sender_id, 42);
assert.strictEqual(safePayload.sender_role, 'customer');

assert.throws(() => verifySocketToken('bad-token'));

console.log('socket auth smoke ok');
