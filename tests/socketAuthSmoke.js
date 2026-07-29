const assert = require('assert');
const { createAuthSessionFixture } = require('./helpers/createAuthSessionFixture');
const {
    allowedRoomsForUser,
    authenticateSocket,
    buildMessageTargetRoom,
    buildSafeMessagePayload,
    canJoinRoom,
    handleJoinRoom,
    revalidateSocketSession,
    verifySocketToken
} = require('../services/socketAuthService');
const { CHANNEL, createSocketRevocationService } = require('../services/socketRevocationService');

process.env.JWT_SECRET = 'socket-smoke-secret';

const authenticate = (socket) => new Promise((resolve) => authenticateSocket(socket, resolve));

(async () => {
    const fixture = createAuthSessionFixture();
    fixture.install();
    try {
        const customerSession = fixture.issue({ userId: 42, role: 'customer', principal: 'customer' });
        const adminSession = fixture.issue({ userId: 1, role: 'admin', principal: 'admin' });
        const user = await verifySocketToken(customerSession.token);
        const admin = await verifySocketToken(adminSession.token);

        const authenticatedSocket = { handshake: { auth: { token: customerSession.token } } };
        assert.strictEqual(await authenticate(authenticatedSocket), undefined);
        assert.strictEqual(authenticatedSocket.authSessionId, customerSession.id);
        assert.strictEqual((await authenticate({ handshake: { auth: {} } })).data.code, 'SOCKET_AUTH_REQUIRED');
        assert.strictEqual((await authenticate({ handshake: { auth: { token: 'bad-token' } } })).data.code, 'SOCKET_INVALID_TOKEN');

        assert.deepStrictEqual([...allowedRoomsForUser(user)].sort(), ['user_42']);
        assert.deepStrictEqual([...allowedRoomsForUser(admin)].sort(), ['admin_room', 'user_1']);
        assert.strictEqual(canJoinRoom(user, 'user_42'), true);
        assert.strictEqual(canJoinRoom(user, 'user_43'), false);
        assert.strictEqual(canJoinRoom(user, 'admin_room'), false);
        assert.strictEqual(canJoinRoom(admin, 'admin_room'), true);

        let joinedRoom = null;
        const mockSocket = {
            user,
            join: (room) => { joinedRoom = room; },
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

        fixture.revoke(customerSession);
        await assert.rejects(
            () => revalidateSocketSession(authenticatedSocket),
            (error) => error.data.code === 'SOCKET_SESSION_REVOKED'
        );

        const listeners = {};
        const queries = [];
        const fakeClient = {
            on(event, handler) { listeners[event] = handler; },
            removeListener(event) { delete listeners[event]; },
            async query(sql) { queries.push(sql); },
            release() { queries.push('RELEASE'); }
        };
        const revocation = createSocketRevocationService({
            database: { async connect() { return fakeClient; } }
        });
        await revocation.start();
        let disconnected = 0;
        const emitted = [];
        const liveSocket = {
            authSessionId: adminSession.id,
            once() {},
            emit(event, payload) { emitted.push({ event, payload }); },
            disconnect(force) { assert.strictEqual(force, true); disconnected += 1; }
        };
        revocation.register(liveSocket);
        listeners.notification({
            channel: CHANNEL,
            payload: JSON.stringify({ session_id: adminSession.id, user_id: 1, principal_type: 'admin' })
        });
        assert.strictEqual(disconnected, 1);
        assert.deepStrictEqual(emitted, [{ event: 'session_revoked', payload: { code: 'SESSION_REVOKED' } }]);
        assert.equal(JSON.stringify(emitted).includes(adminSession.token), false);
        await revocation.stop();
        assert(queries.some((sql) => sql === `LISTEN ${CHANNEL}`));
        assert(queries.some((sql) => sql === `UNLISTEN ${CHANNEL}`));

        await assert.rejects(() => verifySocketToken('bad-token'), (error) => error.data.code === 'SOCKET_INVALID_TOKEN');
        console.log('socketAuthSmoke: PASS handshake=3 rooms=7 revalidation=1 notify-disconnect=1');
    } finally {
        fixture.restore();
    }
})().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
