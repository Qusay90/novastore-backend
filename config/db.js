require('dotenv').config({ quiet: true });
const { resolveStartupSafety } = require('./startupSafety');

const startupSafety = resolveStartupSafety(process.env);
if (!startupSafety.canStart) {
    throw new Error(`Database startup blocked: ${startupSafety.errors.join(' ')}`);
}

const target = startupSafety.target;
if (!target.poolConfig) {
    throw new Error('Database startup blocked: effective database target is unavailable.');
}

const POOL_PROTOTYPE_SENSITIVE_NAMES = Object.freeze([
    'connectionString',
    'Client',
    'Promise',
    'log',
    'verify',
    'onConnect',
    'max',
    'poolSize',
    'min',
    'maxUses',
    'allowExitOnIdle',
    'maxLifetimeSeconds',
    'idleTimeoutMillis',
    'connectionTimeoutMillis',
    'types',
    'enableChannelBinding',
    'scramMaxIterations',
    'connection',
    'stream',
    'keepAliveInitialDelayMillis',
    'binary',
    'options',
    'sslnegotiation',
    'client_encoding',
    'replication',
    'application_name',
    'fallback_application_name'
]);
if (
    POOL_PROTOTYPE_SENSITIVE_NAMES.some(
        (name) => Object.prototype.hasOwnProperty.call(Object.prototype, name)
    )
) {
    throw new Error('Database startup blocked: unsafe runtime object state.');
}

const { Client, Pool } = require('pg');

const runtimeTargetMetadata = Object.freeze(Object.assign(Object.create(null), {
    host: target.host,
    port: target.port,
    database: target.database,
    local: target.local,
    remoteRelease: target.remoteRelease,
    tlsEnabled: target.tlsEnabled,
    tlsVerified: target.tlsVerified,
    attested: target.attested
}));

const formatDbError = (error) => {
    if (target.remoteRelease) {
        return 'Remote database operation failed.';
    }

    const code = typeof error?.code === 'string' && /^[A-Z0-9_]+$/.test(error.code)
        ? ` (${error.code})`
        : '';
    return `Local database operation failed${code}.`;
};

const describeConnectionTarget = () => (
    target.local
        ? target.label
        : `${target.host}:${target.port}/${target.database}`
);

const pool = new Pool(target.poolConfig);
if (pool.Client !== Client || pool.Promise !== Promise) {
    throw new Error('Database startup blocked: unsafe Pool constructor state.');
}
Object.setPrototypeOf(pool.options, null);
Object.freeze(pool.options);
Object.defineProperties(pool, {
    Client: {
        configurable: false,
        enumerable: true,
        writable: false,
        value: Client
    },
    Promise: {
        configurable: false,
        enumerable: true,
        writable: false,
        value: Promise
    },
    options: {
        configurable: false,
        enumerable: true,
        writable: false,
        value: pool.options
    }
});

pool.on('connect', () => {
    console.log('PostgreSQL bağlantısı hazır.');
});

pool.formatError = formatDbError;
pool.getTargetLabel = describeConnectionTarget;
Object.defineProperty(pool, 'getRuntimeTargetMetadata', {
    configurable: false,
    enumerable: false,
    writable: false,
    value: () => runtimeTargetMetadata
});

module.exports = pool;
