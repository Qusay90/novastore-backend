const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { EventEmitter } = require('node:events');
const { Client, Pool } = require('pg');
const { applyAuthSessionSchema } = require('../models/authSessionSchema');
const {
    CHANNEL,
    createSocketRevocationService
} = require('../services/socketRevocationService');

const root = path.join(__dirname, '..');

class FakeListenerClient extends EventEmitter {
    constructor({ listenError = null } = {}) {
        super();
        this.listenError = listenError;
        this.queries = [];
        this.releaseCalls = [];
    }

    async query(sql) {
        this.queries.push(sql);
        if (sql === `LISTEN ${CHANNEL}` && this.listenError) throw this.listenError;
    }

    release(destroy) {
        this.releaseCalls.push(destroy);
    }
}

const createFakeDatabase = (client) => ({
    connectCalls: 0,
    async connect() {
        this.connectCalls += 1;
        return client;
    }
});

const createTrackedSocket = ({ sessionId, rooms = [] }) => {
    const disconnectListeners = [];
    return {
        authSessionId: sessionId,
        connected: true,
        disconnectCalls: [],
        emitted: [],
        received: [],
        rooms: new Set(rooms),
        once(event, handler) {
            if (event === 'disconnect') disconnectListeners.push(handler);
        },
        emit(event, payload) {
            this.emitted.push({ event, payload });
        },
        disconnect(force) {
            this.disconnectCalls.push(force);
            if (!this.connected) return;
            this.connected = false;
            this.rooms.clear();
            disconnectListeners.splice(0).forEach((handler) => handler());
        }
    };
};

const deliverToRoom = (sockets, room, event, payload) => {
    for (const socket of sockets) {
        if (socket.connected && socket.rooms.has(room)) socket.received.push({ event, payload });
    }
};

const runReadinessGuard = (service) => new Promise((resolve) => {
    service.guardSocketAuthentication({}, resolve);
});

const waitFor = async (predicate, message, timeoutMs = 5000) => {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        if (predicate()) return;
        await new Promise((resolve) => setTimeout(resolve, 25));
    }
    assert.fail(message);
};

const runUnitLifecycle = async () => {
    const listener = new FakeListenerClient();
    const database = createFakeDatabase(listener);
    const service = createSocketRevocationService({ database });

    assert.equal(service.isReady(), false);
    assert.equal((await runReadinessGuard(service))?.data?.code, 'SOCKET_AUTH_UNAVAILABLE');
    await service.start();
    assert.equal(service.isReady(), true);
    assert.equal(await runReadinessGuard(service), undefined);
    assert.deepEqual(listener.queries, [`LISTEN ${CHANNEL}`]);

    const customer = createTrackedSocket({ sessionId: 101, rooms: ['user_42'] });
    const admin = createTrackedSocket({ sessionId: 102, rooms: ['admin_room', 'user_1'] });
    const legitimate = createTrackedSocket({ sessionId: 103, rooms: ['user_77'] });
    service.register(customer);
    service.register(admin);
    service.register(legitimate);

    deliverToRoom([customer, admin, legitimate], 'user_77', 'new_notification', { id: 1 });
    assert.equal(legitimate.received.length, 1, 'active socket must receive legitimate delivery');

    listener.emit('notification', {
        channel: CHANNEL,
        payload: JSON.stringify({ session_id: 101, user_id: 42, principal_type: 'customer' })
    });
    deliverToRoom([customer], 'user_42', 'receive_message', { id: 2 });
    assert.equal(customer.connected, false);
    assert.equal(customer.received.length, 0, 'revoked customer must not receive passive room delivery');

    listener.emit('error', new Error('synthetic listener loss'));
    assert.equal(service.isReady(), false);
    assert.equal(admin.connected, false, 'listener loss must disconnect admin sockets');
    assert.equal(legitimate.connected, false, 'listener loss must disconnect all authenticated sockets');
    assert.equal((await runReadinessGuard(service))?.data?.code, 'SOCKET_AUTH_UNAVAILABLE');
    assert.equal(listener.releaseCalls.length, 1);

    const endedClient = new FakeListenerClient();
    const endedService = createSocketRevocationService({ database: createFakeDatabase(endedClient) });
    await endedService.start();
    const endedSocket = createTrackedSocket({ sessionId: 104, rooms: ['admin_room'] });
    endedService.register(endedSocket);
    endedClient.emit('end');
    assert.equal(endedService.isReady(), false);
    assert.equal(endedSocket.connected, false, 'listener end must fail closed');
    assert.equal(endedClient.releaseCalls.length, 1);

    const stopClient = new FakeListenerClient();
    const stopService = createSocketRevocationService({ database: createFakeDatabase(stopClient) });
    await stopService.start();
    const stopSocket = createTrackedSocket({ sessionId: 105, rooms: ['user_88'] });
    stopService.register(stopSocket);
    await stopService.stop();
    assert.equal(stopService.isReady(), false);
    assert.equal(stopSocket.connected, false);
    assert.deepEqual(stopClient.queries, [`LISTEN ${CHANNEL}`, `UNLISTEN ${CHANNEL}`]);
    assert.equal(stopClient.releaseCalls.length, 1);

    const failedClient = new FakeListenerClient({ listenError: new Error('synthetic LISTEN failure') });
    const failedService = createSocketRevocationService({ database: createFakeDatabase(failedClient) });
    await assert.rejects(() => failedService.start(), /synthetic LISTEN failure/);
    assert.equal(failedService.isReady(), false);
    assert.equal((await runReadinessGuard(failedService))?.data?.code, 'SOCKET_AUTH_UNAVAILABLE');
    assert.equal(failedClient.releaseCalls.length, 1);

    let failedConnectCalls = 0;
    const connectFailureService = createSocketRevocationService({
        database: {
            async connect() {
                failedConnectCalls += 1;
                throw new Error('synthetic connect failure');
            }
        }
    });
    await assert.rejects(() => connectFailureService.start(), /synthetic connect failure/);
    await assert.rejects(() => connectFailureService.start(), /synthetic connect failure/);
    assert.equal(failedConnectCalls, 2, 'failed startup promise must not stay latched');
    assert.equal(connectFailureService.isReady(), false);

    const serverSource = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
    const readinessIndex = serverSource.indexOf('io.use(socketRevocationService.guardSocketAuthentication)');
    const authIndex = serverSource.indexOf('io.use(authenticateSocket)');
    const listenerStartIndex = serverSource.indexOf('await socketRevocationService.start()');
    const serverListenIndex = serverSource.indexOf('server.listen(PORT');
    assert(readinessIndex >= 0 && readinessIndex < authIndex, 'readiness gate must run before socket auth and room join');
    assert(listenerStartIndex >= 0 && listenerStartIndex < serverListenIndex, 'listener must be ready before HTTP/socket listen');
    assert.match(
        serverSource,
        /if \(!startupSafety\.localPreviewMode\) await socketRevocationService\.start\(\)/,
        'schema-init or DB-verification skip must not suppress the revocation listener'
    );
};

const insertSession = async (client, { userId, principal, marker }) => (
    await client.query(
        `INSERT INTO auth_sessions (jti_hash, user_id, principal_type, issued_at, expires_at)
         VALUES ($1, $2, $3, NOW(), NOW() + INTERVAL '1 hour')
         RETURNING id`,
        [marker.repeat(64), userId, principal]
    )
).rows[0].id;

const runDatabaseBoundary = async (connectionString) => {
    const parsed = new URL(connectionString);
    assert(['127.0.0.1', 'localhost'].includes(parsed.hostname));
    assert(/^novastore_rc9r_socket_[a-z0-9_]+$/i.test(parsed.pathname.slice(1)));

    const listenerPool = new Pool({ connectionString, ssl: false, max: 2 });
    const setupClient = new Client({ connectionString, ssl: false });
    const revokerClient = new Client({ connectionString, ssl: false });
    const service = createSocketRevocationService({ database: listenerPool });

    try {
        await setupClient.connect();
        await revokerClient.connect();
        await setupClient.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public');
        await setupClient.query(`
            CREATE TABLE users (
                id SERIAL PRIMARY KEY,
                email TEXT UNIQUE NOT NULL,
                password TEXT NOT NULL,
                role VARCHAR(20) NOT NULL DEFAULT 'customer'
            )
        `);
        await applyAuthSessionSchema(setupClient);

        const users = {};
        for (const [key, role] of [
            ['explicit', 'customer'],
            ['password', 'customer'],
            ['role', 'admin'],
            ['disabled', 'admin'],
            ['legitimate', 'customer']
        ]) {
            users[key] = Number((await setupClient.query(
                `INSERT INTO users (email, password, role)
                 VALUES ($1, 'initial-password', $2)
                 RETURNING id`,
                [`${key}@rc9r.example.test`, role]
            )).rows[0].id);
        }

        const sessionIds = {
            explicit: await insertSession(setupClient, {
                userId: users.explicit, principal: 'customer', marker: 'a'
            }),
            password: await insertSession(setupClient, {
                userId: users.password, principal: 'customer', marker: 'b'
            }),
            role: await insertSession(setupClient, {
                userId: users.role, principal: 'admin', marker: 'c'
            }),
            disabled: await insertSession(setupClient, {
                userId: users.disabled, principal: 'admin', marker: 'd'
            }),
            legitimate: await insertSession(setupClient, {
                userId: users.legitimate, principal: 'customer', marker: 'e'
            })
        };

        await service.start();
        const sockets = {
            explicit: createTrackedSocket({
                sessionId: sessionIds.explicit, rooms: [`user_${users.explicit}`]
            }),
            password: createTrackedSocket({
                sessionId: sessionIds.password, rooms: [`user_${users.password}`]
            }),
            role: createTrackedSocket({
                sessionId: sessionIds.role, rooms: ['admin_room', `user_${users.role}`]
            }),
            disabled: createTrackedSocket({
                sessionId: sessionIds.disabled, rooms: ['admin_room', `user_${users.disabled}`]
            }),
            legitimate: createTrackedSocket({
                sessionId: sessionIds.legitimate, rooms: [`user_${users.legitimate}`]
            })
        };
        Object.values(sockets).forEach((socket) => service.register(socket));

        deliverToRoom(Object.values(sockets), `user_${users.legitimate}`, 'receive_message', { id: 1 });
        assert.equal(sockets.legitimate.received.length, 1);

        await revokerClient.query(
            "UPDATE auth_sessions SET revoked_at = NOW(), revoke_reason = 'rc9r-explicit' WHERE id = $1",
            [sessionIds.explicit]
        );
        await waitFor(() => !sockets.explicit.connected, 'cross-client explicit revoke was not consumed');

        await revokerClient.query("UPDATE users SET password = 'changed-password' WHERE id = $1", [users.password]);
        await waitFor(() => !sockets.password.connected, 'password-change revoke was not consumed');

        await revokerClient.query("UPDATE users SET role = 'customer' WHERE id = $1", [users.role]);
        await waitFor(() => !sockets.role.connected, 'admin role-change revoke was not consumed');

        await revokerClient.query('UPDATE users SET auth_enabled = FALSE WHERE id = $1', [users.disabled]);
        await waitFor(() => !sockets.disabled.connected, 'auth_enabled revoke was not consumed');

        deliverToRoom(Object.values(sockets), `user_${users.explicit}`, 'receive_message', { id: 2 });
        deliverToRoom(Object.values(sockets), 'admin_room', 'new_notification', { id: 3 });
        assert.equal(sockets.explicit.received.length, 0, 'revoked customer received passive delivery');
        assert.equal(sockets.role.received.length, 0, 'demoted admin received passive admin-room delivery');
        assert.equal(sockets.disabled.received.length, 0, 'disabled admin received passive admin-room delivery');
        deliverToRoom(Object.values(sockets), `user_${users.legitimate}`, 'receive_message', { id: 4 });
        assert.equal(sockets.legitimate.received.length, 2, 'unaffected active socket lost legitimate delivery');
    } finally {
        await service.stop().catch(() => {});
        await revokerClient.end().catch(() => {});
        await setupClient.end().catch(() => {});
        await listenerPool.end().catch(() => {});
    }
};

(async () => {
    await runUnitLifecycle();
    const connectionString = String(process.env.P4B_AUTH_DATABASE_URL || '').trim();
    if (connectionString) {
        await runDatabaseBoundary(connectionString);
        console.log('socketRevocationLifecycleSmoke: PASS unit=3 db-notify=4 passive-user-admin=3');
    } else {
        console.log('socketRevocationLifecycleSmoke: PASS unit=3 db-notify=SKIPPED_NO_LOCAL_DB');
    }
})().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
