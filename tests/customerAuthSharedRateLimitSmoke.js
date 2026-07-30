const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const express = require('express');

process.env.NODE_ENV = 'test';
process.env.PUBLIC_AUTH_RATE_LIMIT_SECRET = 'customer-auth-rate-limit-local-test-secret-32-bytes';
process.env.NOVASTORE_SAFE_LOCAL_BACKEND = 'true';
process.env.NOVASTORE_ALLOW_REMOTE_DB = 'false';
process.env.SKIP_SCHEMA_INIT = 'true';
process.env.NOVASTORE_ALLOW_SCHEMA_INIT = 'false';
process.env.DATABASE_URL =
    'postgresql://novastore_test:novastore_test_only@127.0.0.1:55432/novastore_rate_limit_test';
process.env.DB_HOST = '127.0.0.1';
process.env.DB_PORT = '55432';
process.env.DB_NAME = 'novastore_rate_limit_test';
process.env.DB_USER = 'novastore_test';
process.env.DB_PASSWORD = 'novastore_test_only';
process.env.DB_SSL = 'false';
process.env.SUPABASE_USE_POOLER = 'false';

const {
    RATE_LIMIT_LUA,
    createRedisCommandExecutor,
    createRedisRateLimitStore,
    createSharedRateLimitStore,
    encodeCommand,
    parseRateLimitStoreTimeoutMs,
    parseResp
} = require('../services/sharedRateLimitStore');
const {
    AUTH_RATE_LIMIT_SCOPES,
    adminForgotPasswordRateLimit,
    adminLoginRateLimit,
    createCustomerAuthRateLimit,
    createCustomerAuthRateLimiters,
    customerLoginRateLimit,
    customerPasswordResetCompleteRateLimit,
    customerPasswordResetRequestRateLimit,
    customerPasswordResetVerifyRateLimit,
    hashRateLimitKey
} = require('../middlewares/customerAuthRateLimit');
const {
    configureTrustedProxy,
    resolveSensitiveRequestIp,
    resolveTrustedProxy
} = require('../config/trustedProxy');
const authRoutes = require('../routes/authRoutes');
const userRoutes = require('../routes/userRoutes');

class DeterministicRedis {
    constructor() {
        this.now = 1_000;
        this.entries = new Map();
        this.keysSeen = [];
        this.fail = false;
    }

    execute = async (commands) => {
        if (this.fail) throw Object.assign(new Error('offline'), {
            code: 'PUBLIC_AUTH_RATE_LIMIT_STORE_UNAVAILABLE'
        });
        assert.equal(commands.length, 1);
        const [name, script, keyCount, ipKey, identifierKey, rawWindowMs] = commands[0];
        assert.equal(name, 'EVAL');
        assert.equal(script, RATE_LIMIT_LUA);
        assert.equal(keyCount, 2);
        const windowMs = Number(rawWindowMs);
        this.keysSeen.push(ipKey, identifierKey);

        const take = (key) => {
            const current = this.entries.get(key);
            if (!current || current.resetAt <= this.now) {
                const entry = { count: 1, resetAt: this.now + windowMs };
                this.entries.set(key, entry);
                return entry;
            }
            current.count += 1;
            return current;
        };
        const ip = take(ipKey);
        const identifier = take(identifierKey);
        return [
            ip.count,
            identifier.count,
            ip.resetAt - this.now,
            identifier.resetAt - this.now
        ];
    };

    advance(ms) {
        this.now += ms;
    }
}

const createResponse = () => ({
    statusCode: 200,
    headers: {},
    payload: null,
    set(name, value) {
        this.headers[name] = value;
        return this;
    },
    status(code) {
        this.statusCode = code;
        return this;
    },
    json(payload) {
        this.payload = payload;
        return this;
    }
});

const invoke = async (limiter, req) => {
    const response = createResponse();
    let nextCalls = 0;
    const remoteAddress = req.socket?.remoteAddress || req.ip;
    const request = {
        ...req,
        headers: req.headers || {},
        socket: req.socket || { remoteAddress },
        connection: req.connection || { remoteAddress }
    };
    await limiter(request, response, () => { nextCalls += 1; });
    return { response, nextCalls };
};

const createStore = (redis, prefix) => createRedisRateLimitStore({
    url: 'redis://local.test:6379',
    prefix,
    executor: redis.execute
});

const syntheticRequestIp = ({ env, forwardedFor, remoteAddress }) => {
    const app = express();
    configureTrustedProxy(app, { env });
    const req = Object.create(app.request);
    req.app = app;
    req.headers = { 'x-forwarded-for': forwardedFor };
    req.socket = { remoteAddress };
    req.connection = req.socket;
    return req.ip;
};

const routeHandlers = (router, routePath) => {
    const layer = router.stack.find((entry) => entry.route?.path === routePath);
    assert(layer, `route missing: ${routePath}`);
    return layer.route.stack.map((entry) => entry.handle);
};

const NO_FAKE_RESPONSE = Symbol('NO_FAKE_RESPONSE');

const encodeFakeResponse = (value) => {
    if (value instanceof Error) return Buffer.from(`-${value.message}\r\n`);
    if (Array.isArray(value)) {
        return Buffer.concat([
            Buffer.from(`*${value.length}\r\n`),
            ...value.map(encodeFakeResponse)
        ]);
    }
    if (value === null) return Buffer.from('$-1\r\n');
    if (Number.isInteger(value)) return Buffer.from(`:${value}\r\n`);
    const text = String(value);
    return Buffer.concat([
        Buffer.from(`$${Buffer.byteLength(text, 'utf8')}\r\n`),
        Buffer.from(text, 'utf8'),
        Buffer.from('\r\n')
    ]);
};

const defaultFakeRedisReply = (command) => {
    switch (command[0]) {
        case 'AUTH':
        case 'SELECT':
            return 'OK';
        case 'PING':
            return 'PONG';
        case 'ECHO':
            return command[1];
        case 'EVAL': {
            const windowMs = Number(command.at(-1));
            return [1, 1, windowMs, windowMs];
        }
        default:
            throw new Error(`unexpected fake Redis command: ${command[0]}`);
    }
};

class FakeRedisSocket extends EventEmitter {
    constructor({ protocol, reply = defaultFakeRedisReply }) {
        super();
        this.commands = [];
        this.destroyCalls = 0;
        this.destroyed = false;
        this.protocol = protocol;
        this.reply = reply;
        this.writes = [];
    }

    setNoDelay() {}

    write(payload) {
        if (this.destroyed) throw new Error('fake socket already destroyed');
        const bytes = Buffer.from(payload);
        this.writes.push(bytes);
        let cursor = 0;
        while (cursor < bytes.length) {
            const parsed = parseResp(bytes, cursor);
            assert(parsed, 'fake socket must receive a complete RESP command');
            assert(Array.isArray(parsed.value));
            const command = parsed.value;
            this.commands.push(command);
            cursor = parsed.offset;
            const response = this.reply(command, this);
            if (response !== NO_FAKE_RESPONSE) {
                queueMicrotask(() => {
                    if (!this.destroyed) this.emit('data', encodeFakeResponse(response));
                });
            }
        }
        return true;
    }

    ready() {
        this.emit(this.protocol === 'rediss:' ? 'secureConnect' : 'connect');
    }

    destroy() {
        if (this.destroyed) return;
        this.destroyed = true;
        this.destroyCalls += 1;
        queueMicrotask(() => this.emit('close'));
    }
}

const createFakeTimerHarness = () => {
    const active = new Map();
    let sequence = 0;
    return {
        activeCount: () => active.size,
        clearTimeoutFn: (handle) => {
            active.delete(handle.id);
        },
        fireAll: () => {
            const callbacks = [...active.values()];
            active.clear();
            for (const { callback } of callbacks) callback();
        },
        setTimeoutFn: (callback, delayMs) => {
            const handle = {
                delayMs,
                id: sequence += 1,
                unref() {}
            };
            active.set(handle.id, { callback, handle });
            return handle;
        }
    };
};

const createFakeSocketFactory = ({
    replyForSocket = () => defaultFakeRedisReply
} = {}) => {
    const calls = [];
    const sockets = [];
    const factory = (options, protocol) => {
        const socket = new FakeRedisSocket({
            protocol,
            reply: replyForSocket(sockets.length)
        });
        calls.push({ options, protocol });
        sockets.push(socket);
        return socket;
    };
    return { calls, factory, sockets };
};

const runSharedStoreSocketMatrix = async () => {
    const cases = [
        ['strict timeout parser', async () => {
            assert.equal(parseRateLimitStoreTimeoutMs(), 1500);
            assert.equal(parseRateLimitStoreTimeoutMs(''), 1500);
            assert.equal(parseRateLimitStoreTimeoutMs(100), 100);
            assert.equal(parseRateLimitStoreTimeoutMs('15000'), 15000);
            for (const invalid of [99, 15001, -1, '100.5', '1e3', 'invalid']) {
                assert.throws(
                    () => parseRateLimitStoreTimeoutMs(invalid),
                    (error) => (
                        error.code === 'PUBLIC_AUTH_RATE_LIMIT_CONFIG_INVALID'
                        && error.message === 'PUBLIC_AUTH_RATE_LIMIT_STORE_TIMEOUT_INVALID'
                    )
                );
            }
            assert.throws(
                () => createSharedRateLimitStore({
                    env: {
                        NODE_ENV: 'production',
                        PUBLIC_AUTH_RATE_LIMIT_REDIS_URL: 'redis://local.test:6379',
                        PUBLIC_AUTH_RATE_LIMIT_STORE_TIMEOUT_MS: '99'
                    },
                    executor: async () => [1, 1, 1000, 1000]
                }),
                /PUBLIC_AUTH_RATE_LIMIT_STORE_TIMEOUT_INVALID/
            );
            let malformedUrlFactoryCalls = 0;
            assert.throws(
                () => createRedisCommandExecutor({
                    socketFactory: () => {
                        malformedUrlFactoryCalls += 1;
                        throw new Error('must not create a socket');
                    },
                    url: 'redis://user:%E0%A4%A@local.test:6379'
                }),
                (error) => (
                    error.code === 'PUBLIC_AUTH_RATE_LIMIT_CONFIG_INVALID'
                    && error.message === 'PUBLIC_AUTH_RATE_LIMIT_REDIS_URL_INVALID'
                )
            );
            assert.equal(malformedUrlFactoryCalls, 0);
        }],
        ['rediss insecure override fails before factory', async () => {
            let socketFactoryCalls = 0;
            assert.throws(
                () => createRedisCommandExecutor({
                    env: { NODE_TLS_REJECT_UNAUTHORIZED: '0' },
                    socketFactory: () => {
                        socketFactoryCalls += 1;
                        throw new Error('must not create a socket');
                    },
                    url: 'rediss://local.test:6380'
                }),
                (error) => (
                    error.code === 'PUBLIC_AUTH_RATE_LIMIT_CONFIG_INVALID'
                    && error.message === 'PUBLIC_AUTH_RATE_LIMIT_TLS_INSECURE'
                )
            );
            assert.equal(socketFactoryCalls, 0);
            assert.throws(
                () => createSharedRateLimitStore({
                    env: {
                        NODE_ENV: 'production',
                        NODE_TLS_REJECT_UNAUTHORIZED: '0',
                        PUBLIC_AUTH_RATE_LIMIT_REDIS_URL: 'rediss://local.test:6380'
                    },
                    executor: async () => [1, 1, 1000, 1000]
                }),
                /PUBLIC_AUTH_RATE_LIMIT_TLS_INSECURE/
            );
        }],
        ['rediss waits for secureConnect and enforces verification', async () => {
            const fake = createFakeSocketFactory();
            const timers = createFakeTimerHarness();
            const executor = createRedisCommandExecutor({
                clearTimeoutFn: timers.clearTimeoutFn,
                setTimeoutFn: timers.setTimeoutFn,
                socketFactory: fake.factory,
                url: 'rediss://local.test:6380'
            });
            const response = executor([['PING']]);
            assert.equal(fake.sockets.length, 1);
            fake.sockets[0].emit('connect');
            await Promise.resolve();
            assert.equal(fake.sockets[0].commands.length, 0);
            assert.deepEqual(fake.calls[0], {
                options: {
                    host: 'local.test',
                    port: 6380,
                    rejectUnauthorized: true,
                    servername: 'local.test'
                },
                protocol: 'rediss:'
            });
            fake.sockets[0].ready();
            assert.equal(await response, 'PONG');
            assert.equal(timers.activeCount(), 0);
            executor.close();

            const ipFake = createFakeSocketFactory();
            const ipTimers = createFakeTimerHarness();
            const ipExecutor = createRedisCommandExecutor({
                clearTimeoutFn: ipTimers.clearTimeoutFn,
                setTimeoutFn: ipTimers.setTimeoutFn,
                socketFactory: ipFake.factory,
                url: 'rediss://127.0.0.1:6380'
            });
            const ipResponse = ipExecutor([['PING']]);
            assert.deepEqual(ipFake.calls[0], {
                options: {
                    host: '127.0.0.1',
                    port: 6380,
                    rejectUnauthorized: true
                },
                protocol: 'rediss:'
            });
            ipFake.sockets[0].ready();
            assert.equal(await ipResponse, 'PONG');
            ipExecutor.close();
        }],
        ['persistent socket, one handshake, FIFO replies, reconnect handshake', async () => {
            const fake = createFakeSocketFactory();
            const timers = createFakeTimerHarness();
            const executor = createRedisCommandExecutor({
                clearTimeoutFn: timers.clearTimeoutFn,
                setTimeoutFn: timers.setTimeoutFn,
                socketFactory: fake.factory,
                url: 'redis://test-user:test-pass@local.test:6379/2'
            });
            const first = executor([['ECHO', 'first']]);
            const second = executor([['ECHO', 'second']]);
            assert.equal(fake.sockets.length, 1);
            fake.sockets[0].ready();
            assert.deepEqual(await Promise.all([first, second]), ['first', 'second']);
            assert.deepEqual(
                fake.sockets[0].commands,
                [
                    ['AUTH', 'test-user', 'test-pass'],
                    ['SELECT', '2'],
                    ['ECHO', 'first'],
                    ['ECHO', 'second']
                ]
            );
            assert.equal(
                await executor([['ECHO', 'third']]),
                'third'
            );
            assert.equal(fake.sockets.length, 1);
            fake.sockets[0].emit('error', new Error('idle connection lost'));
            const reconnected = executor([['ECHO', 'fourth']]);
            assert.equal(fake.sockets.length, 2);
            fake.sockets[1].ready();
            assert.equal(await reconnected, 'fourth');
            assert.deepEqual(
                fake.sockets[1].commands,
                [
                    ['AUTH', 'test-user', 'test-pass'],
                    ['SELECT', '2'],
                    ['ECHO', 'fourth']
                ]
            );
            assert.equal(timers.activeCount(), 0);
            executor.close();
        }],
        ['successful operation clears explicit timers', async () => {
            const fake = createFakeSocketFactory();
            const timers = createFakeTimerHarness();
            const executor = createRedisCommandExecutor({
                clearTimeoutFn: timers.clearTimeoutFn,
                setTimeoutFn: timers.setTimeoutFn,
                socketFactory: fake.factory,
                timeoutMs: 100,
                url: 'redis://local.test:6379'
            });
            const pending = executor([['PING']]);
            fake.sockets[0].ready();
            assert.equal(await pending, 'PONG');
            assert.equal(timers.activeCount(), 0);
            timers.fireAll();
            assert.equal(fake.sockets[0].destroyCalls, 0);
            executor.close();
            assert.equal(fake.sockets[0].destroyCalls, 1);
        }],
        ['ambiguous in-flight failure is not retried and stale events are isolated', async () => {
            const fake = createFakeSocketFactory({
                replyForSocket: (index) => (
                    index === 0
                        ? () => NO_FAKE_RESPONSE
                        : defaultFakeRedisReply
                )
            });
            const timers = createFakeTimerHarness();
            const executor = createRedisCommandExecutor({
                clearTimeoutFn: timers.clearTimeoutFn,
                setTimeoutFn: timers.setTimeoutFn,
                socketFactory: fake.factory,
                url: 'redis://local.test:6379'
            });
            const ambiguous = executor([['ECHO', 'ambiguous']]);
            fake.sockets[0].ready();
            await Promise.resolve();
            assert.equal(fake.sockets[0].commands.length, 1);
            fake.sockets[0].emit('error', new Error('connection reset after write'));
            await assert.rejects(
                ambiguous,
                (error) => error.code === 'PUBLIC_AUTH_RATE_LIMIT_STORE_UNAVAILABLE'
            );
            assert.equal(fake.sockets.length, 1);
            assert.deepEqual(fake.sockets[0].commands, [['ECHO', 'ambiguous']]);

            const independent = executor([['ECHO', 'independent']]);
            assert.equal(fake.sockets.length, 2);
            fake.sockets[1].ready();
            fake.sockets[0].emit('data', encodeFakeResponse('stale'));
            fake.sockets[0].emit('error', new Error('stale socket error'));
            assert.equal(await independent, 'independent');
            assert.deepEqual(fake.sockets[1].commands, [['ECHO', 'independent']]);
            executor.close();
        }],
        ['operation timeout fails closed and next call reconnects', async () => {
            const fake = createFakeSocketFactory({
                replyForSocket: (index) => (
                    index === 0
                        ? () => NO_FAKE_RESPONSE
                        : defaultFakeRedisReply
                )
            });
            const timers = createFakeTimerHarness();
            const executor = createRedisCommandExecutor({
                clearTimeoutFn: timers.clearTimeoutFn,
                setTimeoutFn: timers.setTimeoutFn,
                socketFactory: fake.factory,
                timeoutMs: 100,
                url: 'redis://local.test:6379'
            });
            const timedOut = executor([['PING']]);
            fake.sockets[0].ready();
            await Promise.resolve();
            assert.equal(timers.activeCount(), 1);
            timers.fireAll();
            await assert.rejects(
                timedOut,
                (error) => (
                    error.code === 'PUBLIC_AUTH_RATE_LIMIT_STORE_UNAVAILABLE'
                    && error.message === 'PUBLIC_AUTH_RATE_LIMIT_STORE_TIMEOUT'
                )
            );
            assert.equal(fake.sockets[0].commands.length, 1);
            const independent = executor([['PING']]);
            assert.equal(fake.sockets.length, 2);
            fake.sockets[1].ready();
            assert.equal(await independent, 'PONG');
            assert.equal(timers.activeCount(), 0);
            executor.close();
        }],
        ['fragmented replies succeed and malformed RESP fails closed', async () => {
            const fragmentedFake = createFakeSocketFactory({
                replyForSocket: () => () => NO_FAKE_RESPONSE
            });
            const fragmentedTimers = createFakeTimerHarness();
            const fragmentedExecutor = createRedisCommandExecutor({
                clearTimeoutFn: fragmentedTimers.clearTimeoutFn,
                setTimeoutFn: fragmentedTimers.setTimeoutFn,
                socketFactory: fragmentedFake.factory,
                url: 'redis://local.test:6379'
            });
            let fragmentedSettled = false;
            const fragmented = fragmentedExecutor([['PING']]).then((value) => {
                fragmentedSettled = true;
                return value;
            });
            fragmentedFake.sockets[0].ready();
            await Promise.resolve();
            fragmentedFake.sockets[0].emit('data', Buffer.from('$4\r\nPO'));
            await Promise.resolve();
            assert.equal(fragmentedSettled, false);
            fragmentedFake.sockets[0].emit('data', Buffer.from('NG\r\n'));
            assert.equal(await fragmented, 'PONG');
            assert.equal(fragmentedTimers.activeCount(), 0);
            fragmentedExecutor.close();

            for (const invalidResponse of [
                Buffer.from('$4\r\nPONGxx'),
                encodeFakeResponse([new Error('ERR nested response')])
            ]) {
                const invalidFake = createFakeSocketFactory({
                    replyForSocket: () => () => NO_FAKE_RESPONSE
                });
                const invalidTimers = createFakeTimerHarness();
                const invalidExecutor = createRedisCommandExecutor({
                    clearTimeoutFn: invalidTimers.clearTimeoutFn,
                    setTimeoutFn: invalidTimers.setTimeoutFn,
                    socketFactory: invalidFake.factory,
                    url: 'redis://local.test:6379'
                });
                const invalid = invalidExecutor([['PING']]);
                invalidFake.sockets[0].ready();
                await Promise.resolve();
                invalidFake.sockets[0].emit('data', invalidResponse);
                await assert.rejects(
                    invalid,
                    (error) => error.code === 'PUBLIC_AUTH_RATE_LIMIT_STORE_UNAVAILABLE'
                );
                assert.equal(invalidFake.sockets[0].destroyCalls, 1);
                assert.equal(invalidTimers.activeCount(), 0);
            }
        }],
        ['close rejects active FIFO work and remains idempotent', async () => {
            const fake = createFakeSocketFactory({
                replyForSocket: () => () => NO_FAKE_RESPONSE
            });
            const timers = createFakeTimerHarness();
            const executor = createRedisCommandExecutor({
                clearTimeoutFn: timers.clearTimeoutFn,
                setTimeoutFn: timers.setTimeoutFn,
                socketFactory: fake.factory,
                url: 'redis://local.test:6379'
            });
            assert.equal(executor.close, executor.dispose);
            const first = executor([['ECHO', 'first']]);
            const second = executor([['ECHO', 'second']]);
            fake.sockets[0].ready();
            await Promise.resolve();
            await Promise.resolve();
            assert.deepEqual(
                fake.sockets[0].commands,
                [['ECHO', 'first'], ['ECHO', 'second']]
            );
            executor.close();
            executor.dispose();
            await Promise.all([
                assert.rejects(
                    first,
                    (error) => error.message === 'PUBLIC_AUTH_RATE_LIMIT_STORE_CLOSED'
                ),
                assert.rejects(
                    second,
                    (error) => error.message === 'PUBLIC_AUTH_RATE_LIMIT_STORE_CLOSED'
                )
            ]);
            assert.equal(fake.sockets[0].destroyCalls, 1);
            assert.equal(timers.activeCount(), 0);
            await assert.rejects(
                executor([['PING']]),
                (error) => error.code === 'PUBLIC_AUTH_RATE_LIMIT_STORE_UNAVAILABLE'
            );
        }],
        ['executor close and dispose are idempotent', async () => {
            const fake = createFakeSocketFactory();
            const timers = createFakeTimerHarness();
            const executor = createRedisCommandExecutor({
                clearTimeoutFn: timers.clearTimeoutFn,
                setTimeoutFn: timers.setTimeoutFn,
                socketFactory: fake.factory,
                url: 'redis://local.test:6379'
            });
            const pending = executor([['PING']]);
            fake.sockets[0].ready();
            assert.equal(await pending, 'PONG');
            executor.close();
            executor.close();
            executor.dispose();
            assert.equal(fake.sockets[0].destroyCalls, 1);
            assert.equal(timers.activeCount(), 0);
            await assert.rejects(
                executor([['PING']]),
                (error) => error.code === 'PUBLIC_AUTH_RATE_LIMIT_STORE_UNAVAILABLE'
            );
            assert.equal(fake.sockets.length, 1);
        }],
        ['store rejects semantically invalid atomic responses', async () => {
            const invalidResponses = [
                [0, 1, 60_000, 60_000],
                [1, 1, -1, 60_000],
                [1.5, 1, 60_000, 60_000],
                [1, 1, Number.MAX_SAFE_INTEGER + 1, 60_000]
            ];
            for (const response of invalidResponses) {
                const store = createRedisRateLimitStore({
                    executor: async () => response,
                    url: 'redis://local.test:6379'
                });
                await assert.rejects(
                    store.consume({
                        identifierKey: 'identifier-hash',
                        ipKey: 'ip-hash',
                        windowMs: 60_000
                    }),
                    (error) => error.code === 'PUBLIC_AUTH_RATE_LIMIT_STORE_UNAVAILABLE'
                );
            }
        }],
        ['store close is idempotent and preserves atomic EVAL contract', async () => {
            const fake = createFakeSocketFactory();
            const timers = createFakeTimerHarness();
            const store = createRedisRateLimitStore({
                clearTimeoutFn: timers.clearTimeoutFn,
                setTimeoutFn: timers.setTimeoutFn,
                socketFactory: fake.factory,
                url: 'redis://local.test:6379'
            });
            const consumed = store.consume({
                identifierKey: 'identifier-hash',
                ipKey: 'ip-hash',
                windowMs: 60_000
            });
            fake.sockets[0].ready();
            assert.deepEqual(await consumed, {
                identifierCount: 1,
                ipCount: 1,
                retryAfterMs: 60_000
            });
            assert.equal(fake.sockets[0].commands.length, 1);
            assert.deepEqual(
                fake.sockets[0].commands[0].slice(0, 3),
                ['EVAL', RATE_LIMIT_LUA, '2']
            );
            assert.deepEqual(
                fake.sockets[0].commands[0].slice(3),
                [
                    'novastore:public-auth:v1:ip:ip-hash',
                    'novastore:public-auth:v1:identifier:identifier-hash',
                    '60000'
                ]
            );
            store.close();
            store.dispose();
            assert.equal(fake.sockets[0].destroyCalls, 1);
            assert.equal(timers.activeCount(), 0);
            await assert.rejects(
                store.consume({
                    identifierKey: 'identifier-hash',
                    ipKey: 'ip-hash',
                    windowMs: 60_000
                }),
                /PUBLIC_AUTH_RATE_LIMIT_STORE_CLOSED/
            );
        }]
    ];

    for (const [, testCase] of cases) await testCase();
    console.log(
        `customerAuthSharedRateLimitSmoke: shared-store-matrix PASS ${cases.length} cases`
    );
    return cases.length;
};

const run = async () => {
    assert.match(RATE_LIMIT_LUA, /INCR/);
    assert.match(RATE_LIMIT_LUA, /PEXPIRE/);
    assert.equal(encodeCommand(['PING']).toString('utf8'), '*1\r\n$4\r\nPING\r\n');
    assert.deepEqual(
        parseResp(Buffer.from('*4\r\n:2\r\n:3\r\n:5000\r\n:4000\r\n')),
        { value: [2, 3, 5000, 4000], offset: 26 }
    );
    const sharedStoreMatrixCases = await runSharedStoreSocketMatrix();
    assert.equal(sharedStoreMatrixCases, 12);

    const sharedRedis = new DeterministicRedis();
    const instanceA = createStore(sharedRedis, 'test:multi-instance');
    const instanceB = createStore(sharedRedis, 'test:multi-instance');
    const first = await instanceA.consume({
        ipKey: 'ip-hash',
        identifierKey: 'identifier-hash',
        windowMs: 60_000
    });
    sharedRedis.advance(10_000);
    const second = await instanceB.consume({
        ipKey: 'ip-hash',
        identifierKey: 'identifier-hash',
        windowMs: 60_000
    });
    assert.deepEqual(first, {
        ipCount: 1,
        identifierCount: 1,
        retryAfterMs: 60_000
    });
    assert.deepEqual(second, {
        ipCount: 2,
        identifierCount: 2,
        retryAfterMs: 50_000
    });
    sharedRedis.advance(50_001);
    const reset = await instanceA.consume({
        ipKey: 'ip-hash',
        identifierKey: 'identifier-hash',
        windowMs: 60_000
    });
    assert.equal(reset.ipCount, 1);
    assert.equal(reset.identifierCount, 1);

    const identifierRedis = new DeterministicRedis();
    const identifierLimiter = createCustomerAuthRateLimit({
        env: process.env,
        ipMax: 10,
        identifierMax: 2,
        windowMs: 60_000,
        store: createStore(identifierRedis, 'test:identifier')
    });
    const identifier = 'Customer@Example.Test';
    assert.equal((await invoke(identifierLimiter, {
        ip: '203.0.113.1',
        path: '/password-reset/request',
        body: { identifier }
    })).nextCalls, 1);
    assert.equal((await invoke(identifierLimiter, {
        ip: '203.0.113.2',
        path: '/password-reset/request',
        body: { identifier }
    })).nextCalls, 1);
    const identifierLimited = await invoke(identifierLimiter, {
        ip: '203.0.113.3',
        path: '/password-reset/request',
        body: { identifier }
    });
    assert.equal(identifierLimited.response.statusCode, 429);
    assert(identifierRedis.keysSeen.every((key) => !key.includes(identifier)));
    assert(identifierRedis.keysSeen.every((key) => !key.includes('customer@example.test')));

    const ipRedis = new DeterministicRedis();
    const ipLimiter = createCustomerAuthRateLimit({
        env: process.env,
        ipMax: 2,
        identifierMax: 10,
        windowMs: 60_000,
        store: createStore(ipRedis, 'test:ip')
    });
    for (const value of ['first@example.test', 'second@example.test']) {
        assert.equal((await invoke(ipLimiter, {
            ip: '198.51.100.4',
            path: '/password-reset/request',
            body: { identifier: value }
        })).nextCalls, 1);
    }
    const ipLimited = await invoke(ipLimiter, {
        ip: '198.51.100.4',
        path: '/password-reset/request',
        body: { identifier: 'third@example.test' }
    });
    assert.equal(ipLimited.response.statusCode, 429);

    const unavailableRedis = new DeterministicRedis();
    unavailableRedis.fail = true;
    const unavailableLimiter = createCustomerAuthRateLimit({
        env: process.env,
        store: createStore(unavailableRedis, 'test:unavailable')
    });
    const unavailable = await invoke(unavailableLimiter, {
        ip: '198.51.100.8',
        path: '/login',
        body: { identifier: 'customer@example.test' }
    });
    assert.equal(unavailable.response.statusCode, 503);
    assert.equal(unavailable.nextCalls, 0);

    assert.throws(
        () => createSharedRateLimitStore({ env: { NODE_ENV: 'production' } }),
        /PUBLIC_AUTH_RATE_LIMIT_REDIS_URL_MISSING/
    );

    const hmacKey = hashRateLimitKey('identifier', 'email:customer@example.test', process.env);
    assert.match(hmacKey, /^[a-f0-9]{64}$/);
    assert(!hmacKey.includes('customer@example.test'));

    assert.equal(resolveTrustedProxy({ RENDER: 'true' }), 1);
    assert.equal(resolveTrustedProxy({ RENDER: 'false' }), false);
    assert.equal(
        resolveSensitiveRequestIp({
            headers: { 'x-forwarded-for': '198.51.100.250' },
            socket: { remoteAddress: '127.0.0.1' }
        }, { env: { RENDER: 'false' } }),
        '127.0.0.1',
        'non-Render auth traffic must ignore client-supplied forwarding headers'
    );
    assert.equal(
        resolveSensitiveRequestIp({
            headers: { 'x-forwarded-for': '198.51.100.250' },
            socket: { remoteAddress: '10.0.0.8' }
        }, { env: { RENDER: 'true' } }),
        '198.51.100.250'
    );
    for (const request of [
        {
            headers: { 'x-forwarded-for': '198.51.100.250, 203.0.113.10' },
            socket: { remoteAddress: '10.0.0.8' }
        },
        {
            headers: {},
            socket: { remoteAddress: '10.0.0.8' }
        },
        {
            headers: { 'x-forwarded-for': '198.51.100.250' },
            socket: { remoteAddress: '203.0.113.44' }
        }
    ]) {
        assert.throws(
            () => resolveSensitiveRequestIp(request, { env: { RENDER: 'true' } }),
            (error) => error.code === 'PUBLIC_AUTH_PROXY_CHAIN_INVALID'
        );
    }

    const scopedRedis = new DeterministicRedis();
    const scopedStoreA = createStore(scopedRedis, 'test:scoped');
    const scopedStoreB = createStore(scopedRedis, 'test:scoped');
    const adminLimiterA = createCustomerAuthRateLimit({
        env: process.env,
        ipMax: 20,
        identifierMax: 2,
        keyScope: 'admin-login',
        responseKind: 'admin-login',
        store: scopedStoreA,
        windowMs: 60_000
    });
    const adminLimiterB = createCustomerAuthRateLimit({
        env: process.env,
        ipMax: 20,
        identifierMax: 2,
        keyScope: 'admin-login',
        responseKind: 'admin-login',
        store: scopedStoreB,
        windowMs: 60_000
    });
    const sharedAdminIdentifier = ' Admin@Example.Test ';
    assert.equal((await invoke(adminLimiterA, {
        ip: '198.51.100.11',
        path: '/login',
        body: { email: sharedAdminIdentifier }
    })).nextCalls, 1);
    assert.equal((await invoke(adminLimiterB, {
        ip: '198.51.100.12',
        path: '/login',
        body: { email: 'admin@example.test' }
    })).nextCalls, 1);
    const distributedAdminAttempt = await invoke(adminLimiterA, {
        ip: '198.51.100.13',
        path: '/login',
        body: { email: 'ADMIN@EXAMPLE.TEST' }
    });
    assert.equal(distributedAdminAttempt.nextCalls, 0);
    assert.equal(distributedAdminAttempt.response.statusCode, 429);
    assert.deepEqual(distributedAdminAttempt.response.payload, {
        code: 'ADMIN_LOGIN_RATE_LIMIT',
        error: 'E-posta veya şifre hatalı.'
    });

    const conflictingBodyRedis = new DeterministicRedis();
    const conflictingBodyAdminLimiter = createCustomerAuthRateLimit({
        env: process.env,
        ipMax: 20,
        identifierMax: 1,
        identifierField: 'email',
        keyScope: 'admin-login',
        responseKind: 'admin-login',
        store: createStore(conflictingBodyRedis, 'test:admin-conflicting-body'),
        windowMs: 60_000
    });
    assert.equal((await invoke(conflictingBodyAdminLimiter, {
        ip: '198.51.100.21',
        path: '/login',
        body: {
            email: 'victim-admin@example.test',
            identifier: 'attacker-controlled-1',
            phone: '+905000000001'
        }
    })).nextCalls, 1);
    const conflictingBodyAttempt = await invoke(conflictingBodyAdminLimiter, {
        ip: '198.51.100.22',
        path: '/login',
        body: {
            email: 'victim-admin@example.test',
            identifier: 'attacker-controlled-2',
            phone: '+905000000002'
        }
    });
    assert.equal(conflictingBodyAttempt.nextCalls, 0);
    assert.equal(conflictingBodyAttempt.response.statusCode, 429);

    const customerScopeLimiter = createCustomerAuthRateLimit({
        env: process.env,
        ipMax: 20,
        identifierMax: 2,
        keyScope: 'customer-login',
        responseKind: 'login',
        store: createStore(scopedRedis, 'test:scoped'),
        windowMs: 60_000
    });
    assert.equal((await invoke(customerScopeLimiter, {
        ip: '198.51.100.14',
        path: '/login',
        body: { identifier: 'admin@example.test' }
    })).nextCalls, 1, 'admin and customer identifier budgets must not collide');
    assert(scopedRedis.keysSeen.every((key) => !key.includes('admin@example.test')));

    const productionRouteMatrix = [
        {
            router: userRoutes,
            path: '/login',
            middleware: customerLoginRateLimit,
            scope: AUTH_RATE_LIMIT_SCOPES.CUSTOMER_LOGIN
        },
        {
            router: userRoutes,
            path: '/password-reset/request',
            middleware: customerPasswordResetRequestRateLimit,
            scope: AUTH_RATE_LIMIT_SCOPES.CUSTOMER_RESET_REQUEST
        },
        {
            router: userRoutes,
            path: '/password-reset/verify',
            middleware: customerPasswordResetVerifyRateLimit,
            scope: AUTH_RATE_LIMIT_SCOPES.CUSTOMER_RESET_VERIFY
        },
        {
            router: userRoutes,
            path: '/password-reset/complete',
            middleware: customerPasswordResetCompleteRateLimit,
            scope: AUTH_RATE_LIMIT_SCOPES.CUSTOMER_RESET_COMPLETE
        },
        {
            router: authRoutes,
            path: '/forgot-password',
            middleware: adminForgotPasswordRateLimit,
            scope: AUTH_RATE_LIMIT_SCOPES.ADMIN_FORGOT_PASSWORD
        }
    ];
    assert.equal(
        new Set(productionRouteMatrix.map(({ middleware }) => middleware)).size,
        productionRouteMatrix.length,
        'each protected flow must export a distinct production middleware instance'
    );
    for (const { router, path, middleware, scope } of productionRouteMatrix) {
        assert.equal(middleware.rateLimitScope, scope);
        assert.equal(routeHandlers(router, path)[0], middleware);
    }
    assert.equal(adminLoginRateLimit.rateLimitScope, AUTH_RATE_LIMIT_SCOPES.ADMIN_LOGIN);
    assert.equal(routeHandlers(authRoutes, '/login')[0], adminLoginRateLimit);

    const loginIsolationRedis = new DeterministicRedis();
    const loginIsolationLimiters = createCustomerAuthRateLimiters({
        env: process.env,
        store: createStore(loginIsolationRedis, 'test:actual-scopes')
    });
    const sharedIdentifier = 'scope-owner@example.test';
    for (let attempt = 1; attempt <= 10; attempt += 1) {
        assert.equal((await invoke(loginIsolationLimiters.customerLoginRateLimit, {
            ip: `10.20.0.${attempt}`,
            path: '/login',
            body: { identifier: sharedIdentifier }
        })).nextCalls, 1);
    }
    const exhaustedLogin = await invoke(loginIsolationLimiters.customerLoginRateLimit, {
        ip: '10.20.0.11',
        path: '/login',
        body: { identifier: sharedIdentifier }
    });
    assert.equal(exhaustedLogin.response.statusCode, 429);
    for (const [limiter, path, body] of [
        [
            loginIsolationLimiters.customerPasswordResetRequestRateLimit,
            '/password-reset/request',
            { identifier: sharedIdentifier }
        ],
        [
            loginIsolationLimiters.customerPasswordResetVerifyRateLimit,
            '/password-reset/verify',
            { identifier: sharedIdentifier }
        ],
        [
            loginIsolationLimiters.customerPasswordResetCompleteRateLimit,
            '/password-reset/complete',
            { identifier: sharedIdentifier }
        ],
        [
            loginIsolationLimiters.adminForgotPasswordRateLimit,
            '/forgot-password',
            { email: sharedIdentifier }
        ]
    ]) {
        assert.equal((await invoke(limiter, {
            ip: '10.21.0.1',
            path,
            body
        })).nextCalls, 1, `${limiter.rateLimitScope} must not consume customer-login budget`);
    }
    assert(loginIsolationRedis.keysSeen.every((key) => !key.includes(sharedIdentifier)));
    assert(loginIsolationRedis.keysSeen.every((key) => !key.includes('10.20.0.')));
    assert(loginIsolationRedis.keysSeen.every((key) => (
        /^test:actual-scopes:(?:ip|identifier):[a-z0-9-]+:[a-f0-9]{64}$/.test(key)
    )));

    const resetIsolationCases = [
        {
            name: 'request',
            property: 'customerPasswordResetRequestRateLimit',
            path: '/password-reset/request'
        },
        {
            name: 'verify',
            property: 'customerPasswordResetVerifyRateLimit',
            path: '/password-reset/verify'
        },
        {
            name: 'complete',
            property: 'customerPasswordResetCompleteRateLimit',
            path: '/password-reset/complete'
        }
    ];
    for (let sourceIndex = 0; sourceIndex < resetIsolationCases.length; sourceIndex += 1) {
        const source = resetIsolationCases[sourceIndex];
        const resetRedis = new DeterministicRedis();
        const resetLimiters = createCustomerAuthRateLimiters({
            env: process.env,
            store: createStore(resetRedis, `test:reset-isolation:${source.name}`)
        });
        const identifier = `${source.name}-owner@example.test`;
        for (let attempt = 1; attempt <= 10; attempt += 1) {
            assert.equal((await invoke(resetLimiters[source.property], {
                ip: `10.${30 + sourceIndex}.0.${attempt}`,
                path: source.path,
                body: { identifier }
            })).nextCalls, 1);
        }
        assert.equal((await invoke(resetLimiters[source.property], {
            ip: `10.${30 + sourceIndex}.0.11`,
            path: source.path,
            body: { identifier }
        })).response.statusCode, 429);
        for (const target of resetIsolationCases.filter(({ name }) => name !== source.name)) {
            assert.equal((await invoke(resetLimiters[target.property], {
                ip: `10.${40 + sourceIndex}.0.1`,
                path: target.path,
                body: { identifier }
            })).nextCalls, 1, `${source.name} budget must not consume ${target.name} budget`);
        }
    }

    const adminForgotRedis = new DeterministicRedis();
    const adminForgotLimiters = createCustomerAuthRateLimiters({
        env: process.env,
        store: createStore(adminForgotRedis, 'test:admin-forgot-isolation')
    });
    const adminForgotIdentifier = 'forgot-admin@example.test';
    for (let attempt = 1; attempt <= 10; attempt += 1) {
        assert.equal((await invoke(adminForgotLimiters.adminForgotPasswordRateLimit, {
            ip: `10.50.0.${attempt}`,
            path: '/forgot-password',
            body: {
                email: adminForgotIdentifier,
                identifier: `attacker-controlled-${attempt}`
            }
        })).nextCalls, 1);
    }
    assert.equal((await invoke(adminForgotLimiters.adminForgotPasswordRateLimit, {
        ip: '10.50.0.11',
        path: '/forgot-password',
        body: {
            email: adminForgotIdentifier,
            identifier: 'attacker-controlled-11'
        }
    })).response.statusCode, 429);
    for (const [limiter, path] of [
        [adminForgotLimiters.customerLoginRateLimit, '/login'],
        [adminForgotLimiters.customerPasswordResetRequestRateLimit, '/password-reset/request'],
        [adminForgotLimiters.customerPasswordResetVerifyRateLimit, '/password-reset/verify'],
        [adminForgotLimiters.customerPasswordResetCompleteRateLimit, '/password-reset/complete']
    ]) {
        assert.equal((await invoke(limiter, {
            ip: '10.51.0.1',
            path,
            body: { identifier: adminForgotIdentifier }
        })).nextCalls, 1);
    }

    const distributedScopeRedis = new DeterministicRedis();
    const distributedScopeA = createCustomerAuthRateLimiters({
        env: process.env,
        store: createStore(distributedScopeRedis, 'test:distributed-scope')
    });
    const distributedScopeB = createCustomerAuthRateLimiters({
        env: process.env,
        store: createStore(distributedScopeRedis, 'test:distributed-scope')
    });
    for (let attempt = 1; attempt <= 10; attempt += 1) {
        const limiter = attempt % 2 === 0
            ? distributedScopeA.customerPasswordResetVerifyRateLimit
            : distributedScopeB.customerPasswordResetVerifyRateLimit;
        assert.equal((await invoke(limiter, {
            ip: `10.60.0.${attempt}`,
            path: '/password-reset/verify',
            body: { identifier: 'distributed-owner@example.test' }
        })).nextCalls, 1);
    }
    assert.equal((await invoke(distributedScopeB.customerPasswordResetVerifyRateLimit, {
        ip: '10.60.0.11',
        path: '/password-reset/verify',
        body: { identifier: 'distributed-owner@example.test' }
    })).response.statusCode, 429);

    const inputBypassRedis = new DeterministicRedis();
    const inputBypassLimiter = createCustomerAuthRateLimiters({
        env: process.env,
        store: createStore(inputBypassRedis, 'test:input-non-bypass')
    }).customerLoginRateLimit;
    for (let attempt = 1; attempt <= 10; attempt += 1) {
        assert.equal((await invoke(inputBypassLimiter, {
            ip: `10.70.0.${attempt}`,
            path: '/login',
            body: {
                identifier: 'input-owner@example.test',
                keyScope: `attacker-scope-${attempt}`,
                scope: `customer-reset-${attempt}`
            }
        })).nextCalls, 1);
    }
    assert.equal((await invoke(inputBypassLimiter, {
        ip: '10.70.0.11',
        path: '/login',
        body: {
            identifier: 'input-owner@example.test',
            keyScope: 'new-attacker-scope',
            scope: 'admin-forgot-password'
        }
    })).response.statusCode, 429);
    assert(inputBypassRedis.keysSeen.every((key) => key.includes(':customer-login:')));

    const sharedIpRedis = new DeterministicRedis();
    const sharedIpLimiter = createCustomerAuthRateLimiters({
        env: process.env,
        store: createStore(sharedIpRedis, 'test:shared-ip')
    }).customerPasswordResetCompleteRateLimit;
    for (let attempt = 1; attempt <= 30; attempt += 1) {
        assert.equal((await invoke(sharedIpLimiter, {
            ip: '10.80.0.1',
            path: '/password-reset/complete',
            body: { identifier: `shared-ip-${attempt}@example.test` }
        })).nextCalls, 1);
    }
    assert.equal((await invoke(sharedIpLimiter, {
        ip: '10.80.0.1',
        path: '/password-reset/complete',
        body: { identifier: 'shared-ip-31@example.test' }
    })).response.statusCode, 429);

    const renderLimiter = createCustomerAuthRateLimit({
        env: {
            NODE_ENV: 'test',
            RENDER: 'true',
            PUBLIC_AUTH_RATE_LIMIT_SECRET: process.env.PUBLIC_AUTH_RATE_LIMIT_SECRET
        },
        store: createStore(new DeterministicRedis(), 'test:render')
    });
    assert.equal((await invoke(renderLimiter, {
        path: '/login',
        body: { identifier: 'customer@example.test' },
        headers: { 'x-forwarded-for': '198.51.100.40' },
        socket: { remoteAddress: '10.0.0.9' }
    })).nextCalls, 1);
    const invalidRenderChain = await invoke(renderLimiter, {
        path: '/login',
        body: { identifier: 'customer@example.test' },
        headers: { 'x-forwarded-for': '198.51.100.40, 203.0.113.2' },
        socket: { remoteAddress: '10.0.0.9' }
    });
    assert.equal(invalidRenderChain.nextCalls, 0);
    assert.equal(invalidRenderChain.response.statusCode, 503);
    assert.equal(invalidRenderChain.response.payload.code, 'PUBLIC_AUTH_PROXY_CHAIN_INVALID');

    assert.equal(
        syntheticRequestIp({
            env: { RENDER: 'false' },
            forwardedFor: '198.51.100.250',
            remoteAddress: '127.0.0.1'
        }),
        '127.0.0.1'
    );
    assert.equal(
        syntheticRequestIp({
            env: { RENDER: 'true' },
            forwardedFor: '198.51.100.250',
            remoteAddress: '10.0.0.8'
        }),
        '198.51.100.250'
    );

    console.log(
        'customerAuthSharedRateLimitSmoke: PASS shared-store-matrix=12 atomic-ttl multi-instance fail-closed real-route-scopes cross-scope-isolation scoped-ip+identifier hmac strict-trusted-proxy'
    );
};

run().catch((error) => {
    console.error(`customerAuthSharedRateLimitSmoke: FAIL ${error.stack || error.message}`);
    process.exitCode = 1;
});
