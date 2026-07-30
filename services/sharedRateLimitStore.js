const net = require('node:net');
const tls = require('node:tls');

const RATE_LIMIT_LUA = `
local ipCount = redis.call('INCR', KEYS[1])
if ipCount == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]) end
local identifierCount = redis.call('INCR', KEYS[2])
if identifierCount == 1 then redis.call('PEXPIRE', KEYS[2], ARGV[1]) end
return {
  ipCount,
  identifierCount,
  redis.call('PTTL', KEYS[1]),
  redis.call('PTTL', KEYS[2])
}
`.trim();

const encodeCommand = (parts) => {
    const normalized = parts.map((part) => Buffer.from(String(part), 'utf8'));
    return Buffer.concat([
        Buffer.from(`*${normalized.length}\r\n`),
        ...normalized.flatMap((part) => [
            Buffer.from(`$${part.length}\r\n`),
            part,
            Buffer.from('\r\n')
        ])
    ]);
};

const parseResp = (buffer, offset = 0) => {
    if (offset >= buffer.length) return null;
    const type = String.fromCharCode(buffer[offset]);
    const lineEnd = buffer.indexOf('\r\n', offset + 1);
    if (lineEnd < 0) return null;
    const line = buffer.subarray(offset + 1, lineEnd).toString('utf8');
    const next = lineEnd + 2;

    if (type === '+') return { value: line, offset: next };
    if (type === '-') {
        const error = new Error(`RATE_LIMIT_STORE_COMMAND_FAILED:${line}`);
        error.code = 'PUBLIC_AUTH_RATE_LIMIT_STORE_UNAVAILABLE';
        return { value: error, offset: next };
    }
    if (type === ':') {
        if (!/^-?\d+$/.test(line)) {
            throw new Error('PUBLIC_AUTH_RATE_LIMIT_STORE_PROTOCOL_ERROR');
        }
        const integer = Number(line);
        if (!Number.isSafeInteger(integer)) {
            throw new Error('PUBLIC_AUTH_RATE_LIMIT_STORE_PROTOCOL_ERROR');
        }
        return { value: integer, offset: next };
    }
    if (type === '$') {
        if (!/^-?\d+$/.test(line)) {
            throw new Error('PUBLIC_AUTH_RATE_LIMIT_STORE_PROTOCOL_ERROR');
        }
        const length = Number(line);
        if (length === -1) return { value: null, offset: next };
        if (!Number.isSafeInteger(length) || length < 0 || buffer.length < next + length + 2) return null;
        if (
            buffer[next + length] !== 0x0d
            || buffer[next + length + 1] !== 0x0a
        ) {
            throw new Error('PUBLIC_AUTH_RATE_LIMIT_STORE_PROTOCOL_ERROR');
        }
        return {
            value: buffer.subarray(next, next + length).toString('utf8'),
            offset: next + length + 2
        };
    }
    if (type === '*') {
        if (!/^-?\d+$/.test(line)) {
            throw new Error('PUBLIC_AUTH_RATE_LIMIT_STORE_PROTOCOL_ERROR');
        }
        const length = Number(line);
        if (length === -1) return { value: null, offset: next };
        if (!Number.isSafeInteger(length) || length < 0) return null;
        const values = [];
        let cursor = next;
        for (let index = 0; index < length; index += 1) {
            const item = parseResp(buffer, cursor);
            if (!item) return null;
            values.push(item.value);
            cursor = item.offset;
        }
        return { value: values, offset: cursor };
    }
    throw new Error('PUBLIC_AUTH_RATE_LIMIT_STORE_PROTOCOL_ERROR');
};

const findRespError = (value) => {
    if (value instanceof Error) return value;
    if (!Array.isArray(value)) return null;
    for (const item of value) {
        const error = findRespError(item);
        if (error) return error;
    }
    return null;
};

const DEFAULT_STORE_TIMEOUT_MS = 1500;
const MIN_STORE_TIMEOUT_MS = 100;
const MAX_STORE_TIMEOUT_MS = 15000;
const MAX_RESP_BUFFER_BYTES = 1024 * 1024;

const configurationError = (message) => {
    const error = new Error(message);
    error.code = 'PUBLIC_AUTH_RATE_LIMIT_CONFIG_INVALID';
    return error;
};

const unavailableError = (
    message = 'PUBLIC_AUTH_RATE_LIMIT_STORE_UNAVAILABLE',
    cause
) => {
    const error = cause === undefined
        ? new Error(message)
        : new Error(message, { cause });
    error.code = 'PUBLIC_AUTH_RATE_LIMIT_STORE_UNAVAILABLE';
    return error;
};

const parseRateLimitStoreTimeoutMs = (value) => {
    if (value === undefined || value === null || String(value).trim() === '') {
        return DEFAULT_STORE_TIMEOUT_MS;
    }
    const raw = String(value).trim();
    if (!/^\d+$/.test(raw)) {
        throw configurationError('PUBLIC_AUTH_RATE_LIMIT_STORE_TIMEOUT_INVALID');
    }
    const parsed = Number(raw);
    if (
        !Number.isSafeInteger(parsed)
        || parsed < MIN_STORE_TIMEOUT_MS
        || parsed > MAX_STORE_TIMEOUT_MS
    ) {
        throw configurationError('PUBLIC_AUTH_RATE_LIMIT_STORE_TIMEOUT_INVALID');
    }
    return parsed;
};

const resolveRedisConnection = ({
    url,
    timeoutMs,
    env = process.env
}) => {
    let parsed;
    try {
        parsed = new URL(String(url || ''));
    } catch {
        throw configurationError('PUBLIC_AUTH_RATE_LIMIT_REDIS_URL_INVALID');
    }
    if (!['redis:', 'rediss:'].includes(parsed.protocol) || !parsed.hostname) {
        throw configurationError('PUBLIC_AUTH_RATE_LIMIT_REDIS_URL_INVALID');
    }
    if (
        parsed.protocol === 'rediss:'
        && String(env.NODE_TLS_REJECT_UNAUTHORIZED ?? '') === '0'
    ) {
        throw configurationError('PUBLIC_AUTH_RATE_LIMIT_TLS_INSECURE');
    }

    const hostname = parsed.hostname.startsWith('[') && parsed.hostname.endsWith(']')
        ? parsed.hostname.slice(1, -1)
        : parsed.hostname;
    let port;
    let username;
    let password;
    let database;
    try {
        port = Number(parsed.port || (parsed.protocol === 'rediss:' ? 6380 : 6379));
        username = decodeURIComponent(parsed.username || '');
        password = decodeURIComponent(parsed.password || '');
        database = parsed.pathname && parsed.pathname !== '/'
            ? Number(parsed.pathname.slice(1))
            : 0;
    } catch {
        throw configurationError('PUBLIC_AUTH_RATE_LIMIT_REDIS_URL_INVALID');
    }
    if (
        !Number.isInteger(port)
        || port < 1
        || port > 65535
        || !Number.isInteger(database)
        || database < 0
    ) {
        throw configurationError('PUBLIC_AUTH_RATE_LIMIT_REDIS_URL_INVALID');
    }

    return Object.freeze({
        commandPreamble: Object.freeze([
            ...(password
                ? [Object.freeze(username ? ['AUTH', username, password] : ['AUTH', password])]
                : []),
            ...(database ? [Object.freeze(['SELECT', database])] : [])
        ]),
        connectOptions: Object.freeze({
            host: hostname,
            port,
            ...(parsed.protocol === 'rediss:'
                ? {
                    rejectUnauthorized: true,
                    ...(net.isIP(hostname) === 0 ? { servername: hostname } : {})
                }
                : {})
        }),
        protocol: parsed.protocol,
        timeoutMs: parseRateLimitStoreTimeoutMs(timeoutMs)
    });
};

const createRedisCommandExecutor = ({
    url,
    timeoutMs,
    socketFactory,
    env = process.env,
    setTimeoutFn = setTimeout,
    clearTimeoutFn = clearTimeout
}) => {
    const connectionConfig = resolveRedisConnection({ url, timeoutMs, env });
    let activeConnection = null;
    let connectionPromise = null;
    let disposed = false;

    const clearTimer = (timer) => {
        if (timer !== null && timer !== undefined) clearTimeoutFn(timer);
    };
    const armTimer = (callback) => {
        const timer = setTimeoutFn(callback, connectionConfig.timeoutMs);
        timer?.unref?.();
        return timer;
    };
    const settleOperation = (operation, error, value) => {
        if (operation.settled) return;
        operation.settled = true;
        clearTimer(operation.timer);
        if (error) operation.reject(error);
        else operation.resolve(value);
    };
    const failConnection = (connection, error) => {
        if (!connection || connection.failed) return;
        connection.failed = true;
        connection.ready = false;
        clearTimer(connection.readyTimer);
        connection.readyTimer = null;
        while (connection.operations.length > 0) {
            settleOperation(connection.operations.shift(), error);
        }
        connection.pending = Buffer.alloc(0);
        if (!connection.readySettled) {
            connection.readySettled = true;
            connection.rejectReady(error);
        }
        if (activeConnection === connection) {
            activeConnection = null;
            connectionPromise = null;
        }
        try {
            connection.socket?.destroy();
        } catch {
            // The connection is already unusable; callers have been failed closed.
        }
    };
    const handleData = (connection, chunk) => {
        if (
            disposed
            || connection.failed
            || activeConnection !== connection
        ) {
            return;
        }
        connection.pending = Buffer.concat([
            connection.pending,
            Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
        ]);
        if (connection.pending.length > MAX_RESP_BUFFER_BYTES) {
            failConnection(
                connection,
                unavailableError('PUBLIC_AUTH_RATE_LIMIT_STORE_PROTOCOL_ERROR')
            );
            return;
        }
        while (connection.pending.length > 0) {
            let reply;
            try {
                reply = parseResp(connection.pending);
            } catch (cause) {
                failConnection(
                    connection,
                    unavailableError('PUBLIC_AUTH_RATE_LIMIT_STORE_PROTOCOL_ERROR', cause)
                );
                return;
            }
            if (!reply) return;
            const operation = connection.operations[0];
            if (!operation) {
                failConnection(
                    connection,
                    unavailableError('PUBLIC_AUTH_RATE_LIMIT_STORE_PROTOCOL_ERROR')
                );
                return;
            }
            connection.pending = connection.pending.subarray(reply.offset);
            const replyError = findRespError(reply.value);
            if (replyError) {
                failConnection(connection, replyError);
                return;
            }
            operation.replies.push(reply.value);
            if (operation.replies.length === operation.expectedReplies) {
                connection.operations.shift();
                settleOperation(operation, null, operation.replies.at(-1));
            }
        }
    };
    const dispatchOperation = (connection, commands, allowBeforeReady = false) => {
        if (
            disposed
            || connection.failed
            || activeConnection !== connection
            || (!allowBeforeReady && !connection.ready)
        ) {
            return Promise.reject(unavailableError());
        }
        let payload;
        try {
            payload = Buffer.concat(commands.map(encodeCommand));
        } catch (cause) {
            return Promise.reject(
                unavailableError('PUBLIC_AUTH_RATE_LIMIT_STORE_PROTOCOL_ERROR', cause)
            );
        }
        return new Promise((resolve, reject) => {
            const operation = {
                expectedReplies: commands.length,
                reject,
                replies: [],
                resolve,
                settled: false,
                timer: null
            };
            operation.timer = armTimer(() => {
                failConnection(
                    connection,
                    unavailableError('PUBLIC_AUTH_RATE_LIMIT_STORE_TIMEOUT')
                );
            });
            connection.operations.push(operation);
            try {
                connection.socket.write(payload);
            } catch (cause) {
                failConnection(connection, unavailableError(undefined, cause));
            }
        });
    };
    const markReady = (connection) => {
        if (
            disposed
            || connection.failed
            || activeConnection !== connection
            || connection.readySettled
        ) {
            return;
        }
        clearTimer(connection.readyTimer);
        connection.readyTimer = null;
        connection.ready = true;
        connection.readySettled = true;
        connection.resolveReady(connection);
    };
    const beginHandshake = (connection) => {
        if (
            disposed
            || connection.failed
            || activeConnection !== connection
        ) {
            return;
        }
        if (connectionConfig.commandPreamble.length === 0) {
            markReady(connection);
            return;
        }
        dispatchOperation(connection, connectionConfig.commandPreamble, true)
            .then(() => markReady(connection))
            .catch(() => {
                // dispatchOperation already invalidated the ambiguous connection.
            });
    };
    const openConnection = () => {
        let connection;
        const readyPromise = new Promise((resolve, reject) => {
            connection = {
                failed: false,
                operations: [],
                pending: Buffer.alloc(0),
                ready: false,
                readySettled: false,
                readyTimer: null,
                rejectReady: reject,
                resolveReady: resolve,
                socket: null
            };
        });
        activeConnection = connection;
        connectionPromise = readyPromise;

        try {
            connection.socket = socketFactory
                ? socketFactory(
                    connectionConfig.connectOptions,
                    connectionConfig.protocol
                )
                : connectionConfig.protocol === 'rediss:'
                    ? tls.connect(connectionConfig.connectOptions)
                    : net.createConnection(connectionConfig.connectOptions);
            connection.socket.setNoDelay?.(true);
            connection.socket.on('data', (chunk) => handleData(connection, chunk));
            connection.socket.on('error', (cause) => {
                failConnection(connection, unavailableError(undefined, cause));
            });
            connection.socket.on('end', () => {
                failConnection(connection, unavailableError());
            });
            connection.socket.on('close', () => {
                failConnection(connection, unavailableError());
            });
            connection.socket.once(
                connectionConfig.protocol === 'rediss:' ? 'secureConnect' : 'connect',
                () => beginHandshake(connection)
            );
            connection.readyTimer = armTimer(() => {
                failConnection(
                    connection,
                    unavailableError('PUBLIC_AUTH_RATE_LIMIT_STORE_TIMEOUT')
                );
            });
        } catch (cause) {
            failConnection(connection, unavailableError(undefined, cause));
        }
        return readyPromise;
    };
    const ensureConnection = () => {
        if (disposed) return Promise.reject(unavailableError());
        if (
            activeConnection
            && activeConnection.ready
            && !activeConnection.failed
        ) {
            return Promise.resolve(activeConnection);
        }
        return connectionPromise || openConnection();
    };
    const normalizeCommands = (commands) => {
        if (
            !Array.isArray(commands)
            || commands.length === 0
            || commands.some((command) => !Array.isArray(command) || command.length === 0)
        ) {
            throw unavailableError('PUBLIC_AUTH_RATE_LIMIT_STORE_PROTOCOL_ERROR');
        }
        return commands;
    };
    const executor = (commands) => {
        let commandList;
        try {
            commandList = normalizeCommands(commands);
        } catch (error) {
            return Promise.reject(error);
        }
        return ensureConnection()
            .then((connection) => dispatchOperation(connection, commandList));
    };
    const close = () => {
        if (disposed) return;
        disposed = true;
        if (activeConnection) {
            failConnection(
                activeConnection,
                unavailableError('PUBLIC_AUTH_RATE_LIMIT_STORE_CLOSED')
            );
        }
        activeConnection = null;
        connectionPromise = null;
    };
    Object.defineProperties(executor, {
        close: {
            configurable: false,
            enumerable: true,
            value: close,
            writable: false
        },
        dispose: {
            configurable: false,
            enumerable: true,
            value: close,
            writable: false
        }
    });
    return executor;
};

const createRedisRateLimitStore = ({
    url,
    prefix = 'novastore:public-auth:v1',
    timeoutMs,
    executor,
    env = process.env,
    socketFactory,
    setTimeoutFn,
    clearTimeoutFn
}) => {
    const connectionConfig = resolveRedisConnection({ url, timeoutMs, env });
    const normalizedTimeoutMs = connectionConfig.timeoutMs;
    const ownsExecutor = !executor;
    const commandExecutor = executor || createRedisCommandExecutor({
        url,
        timeoutMs: normalizedTimeoutMs,
        env,
        socketFactory,
        setTimeoutFn,
        clearTimeoutFn
    });
    let closed = false;
    const close = () => {
        if (closed) return;
        closed = true;
        if (ownsExecutor) commandExecutor.close?.();
    };
    const consume = async ({ ipKey, identifierKey, windowMs }) => {
        if (closed) throw unavailableError('PUBLIC_AUTH_RATE_LIMIT_STORE_CLOSED');
        const result = await commandExecutor([[
            'EVAL',
            RATE_LIMIT_LUA,
            2,
            `${prefix}:ip:${ipKey}`,
            `${prefix}:identifier:${identifierKey}`,
            Math.max(1000, Math.floor(windowMs))
        ]]);
        if (!Array.isArray(result) || result.length !== 4) {
            const error = new Error('PUBLIC_AUTH_RATE_LIMIT_STORE_INVALID_RESPONSE');
            error.code = 'PUBLIC_AUTH_RATE_LIMIT_STORE_UNAVAILABLE';
            throw error;
        }
        const [ipCount, identifierCount, ipTtl, identifierTtl] = result.map(Number);
        if (
            ![ipCount, identifierCount, ipTtl, identifierTtl].every(Number.isSafeInteger)
            || ipCount < 1
            || identifierCount < 1
            || ipTtl <= 0
            || identifierTtl <= 0
        ) {
            const error = new Error('PUBLIC_AUTH_RATE_LIMIT_STORE_INVALID_RESPONSE');
            error.code = 'PUBLIC_AUTH_RATE_LIMIT_STORE_UNAVAILABLE';
            throw error;
        }
        return {
            ipCount,
            identifierCount,
            retryAfterMs: Math.max(1000, ipTtl, identifierTtl)
        };
    };
    return Object.freeze({
        close,
        consume,
        dispose: close,
        kind: 'redis'
    });
};

const createMemoryRateLimitStore = ({
    maxEntries = 10000,
    now = () => Date.now()
} = {}) => {
    const entries = new Map();
    const consumeKey = (key, windowMs, timestamp) => {
        const current = entries.get(key);
        if (!current || current.resetAt <= timestamp) {
            const entry = { count: 1, resetAt: timestamp + windowMs };
            entries.set(key, entry);
            return entry;
        }
        current.count += 1;
        return current;
    };
    const prune = (timestamp) => {
        for (const [key, entry] of entries) {
            if (entry.resetAt <= timestamp) entries.delete(key);
        }
        while (entries.size > maxEntries) entries.delete(entries.keys().next().value);
    };
    return Object.freeze({
        kind: 'memory',
        consume: ({ ipKey, identifierKey, windowMs }) => {
            const timestamp = Number(now());
            const ip = consumeKey(`ip:${ipKey}`, windowMs, timestamp);
            const identifier = consumeKey(`identifier:${identifierKey}`, windowMs, timestamp);
            prune(timestamp);
            return {
                ipCount: ip.count,
                identifierCount: identifier.count,
                retryAfterMs: Math.max(1000, ip.resetAt - timestamp, identifier.resetAt - timestamp)
            };
        },
        size: () => entries.size
    });
};

const createSharedRateLimitStore = ({
    env = process.env,
    maxEntries,
    now,
    executor
} = {}) => {
    const redisUrl = String(
        env.PUBLIC_AUTH_RATE_LIMIT_REDIS_URL
        || env.REDIS_URL
        || ''
    ).trim();
    const production = String(env.NODE_ENV || '').toLowerCase() === 'production';
    if (redisUrl) {
        return createRedisRateLimitStore({
            url: redisUrl,
            prefix: String(env.PUBLIC_AUTH_RATE_LIMIT_PREFIX || 'novastore:public-auth:v1'),
            timeoutMs: parseRateLimitStoreTimeoutMs(
                env.PUBLIC_AUTH_RATE_LIMIT_STORE_TIMEOUT_MS
            ),
            env,
            ...(executor ? { executor } : {})
        });
    }
    if (production) {
        const error = new Error('PUBLIC_AUTH_RATE_LIMIT_REDIS_URL_MISSING');
        error.code = 'PUBLIC_AUTH_RATE_LIMIT_CONFIG_MISSING';
        throw error;
    }
    return createMemoryRateLimitStore({ maxEntries, now });
};

module.exports = {
    RATE_LIMIT_LUA,
    createMemoryRateLimitStore,
    createRedisCommandExecutor,
    createRedisRateLimitStore,
    createSharedRateLimitStore,
    encodeCommand,
    parseRateLimitStoreTimeoutMs,
    parseResp
};
