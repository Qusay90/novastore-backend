'use strict';

const assert = require('node:assert/strict');
const express = require('express');
const {
    resolveSellerApiActivationPolicy
} = require('../config/sellerApiActivationPolicy');
const {
    RUNTIME_DATABASE_IDENTITY_QUERY,
    assertRuntimeDatabaseIdentity
} = require('../services/runtimeDatabaseIdentityService');
const {
    createSellerTransportSecurityMiddleware
} = require('../middlewares/sellerTransportSecurity');

const secrets = Object.freeze({
    JWT_SECRET: 'seller-policy-jwt-secret-material-000001',
    SELLER_ACCESS_TOKEN_SECRET: 'seller-policy-access-secret-material-000002',
    SELLER_PASSWORD_RECOVERY_SECRET: 'seller-policy-recovery-secret-material-000003',
    SELLER_APPLICATION_AUTH_SECRET: 'seller-policy-application-secret-material-000004'
});
const target = (overrides = {}) => Object.freeze({
    host: 'runtime-db.example.test',
    port: 5432,
    database: 'novastore_runtime',
    local: false,
    isLocalHost: false,
    remoteRelease: true,
    tlsEnabled: true,
    tlsVerified: true,
    attested: true,
    ...overrides
});
const startup = (targetValue, overrides = {}) => Object.freeze({
    canStart: true,
    safeLocalDatabase: targetValue.isLocalHost === true,
    allowRemoteDatabase: false,
    target: targetValue,
    ...overrides
});
const productionEnvironment = (overrides = {}) => ({
    NODE_ENV: 'production',
    NOVASTORE_DEPLOY_ENV: 'production',
    SELLER_API_V1_ENABLED: 'true',
    SELLER_API_V1_LOCAL_ONLY: 'false',
    SELLER_API_V1_ACTIVATION_MODE: 'production',
    SELLER_API_V1_EXTERNAL_ORIGIN: 'https://seller-api.novastore.example',
    SELLER_API_V1_TRUSTED_INGRESS_CIDRS: '192.0.2.10/32,2001:db8::10/128',
    ...secrets,
    ...overrides
});
const resolveProduction = (environment = productionEnvironment(), options = {}) => (
    resolveSellerApiActivationPolicy({
        environment,
        startupSafety: options.startupSafety || startup(target()),
        bindHost: options.bindHost ?? '',
        trustedProxyHops: options.trustedProxyHops ?? 1
    })
);
const expectCode = (work, code) => assert.throws(work, (error) => error?.code === code);

;(async () => {
const production = resolveProduction();
assert.deepEqual(production, {
    enabled: true,
    mode: 'production',
    localOnly: false,
    requiresConnectedDatabaseIdentity: true,
    requiresSecureTransport: true,
    externalOrigin: 'https://seller-api.novastore.example',
    trustedIngressCidrs: ['192.0.2.10/32', '2001:db8::10/128']
});

const disabled = resolveSellerApiActivationPolicy({ environment: {} });
assert.equal(disabled.enabled, false);
assert.equal(disabled.requiresConnectedDatabaseIdentity, false);
assert.equal(disabled.requiresSecureTransport, false);
expectCode(
    () => resolveSellerApiActivationPolicy({ environment: { SELLER_API_V1_ENABLED: 'yes' } }),
    'SELLER_API_V1_ENABLED_INVALID'
);

for (const [name, mutate, code] of [
    ['enabled alone', (env) => { delete env.SELLER_API_V1_LOCAL_ONLY; }, 'SELLER_API_V1_LOCAL_ONLY_REQUIRED'],
    ['missing mode', (env) => { delete env.SELLER_API_V1_ACTIVATION_MODE; }, 'SELLER_API_ACTIVATION_MODE_INVALID'],
    ['unsupported mode', (env) => { env.SELLER_API_V1_ACTIVATION_MODE = 'live'; }, 'SELLER_API_ACTIVATION_MODE_INVALID'],
    ['wrong node env', (env) => { env.NODE_ENV = 'staging'; }, 'SELLER_API_PRODUCTION_ENVIRONMENT_INVALID'],
    ['missing deploy identity', (env) => { delete env.NOVASTORE_DEPLOY_ENV; }, 'SELLER_API_PRODUCTION_ENVIRONMENT_INVALID'],
    ['weak secret', (env) => { env.SELLER_ACCESS_TOKEN_SECRET = 'short'; }, 'SELLER_ACCESS_TOKEN_SECRET_REQUIRED'],
    ['missing recovery secret', (env) => { delete env.SELLER_PASSWORD_RECOVERY_SECRET; }, 'SELLER_API_SECURITY_SECRETS_REQUIRED'],
    ['reused secrets', (env) => { env.SELLER_PASSWORD_RECOVERY_SECRET = env.SELLER_ACCESS_TOKEN_SECRET; }, 'SELLER_API_SECURITY_SECRETS_NOT_INDEPENDENT'],
    ['missing origin', (env) => { delete env.SELLER_API_V1_EXTERNAL_ORIGIN; }, 'SELLER_API_EXTERNAL_ORIGIN_INVALID'],
    ['HTTP origin', (env) => { env.SELLER_API_V1_EXTERNAL_ORIGIN = 'http://seller-api.novastore.example'; }, 'SELLER_API_EXTERNAL_ORIGIN_INVALID'],
    ['credential origin', (env) => { env.SELLER_API_V1_EXTERNAL_ORIGIN = 'https://user:secret@seller-api.novastore.example'; }, 'SELLER_API_EXTERNAL_ORIGIN_INVALID'],
    ['path origin', (env) => { env.SELLER_API_V1_EXTERNAL_ORIGIN = 'https://seller-api.novastore.example/v1'; }, 'SELLER_API_EXTERNAL_ORIGIN_INVALID'],
    ['loopback origin', (env) => { env.SELLER_API_V1_EXTERNAL_ORIGIN = 'https://127.0.0.1'; }, 'SELLER_API_EXTERNAL_ORIGIN_INVALID']
]) {
    const environment = productionEnvironment();
    mutate(environment);
    expectCode(() => resolveProduction(environment), code, name);
}
expectCode(() => resolveProduction(undefined, { trustedProxyHops: 0 }), 'SELLER_API_TRUST_PROXY_REQUIRED');
expectCode(() => resolveProduction(undefined, { bindHost: '127.0.0.1' }), 'SELLER_API_REMOTE_BIND_HOST_INVALID');
for (const ingress of ['', '0.0.0.0/0', '0.0.0.0/1', '128.0.0.0/1', '::/0', '::/1', '192.0.2.0/23', '2001:db8::/63', 'proxy.example.test', '192.0.2.10/33', '192.0.2.10/32,192.0.2.10/32']) {
    expectCode(
        () => resolveProduction(productionEnvironment({ SELLER_API_V1_TRUSTED_INGRESS_CIDRS: ingress })),
        'SELLER_API_TRUSTED_INGRESS_CIDRS_INVALID'
    );
}
for (const [field, value] of [
    ['remoteRelease', false],
    ['attested', false],
    ['tlsEnabled', false],
    ['tlsVerified', false],
    ['local', true]
]) {
    expectCode(
        () => resolveProduction(undefined, { startupSafety: startup(target({ [field]: value })) }),
        'SELLER_API_REMOTE_DATABASE_IDENTITY_INVALID'
    );
}

const localTarget = target({
    host: '127.0.0.1',
    port: 55432,
    database: 'novastore_seller_local',
    local: true,
    isLocalHost: true,
    remoteRelease: false,
    tlsEnabled: false,
    tlsVerified: false,
    attested: false
});
const localEnvironment = {
    NODE_ENV: 'test',
    SELLER_API_V1_ENABLED: 'true',
    SELLER_API_V1_LOCAL_ONLY: 'true',
    SELLER_ACCESS_TOKEN_SECRET: secrets.SELLER_ACCESS_TOKEN_SECRET,
    SELLER_PASSWORD_RECOVERY_SECRET: secrets.SELLER_PASSWORD_RECOVERY_SECRET,
    SELLER_APPLICATION_AUTH_SECRET: secrets.SELLER_APPLICATION_AUTH_SECRET
};
const local = resolveSellerApiActivationPolicy({
    environment: localEnvironment,
    startupSafety: startup(localTarget),
    bindHost: '127.0.0.1'
});
assert.equal(local.mode, 'local', 'legacy local flags infer only the local mode');
assert.equal(local.requiresSecureTransport, false);
const localUat = resolveSellerApiActivationPolicy({
    environment: { ...localEnvironment, SELLER_API_V1_ACTIVATION_MODE: 'uat' },
    startupSafety: startup(localTarget),
    bindHost: '127.0.0.1'
});
assert.equal(localUat.mode, 'uat');
assert.equal(localUat.requiresConnectedDatabaseIdentity, true);
expectCode(() => resolveSellerApiActivationPolicy({
    environment: { ...localEnvironment, NODE_ENV: 'production' },
    startupSafety: startup(localTarget),
    bindHost: '127.0.0.1'
}), 'SELLER_API_LOCAL_ENVIRONMENT_INVALID');
expectCode(() => resolveSellerApiActivationPolicy({
    environment: localEnvironment,
    startupSafety: startup(localTarget, { allowRemoteDatabase: true }),
    bindHost: '127.0.0.1'
}), 'SELLER_API_LOCAL_REMOTE_DATABASE_CAPABILITY_FORBIDDEN');

const remoteUat = resolveSellerApiActivationPolicy({
    environment: {
        ...productionEnvironment(),
        NOVASTORE_DEPLOY_ENV: 'staging',
        SELLER_API_V1_ACTIVATION_MODE: 'uat'
    },
    startupSafety: startup(target()),
    trustedProxyHops: 1
});
assert.equal(remoteUat.mode, 'uat');
assert.equal(remoteUat.requiresSecureTransport, true);

const metadata = (targetValue, overrides = {}) => Object.freeze(Object.assign(Object.create(null), {
    host: targetValue.host,
    port: targetValue.port,
    database: targetValue.database,
    local: targetValue.local,
    remoteRelease: targetValue.remoteRelease,
    tlsEnabled: targetValue.tlsEnabled,
    tlsVerified: targetValue.tlsVerified,
    attested: targetValue.attested,
    ...overrides
}));
const database = (targetValue, { metadataValue = metadata(targetValue), rows, error } = {}) => ({
    getRuntimeTargetMetadata: () => metadataValue,
    query: async (statement) => {
        assert.equal(statement, RUNTIME_DATABASE_IDENTITY_QUERY);
        if (error) throw error;
        return { rows: rows ?? [{ database: targetValue.database, port: targetValue.port }] };
    }
});
assert.deepEqual(
    await assertRuntimeDatabaseIdentity({ database: database(target()), target: target() }),
    { database: 'novastore_runtime', port: 5432 }
);
for (const invalidDatabase of [
    database(target(), { metadataValue: { ...metadata(target()) } }),
    database(target(), { metadataValue: metadata(target(), { host: 'wrong.example.test' }) }),
    database(target(), { rows: [{ database: 'wrong_database', port: 5432 }] }),
    database(target(), { rows: [{ database: 'novastore_runtime', port: 6543 }] }),
    database(target(), { rows: [] }),
    database(target(), { error: new Error('sensitive synthetic DSN') })
]) {
    await assert.rejects(
        () => assertRuntimeDatabaseIdentity({ database: invalidDatabase, target: target() }),
        (error) => error?.code === 'RUNTIME_DATABASE_IDENTITY_INVALID' && !/sensitive|dsn/iu.test(error.message)
    );
}
const poolerTarget = target({ host: 'aws-0-eu.pooler.supabase.com', port: 6543 });
await assertRuntimeDatabaseIdentity({
    database: database(poolerTarget, { rows: [{ database: poolerTarget.database, port: 5432 }] }),
    target: poolerTarget
});
assert.deepEqual(await assertRuntimeDatabaseIdentity({
    database: database(localTarget, { rows: [{ database: localTarget.database, port: 5432 }] }),
    target: localTarget
}), { database: localTarget.database, port: 5432 }, 'local container host-port NAT preserves exact database identity');

const withHttpServer = async ({ trustProxy = 0, required = true, trustedIngressCidrs = [] }, assertion) => {
    const app = express();
    if (trustProxy) app.set('trust proxy', trustProxy);
    app.use(createSellerTransportSecurityMiddleware({ required, trustedIngressCidrs }));
    app.get('/seller', (_req, res) => res.status(200).json({ status: 'ok' }));
    const server = await new Promise((resolve, reject) => {
        const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
        instance.once('error', reject);
    });
    try {
        await assertion(`http://127.0.0.1:${server.address().port}`);
    } finally {
        await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    }
};
await withHttpServer({ trustProxy: 1, trustedIngressCidrs: ['127.0.0.1/32'] }, async (baseUrl) => {
    const plain = await fetch(`${baseUrl}/seller`);
    assert.equal(plain.status, 426);
    assert.deepEqual(await plain.json(), { code: 'HTTPS_REQUIRED', error: 'HTTPS_REQUIRED' });
    const proxiedTls = await fetch(`${baseUrl}/seller`, { headers: { 'X-Forwarded-Proto': 'https' } });
    assert.equal(proxiedTls.status, 200);
});
await withHttpServer({ trustProxy: 1, trustedIngressCidrs: ['192.0.2.10/32'] }, async (baseUrl) => {
    const spoofed = await fetch(`${baseUrl}/seller`, { headers: { 'X-Forwarded-Proto': 'https' } });
    assert.equal(spoofed.status, 426);
});
await withHttpServer({ required: false }, async (baseUrl) => {
    assert.equal((await fetch(`${baseUrl}/seller`)).status, 200);
});

console.log('sellerApiActivationPolicySmoke: PASS');
})().catch((error) => {
    console.error('sellerApiActivationPolicySmoke: FAIL');
    console.error(error.stack);
    process.exitCode = 1;
});
