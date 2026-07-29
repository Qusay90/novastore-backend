const net = require('node:net');
const { resolveStagingRuntimePolicy } = require('./stagingRuntimePolicy');

const LOCAL_HOSTS = new Set([
    'localhost',
    '127.0.0.1',
    '::1',
    '0.0.0.0',
    'host.docker.internal'
]);
const TRUTHY_VALUES = new Set(['1', 'true', 'yes', 'on']);
const REMOTE_DATABASE_OVERRIDE_NAMES = Object.freeze([
    'DB_HOST',
    'DB_PORT',
    'DB_NAME',
    'DB_USER',
    'DB_PASSWORD',
    'DB_SSL',
    'PGHOST',
    'PGPORT',
    'PGDATABASE',
    'PGSSLMODE',
    'SUPABASE_USE_POOLER',
    'SUPABASE_POOLER_HOST',
    'SUPABASE_REGION',
    'SUPABASE_PROJECT_REF',
    'SUPABASE_POOLER_MODE',
    'PGUSER',
    'PGPASSWORD',
    'PGBINARY',
    'PGOPTIONS',
    'PGCLIENT_ENCODING',
    'PGREPLICATION',
    'PGSSLNEGOTIATION',
    'PGAPPNAME',
    'PGCONNECT_TIMEOUT',
    'NODE_PG_FORCE_NATIVE'
]);
const POSTGRES_PROTOCOLS = new Set(['postgres:', 'postgresql:']);
const DNS_LABEL_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

const hasOwn = (value, key) => Object.prototype.hasOwnProperty.call(value || {}, key);
const hasConfiguredName = (value, key) => {
    try {
        return hasOwn(value, key) || key in Object(value);
    } catch (_) {
        return true;
    }
};
const isTruthy = (value) => TRUTHY_VALUES.has(String(value || '').trim().toLowerCase());
const normalizeLower = (value) => String(value || '').trim().toLowerCase();

const readOwnString = (environment, name) => {
    if (!hasOwn(environment, name)) return Object.freeze({ present: false, readable: true, value: '' });
    try {
        const descriptor = Object.getOwnPropertyDescriptor(environment, name);
        if (descriptor && (typeof descriptor.get === 'function' || typeof descriptor.set === 'function')) {
            return Object.freeze({ present: true, readable: false, value: '' });
        }
        const value = environment[name];
        return Object.freeze({
            present: true,
            readable: true,
            value: value === undefined || value === null ? '' : String(value)
        });
    } catch (_) {
        return Object.freeze({ present: true, readable: false, value: '' });
    }
};

const parseDatabaseUrl = (value) => {
    if (!value) return null;
    try {
        return new URL(value);
    } catch (_) {
        return null;
    }
};

const decodeUrlPart = (value) => {
    try {
        return Object.freeze({ valid: true, value: decodeURIComponent(value) });
    } catch (_) {
        return Object.freeze({ valid: false, value: '' });
    }
};

const normalizeDatabaseName = (value) => {
    const raw = String(value || '').replace(/^\/+/, '').trim();
    return raw || '';
};

const isLocalHost = (host) => LOCAL_HOSTS.has(normalizeLower(host));
const isSupabaseHost = (host) => (
    /(^db\.[a-z0-9]+\.supabase\.co$|\.pooler\.supabase\.com$)/i.test(String(host || ''))
);
const isNamedLocalDatabase = (database) => Boolean(database && database !== 'postgres');

const isDnsHostname = (host) => {
    const normalized = normalizeLower(host);
    if (!normalized || normalized !== String(host || '') || normalized.length > 253) return false;
    if (net.isIP(normalized) !== 0 || isLocalHost(normalized)) return false;
    const labels = normalized.split('.');
    const numericLookalike = labels.every((label) => /^(?:0x[0-9a-f]+|\d+)$/i.test(label));
    return (
        labels.length >= 2 &&
        !numericLookalike &&
        labels.every((label) => DNS_LABEL_PATTERN.test(label))
    );
};

const parsePort = (value, fallback = 5432) => {
    const raw = String(value === undefined || value === null ? '' : value).trim();
    if (!raw) return fallback;
    if (!/^\d+$/.test(raw)) return null;
    const parsed = Number(raw);
    return Number.isInteger(parsed) && parsed >= 1 && parsed <= 65535 ? parsed : null;
};

const definePoolConfig = (target, poolConfig) => {
    const safePoolConfig = Object.create(null);
    for (const [name, value] of Object.entries(poolConfig)) {
        if (name === 'ssl' && value && typeof value === 'object') {
            const safeSsl = Object.create(null);
            for (const [sslName, sslValue] of Object.entries(value)) {
                safeSsl[sslName] = sslValue;
            }
            safePoolConfig[name] = Object.freeze(safeSsl);
        } else {
            safePoolConfig[name] = value;
        }
    }
    Object.defineProperty(target, 'poolConfig', {
        configurable: false,
        enumerable: false,
        writable: false,
        value: Object.freeze(safePoolConfig)
    });
    return target;
};

const createTarget = ({
    host = '',
    port = 5432,
    database = '',
    hasDatabaseConfig = false,
    local = false,
    remoteRelease = false,
    tlsEnabled = false,
    tlsVerified = false,
    attested = false,
    errorCodes = [],
    poolConfig
}) => {
    const normalizedHost = normalizeLower(host);
    const target = {
        host: normalizedHost,
        port,
        database,
        hasDatabaseConfig,
        isLocalHost: isLocalHost(normalizedHost),
        isSupabaseHost: isSupabaseHost(normalizedHost),
        label: normalizedHost
            ? `${normalizedHost}:${port}/${database || 'postgres'}`
            : 'DATABASE_URL veya DB_HOST tanimli degil',
        local,
        remoteRelease,
        tlsEnabled,
        tlsVerified,
        attested,
        errorCodes: Object.freeze([...new Set(errorCodes)])
    };
    if (poolConfig) definePoolConfig(target, poolConfig);
    return Object.freeze(target);
};

const resolveUrlParts = (parsed) => {
    if (!parsed) return null;
    const username = decodeUrlPart(parsed.username);
    const password = decodeUrlPart(parsed.password);
    const database = decodeUrlPart(normalizeDatabaseName(parsed.pathname));
    return Object.freeze({
        username,
        password,
        database
    });
};

const resolveHermeticLocalTest = (environment, parsedUrl) => {
    if (
        normalizeLower(readOwnString(environment, 'NODE_ENV').value) !== 'test' ||
        isTruthy(readOwnString(environment, 'NOVASTORE_ALLOW_REMOTE_DB').value)
    ) return false;

    const hostEntry = readOwnString(environment, 'DB_HOST');
    const databaseEntry = readOwnString(environment, 'DB_NAME');
    if (
        !hostEntry.readable ||
        !databaseEntry.readable ||
        !isLocalHost(hostEntry.value) ||
        !isNamedLocalDatabase(databaseEntry.value.trim())
    ) return false;

    if (parsedUrl) {
        const urlParts = resolveUrlParts(parsedUrl);
        if (
            !POSTGRES_PROTOCOLS.has(parsedUrl.protocol) ||
            !isLocalHost(parsedUrl.hostname) ||
            !urlParts.database.valid ||
            !isNamedLocalDatabase(urlParts.database.value)
        ) return false;
    }
    return true;
};

const resolveRemoteTarget = (environment, parsedUrl) => {
    const errorCodes = [];
    const presentOverrides = REMOTE_DATABASE_OVERRIDE_NAMES.filter(
        (name) => hasConfiguredName(environment, name)
    );
    if (presentOverrides.length > 0) errorCodes.push('REMOTE_DATABASE_OVERRIDE_PRESENT');

    if (!hasOwn(environment, 'DATABASE_URL') || !parsedUrl) {
        errorCodes.push('REMOTE_DATABASE_URL_REQUIRED');
    }

    const expectedHostEntry = readOwnString(environment, 'NOVASTORE_EXPECTED_DATABASE_HOST');
    const expectedDatabaseEntry = readOwnString(environment, 'NOVASTORE_EXPECTED_DATABASE_NAME');
    const expectedHost = normalizeLower(expectedHostEntry.value);
    const expectedDatabase = expectedDatabaseEntry.value;

    if (
        !expectedHostEntry.present ||
        !expectedHostEntry.readable ||
        !expectedHost ||
        expectedHost !== expectedHostEntry.value
    ) {
        errorCodes.push('EXPECTED_DATABASE_HOST_REQUIRED');
    }
    if (
        !expectedDatabaseEntry.present ||
        !expectedDatabaseEntry.readable ||
        !expectedDatabase ||
        expectedDatabase !== expectedDatabase.trim()
    ) {
        errorCodes.push('EXPECTED_DATABASE_NAME_REQUIRED');
    }

    let host = '';
    let port = 5432;
    let database = '';
    let username = '';
    let password = '';
    if (parsedUrl) {
        host = normalizeLower(parsedUrl.hostname);
        const urlParts = resolveUrlParts(parsedUrl);
        const parsedPort = parsePort(parsedUrl.port, 5432);

        if (!POSTGRES_PROTOCOLS.has(parsedUrl.protocol)) {
            errorCodes.push('DATABASE_URL_PROTOCOL_INVALID');
        }
        if (!isDnsHostname(host)) {
            errorCodes.push('REMOTE_DATABASE_HOST_NOT_DNS');
        }
        if (!expectedHost || host !== expectedHost) {
            errorCodes.push('DATABASE_HOST_ATTESTATION_MISMATCH');
        }
        if (!urlParts.database.valid || !urlParts.database.value) {
            errorCodes.push('DATABASE_URL_NAME_INVALID');
        } else {
            database = urlParts.database.value;
        }
        if (!expectedDatabase || database !== expectedDatabase) {
            errorCodes.push('DATABASE_NAME_ATTESTATION_MISMATCH');
        }
        if (!urlParts.username.valid || !urlParts.username.value) {
            errorCodes.push('DATABASE_URL_USERNAME_REQUIRED');
        } else {
            username = urlParts.username.value;
        }
        if (!urlParts.password.valid) {
            errorCodes.push('DATABASE_URL_CREDENTIAL_ENCODING_INVALID');
        } else {
            password = urlParts.password.value;
        }
        if (parsedPort === null) {
            errorCodes.push('DATABASE_URL_PORT_INVALID');
        } else {
            port = parsedPort;
        }
        if (parsedUrl.hash) {
            errorCodes.push('DATABASE_URL_FRAGMENT_FORBIDDEN');
        }
        if (parsedUrl.search !== '?sslmode=verify-full') {
            errorCodes.push('REMOTE_TLS_QUERY_INVALID');
        }
    }

    const valid = errorCodes.length === 0;
    return createTarget({
        host,
        port,
        database,
        hasDatabaseConfig: Boolean(parsedUrl),
        local: false,
        remoteRelease: true,
        tlsEnabled: valid,
        tlsVerified: valid,
        attested: valid,
        errorCodes,
        poolConfig: valid ? {
            host,
            port,
            user: username,
            password: password === '' ? async () => '' : password,
            database,
            ssl: { rejectUnauthorized: true },
            sslnegotiation: 'postgres',
            client_encoding: 'UTF8',
            replication: 'false',
            application_name: 'novastore_runtime',
            options: '-c search_path=pg_catalog,public',
            connectionTimeoutMillis: 10000,
            keepAlive: true
        } : undefined
    });
};

const resolveLocalTarget = (environment, parsedUrl) => {
    const errorCodes = [];
    const read = (name) => {
        const entry = readOwnString(environment, name);
        if (!entry.readable) errorCodes.push('DATABASE_TARGET_VALUE_UNREADABLE');
        return entry.value;
    };
    const databaseUrlValue = read('DATABASE_URL');
    const dbHost = read('DB_HOST');
    const dbPort = read('DB_PORT');
    const dbName = read('DB_NAME');
    const dbUser = read('DB_USER');
    const dbPasswordEntry = readOwnString(environment, 'DB_PASSWORD');
    if (!dbPasswordEntry.readable) errorCodes.push('DATABASE_TARGET_VALUE_UNREADABLE');
    const pgHost = read('PGHOST');
    const pgPort = read('PGPORT');
    const pgDatabase = read('PGDATABASE');
    const pgUser = read('PGUSER');
    const pgPasswordEntry = readOwnString(environment, 'PGPASSWORD');
    if (!pgPasswordEntry.readable) errorCodes.push('DATABASE_TARGET_VALUE_UNREADABLE');
    const usePooler = isTruthy(read('SUPABASE_USE_POOLER'));
    const poolerHostValue = read('SUPABASE_POOLER_HOST');
    const poolerRegion = read('SUPABASE_REGION');
    const poolerHost = poolerHostValue || (poolerRegion ? `aws-0-${poolerRegion}.pooler.supabase.com` : '');
    const shouldUsePooler = usePooler || Boolean(poolerHost);
    const urlParts = resolveUrlParts(parsedUrl);

    if (databaseUrlValue && !parsedUrl) errorCodes.push('DATABASE_URL_MALFORMED');
    if (parsedUrl && !POSTGRES_PROTOCOLS.has(parsedUrl.protocol)) {
        errorCodes.push('DATABASE_URL_PROTOCOL_INVALID');
    }
    if (
        dbHost &&
        parsedUrl &&
        !isLocalHost(parsedUrl.hostname) &&
        isLocalHost(dbHost)
    ) {
        errorCodes.push('LOCAL_TARGET_REMOTE_URL_CONFLICT');
    }

    const host = normalizeLower(
        dbHost ||
        (shouldUsePooler ? poolerHost : '') ||
        parsedUrl?.hostname ||
        pgHost ||
        ''
    );
    const configuredDatabase = (
        dbName ||
        (urlParts?.database.valid ? urlParts.database.value : '') ||
        pgDatabase ||
        ''
    ).trim();
    const urlPort = host === normalizeLower(parsedUrl?.hostname) ? parsedUrl?.port : '';
    const port = parsePort(dbPort || urlPort || pgPort, 5432);
    if (port === null) errorCodes.push('DATABASE_PORT_INVALID');
    if (urlParts && (!urlParts.username.valid || !urlParts.password.valid || !urlParts.database.valid)) {
        errorCodes.push('DATABASE_URL_ENCODING_INVALID');
    }

    const tlsEnabled = !isLocalHost(host) && normalizeLower(read('DB_SSL')) !== 'false';
    const database = configuredDatabase || (host ? 'postgres' : '');
    const user = dbUser || (urlParts?.username.valid ? urlParts.username.value : '') || pgUser || 'postgres';
    const password = dbPasswordEntry.present
        ? dbPasswordEntry.value
        : (urlParts?.password.valid ? urlParts.password.value : pgPasswordEntry.value);
    const hasDatabaseConfig = Boolean(databaseUrlValue || dbHost || pgHost || (shouldUsePooler && poolerHost));

    return createTarget({
        host,
        port: port || 5432,
        database,
        hasDatabaseConfig,
        local: isLocalHost(host),
        remoteRelease: false,
        tlsEnabled,
        tlsVerified: false,
        attested: false,
        errorCodes,
        poolConfig: host && port && database && errorCodes.length === 0 ? {
            host,
            port,
            user,
            password: password || '',
            database,
            ssl: tlsEnabled ? { rejectUnauthorized: false } : false,
            keepAlive: true
        } : undefined
    });
};

const resolveDatabaseTarget = (environment = process.env) => {
    const databaseUrlEntry = readOwnString(environment, 'DATABASE_URL');
    const parsedUrl = databaseUrlEntry.readable ? parseDatabaseUrl(databaseUrlEntry.value) : null;
    const nodeEnv = normalizeLower(readOwnString(environment, 'NODE_ENV').value);
    const deployEnvironment = normalizeLower(readOwnString(environment, 'NOVASTORE_DEPLOY_ENV').value);
    const allowRemoteDatabase = isTruthy(readOwnString(environment, 'NOVASTORE_ALLOW_REMOTE_DB').value);
    const hermeticLocalTest = resolveHermeticLocalTest(environment, parsedUrl);
    const urlIsRemote = Boolean(parsedUrl && !isLocalHost(parsedUrl.hostname));
    const localCandidate = resolveLocalTarget(environment, parsedUrl);
    const remoteOverrideSignal = REMOTE_DATABASE_OVERRIDE_NAMES.some(
        (name) => hasConfiguredName(environment, name)
    );
    const remoteRelease = !hermeticLocalTest && (
        deployEnvironment === 'staging' ||
        nodeEnv === 'production' ||
        (
            allowRemoteDatabase &&
            (
                urlIsRemote ||
                (localCandidate.hasDatabaseConfig && !localCandidate.isLocalHost) ||
                (!localCandidate.hasDatabaseConfig && remoteOverrideSignal)
            )
        )
    );

    return remoteRelease
        ? resolveRemoteTarget(environment, parsedUrl)
        : localCandidate;
};

const getDatabaseTarget = (environment = process.env) => resolveDatabaseTarget(environment);

const isSafeLocalDatabase = (target) => (
    Boolean(target?.hasDatabaseConfig) &&
    Boolean(target?.isLocalHost) &&
    isNamedLocalDatabase(target?.database)
);

const applyDevelopmentPreviewFallback = (environment = process.env) => {
    const nodeEnv = normalizeLower(readOwnString(environment, 'NODE_ENV').value);
    const target = resolveDatabaseTarget(environment);
    const deployEnvironment = normalizeLower(readOwnString(environment, 'NOVASTORE_DEPLOY_ENV').value);
    const localPreviewRequested = isTruthy(readOwnString(environment, 'NOVASTORE_LOCAL_PREVIEW').value);
    const allowRemoteDatabase = isTruthy(readOwnString(environment, 'NOVASTORE_ALLOW_REMOTE_DB').value);

    if (
        deployEnvironment === 'staging' ||
        nodeEnv !== 'development' ||
        !localPreviewRequested ||
        !target.isSupabaseHost ||
        allowRemoteDatabase
    ) {
        return {
            applied: false,
            originalTarget: target
        };
    }

    environment.DATABASE_URL = 'postgresql://novastore_preview:novastore_preview@127.0.0.1:55432/novastore_preview';
    environment.DB_HOST = '127.0.0.1';
    environment.DB_PORT = '55432';
    environment.DB_NAME = 'novastore_preview';
    environment.DB_USER = 'novastore_preview';
    environment.DB_PASSWORD = 'novastore_preview';
    environment.DB_SSL = 'false';
    environment.SUPABASE_USE_POOLER = 'false';
    environment.SUPABASE_POOLER_HOST = '';
    environment.SUPABASE_REGION = '';
    environment.SUPABASE_PROJECT_REF = '';
    environment.NOVASTORE_SAFE_LOCAL_BACKEND = 'false';
    environment.NOVASTORE_ALLOW_REMOTE_DB = 'false';
    environment.SKIP_SCHEMA_INIT = 'true';
    environment.NOVASTORE_ALLOW_SCHEMA_INIT = 'false';
    environment.NOVASTORE_LOCAL_PREVIEW = 'true';

    return {
        applied: true,
        originalTarget: target,
        previewTarget: resolveDatabaseTarget(environment)
    };
};

const mapTargetErrors = (target) => {
    if (!target.errorCodes.length) return [];
    if (target.remoteRelease) {
        return [
            `Remote database attestation/TLS validation failed: ${target.errorCodes.join(', ')}.`
        ];
    }
    return target.errorCodes.map((code) => `Database target validation failed: ${code}.`);
};

const resolveStartupSafety = (environment = process.env) => {
    const explicitNodeEnv = normalizeLower(readOwnString(environment, 'NODE_ENV').value);
    const nodeEnv = explicitNodeEnv || 'development';
    const target = resolveDatabaseTarget(environment);
    const safeLocalMode = isTruthy(readOwnString(environment, 'NOVASTORE_SAFE_LOCAL_BACKEND').value);
    const localPreviewMode = isTruthy(readOwnString(environment, 'NOVASTORE_LOCAL_PREVIEW').value);
    const allowRemoteDatabase = isTruthy(readOwnString(environment, 'NOVASTORE_ALLOW_REMOTE_DB').value);
    const skipSchemaInit = isTruthy(readOwnString(environment, 'SKIP_SCHEMA_INIT').value);
    const allowSchemaInit = isTruthy(readOwnString(environment, 'NOVASTORE_ALLOW_SCHEMA_INIT').value);
    const isProduction = nodeEnv === 'production';
    const safeLocalDatabase = isSafeLocalDatabase(target);
    const isPreviewSinkTarget =
        target.host === '127.0.0.1' &&
        String(target.port) === '55432' &&
        target.database === 'novastore_preview';
    const errors = [...mapTargetErrors(target)];
    const warnings = [];
    const stagingRuntimePolicy = resolveStagingRuntimePolicy(environment);

    errors.push(...stagingRuntimePolicy.errors);

    if (!target.hasDatabaseConfig) {
        errors.push('Acik bir DATABASE_URL veya DB_HOST tanimi gerekli.');
    } else if (!target.isLocalHost && !target.remoteRelease && !allowRemoteDatabase) {
        errors.push('Remote veritabani varsayilan olarak reddedildi.');
    }

    if (target.remoteRelease && !target.attested) {
        // The resolver supplies the exact names-only failure above.
    } else if (target.remoteRelease && (!target.tlsEnabled || !target.tlsVerified)) {
        errors.push('Remote database attestation/TLS validation failed: REMOTE_TLS_NOT_VERIFIED.');
    }

    if (safeLocalMode) {
        if (isProduction) {
            errors.push('NOVASTORE_SAFE_LOCAL_BACKEND production ortaminda kullanilamaz.');
        }
        if (!safeLocalDatabase) {
            errors.push('Safe local backend yalnizca local ve isimli test/dev DB ile baslatilabilir.');
        }
        if (target.isSupabaseHost) {
            errors.push('Safe local backend Supabase veya remote pooler DB ile baslatilamaz.');
        }
    }

    if (localPreviewMode) {
        if (explicitNodeEnv !== 'development') {
            errors.push('Local preview yalnizca acik NODE_ENV=development ile kullanilabilir.');
        }
        if (allowRemoteDatabase) {
            errors.push('NOVASTORE_LOCAL_PREVIEW ve NOVASTORE_ALLOW_REMOTE_DB birlikte kullanilamaz.');
        }
        if (!isPreviewSinkTarget) {
            errors.push('Local preview yalnizca 127.0.0.1:55432/novastore_preview sink hedefini kullanabilir.');
        }
        if (!skipSchemaInit || allowSchemaInit) {
            errors.push('Local preview schema init calistiramaz; SKIP_SCHEMA_INIT=true ve NOVASTORE_ALLOW_SCHEMA_INIT=false gerekir.');
        }
        if (safeLocalMode) {
            errors.push('NOVASTORE_LOCAL_PREVIEW ve NOVASTORE_SAFE_LOCAL_BACKEND birlikte kullanilamaz.');
        }
    }

    if (isProduction && allowSchemaInit) {
        errors.push('Production ortaminda schema init izni reddedildi.');
    }

    if (!safeLocalDatabase && allowSchemaInit) {
        errors.push('Schema init yalnizca local ve isimli test/dev DB icin calisabilir.');
    }

    if (!skipSchemaInit && !allowSchemaInit) {
        warnings.push('Schema init atlanacak. Calistirmak icin NOVASTORE_ALLOW_SCHEMA_INIT=true ve local/test DB gerekir.');
    }

    const shouldRunSchemaInit =
        !stagingRuntimePolicy.isStaging &&
        !localPreviewMode &&
        !skipSchemaInit &&
        allowSchemaInit &&
        safeLocalDatabase &&
        !isProduction;

    return Object.freeze({
        canStart: errors.length === 0,
        errors: Object.freeze(errors),
        warnings: Object.freeze(warnings),
        nodeEnv,
        safeLocalMode,
        localPreviewMode,
        allowRemoteDatabase,
        skipSchemaInit,
        allowSchemaInit,
        shouldRunSchemaInit,
        shouldVerifyDbConnection: target.remoteRelease
            ? true
            : (localPreviewMode ? false : !skipSchemaInit || safeLocalMode),
        target,
        safeLocalDatabase,
        isPreviewSinkTarget,
        stagingRuntimePolicy
    });
};

module.exports = {
    REMOTE_DATABASE_OVERRIDE_NAMES,
    applyDevelopmentPreviewFallback,
    getDatabaseTarget,
    isSafeLocalDatabase,
    isTruthy,
    resolveDatabaseTarget,
    resolveStartupSafety
};
