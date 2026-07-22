const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost', '::1']);
const LOCAL_TEST_CAPABILITY = 'NOVASTORE_STAGING_LOCAL_TEST_ENABLED';

const exactTrue = (value) => String(value || '').trim() === 'true';
const normalizeHost = (value) => String(value || '').trim().toLowerCase().replace(/^\[|\]$/g, '');
const normalizeDatabaseName = (pathname) => decodeURIComponent(String(pathname || '').replace(/^\/+/, '')).trim();
const isProductionLikeName = (name) => {
    const normalized = String(name || '').toLowerCase();
    return normalized === 'postgres' || /production|(^|[_-])prod($|[_-])/.test(normalized);
};

const fail = (message, code = 'TARGET_ATTESTATION_FAILED') => {
    const error = new Error(message);
    error.code = code;
    throw error;
};

const validateTarget = (env = process.env, { bootstrap = false } = {}) => {
    if (String(env.NOVASTORE_DEPLOY_ENV || '').trim() !== 'staging') {
        fail('NOVASTORE_DEPLOY_ENV must be exactly staging.');
    }
    if (!exactTrue(env.NOVASTORE_STAGING_MIGRATIONS_ENABLED)) {
        fail('NOVASTORE_STAGING_MIGRATIONS_ENABLED must be exactly true.');
    }
    if (!exactTrue(env.NOVASTORE_ALLOW_REMOTE_DB)) {
        fail('NOVASTORE_ALLOW_REMOTE_DB must be exactly true for an explicitly attested staging target.');
    }
    if (bootstrap && !exactTrue(env.NOVASTORE_STAGING_BOOTSTRAP_ENABLED)) {
        fail('NOVASTORE_STAGING_BOOTSTRAP_ENABLED must be exactly true.');
    }

    const expectedHost = normalizeHost(env.NOVASTORE_EXPECTED_DATABASE_HOST);
    const expectedDatabase = String(env.NOVASTORE_EXPECTED_DATABASE_NAME || '').trim();
    if (!expectedHost) fail('NOVASTORE_EXPECTED_DATABASE_HOST is required.');
    if (!expectedDatabase) fail('NOVASTORE_EXPECTED_DATABASE_NAME is required.');

    const rawUrl = String(env.DATABASE_URL || '').trim();
    if (!rawUrl) fail('DATABASE_URL is required.');

    let parsed;
    try {
        parsed = new URL(rawUrl);
    } catch (_) {
        fail('DATABASE_URL must be a valid PostgreSQL URL.');
    }
    if (!['postgres:', 'postgresql:'].includes(parsed.protocol)) {
        fail('DATABASE_URL must use the PostgreSQL scheme.');
    }

    const actualHost = normalizeHost(parsed.hostname);
    let actualDatabase;
    try {
        actualDatabase = normalizeDatabaseName(parsed.pathname);
    } catch (_) {
        fail('DATABASE_URL contains an invalid encoded database name.');
    }
    if (actualHost !== expectedHost) fail('Database host does not match the explicit expected host.');
    if (actualDatabase !== expectedDatabase) fail('Database name does not match the explicit expected database.');
    if (isProductionLikeName(actualDatabase)) fail('Production-like or maintenance database names are rejected.');

    const localHost = LOCAL_HOSTS.has(actualHost);
    const localTest =
        String(env.NODE_ENV || '').trim() === 'test' &&
        localHost &&
        exactTrue(env[LOCAL_TEST_CAPABILITY]) &&
        actualDatabase.endsWith('_test');

    if (localHost && !localTest) {
        fail(`Loopback migration targets require NODE_ENV=test, ${LOCAL_TEST_CAPABILITY}=true, and a unique _test database.`);
    }
    if (!localHost && expectedDatabase !== 'novastore_staging') {
        fail('Remote staging migrations require the exact novastore_staging database name.');
    }
    if (!localTest && !actualDatabase.includes('staging')) {
        fail('The attested database name is not explicitly staging-scoped.');
    }

    return Object.freeze({
        connectionString: rawUrl,
        database: actualDatabase,
        host: actualHost,
        localTest,
        mode: localTest ? 'local-test' : 'staging'
    });
};

const redact = (value, env = process.env) => {
    let output = String(value?.message || value || 'Unknown migration failure');
    const exactValues = [env.DATABASE_URL];

    try {
        const parsed = new URL(String(env.DATABASE_URL || ''));
        exactValues.push(parsed.password, decodeURIComponent(parsed.password || ''));
    } catch (_) {
        // Invalid URLs are rejected before connection and need no parsed-value redaction.
    }

    for (const candidate of exactValues) {
        if (candidate) output = output.split(String(candidate)).join('[REDACTED]');
    }

    return output
        .replace(/postgres(?:ql)?:\/\/[^\s'"`]+/gi, '[REDACTED_DATABASE_URL]')
        .replace(/\b(password|token|secret|database_url)\s*[=:]\s*[^\s,;]+/gi, '$1=[REDACTED]')
        .replace(/\?[^\s'"`]+/g, '?[REDACTED_QUERY]');
};

module.exports = {
    LOCAL_HOSTS,
    LOCAL_TEST_CAPABILITY,
    exactTrue,
    isProductionLikeName,
    normalizeHost,
    redact,
    validateTarget
};
