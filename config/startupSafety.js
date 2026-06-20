const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '0.0.0.0', 'host.docker.internal']);
const TRUTHY_VALUES = new Set(['1', 'true', 'yes', 'on']);

const isTruthy = (value) => TRUTHY_VALUES.has(String(value || '').trim().toLowerCase());

const parseDatabaseUrl = (value) => {
    if (!value) return null;
    try {
        return new URL(value);
    } catch (_) {
        return null;
    }
};

const normalizeDatabaseName = (value) => {
    const raw = String(value || '').replace(/^\/+/, '').trim();
    return raw || '';
};

const getDatabaseTarget = (env = process.env) => {
    const parsed = parseDatabaseUrl(env.DATABASE_URL);
    const host = env.DB_HOST || parsed?.hostname || '';
    const database = env.DB_NAME || normalizeDatabaseName(parsed?.pathname);
    const port = env.DB_PORT || parsed?.port || '5432';

    return {
        host,
        database,
        port,
        hasDatabaseConfig: Boolean(env.DATABASE_URL || env.DB_HOST),
        isLocalHost: LOCAL_HOSTS.has(String(host).toLowerCase()),
        isSupabaseHost: /(^db\.[a-z0-9]+\.supabase\.co$|\.pooler\.supabase\.com$)/i.test(host),
        label: host ? `${host}:${port}/${database || 'postgres'}` : 'DATABASE_URL veya DB_HOST tanimli degil'
    };
};

const isSafeLocalDatabase = (target) => {
    if (!target.hasDatabaseConfig || !target.isLocalHost) return false;
    if (!target.database) return false;
    if (target.database === 'postgres') return false;
    return true;
};

const resolveStartupSafety = (env = process.env) => {
    const nodeEnv = String(env.NODE_ENV || 'development').toLowerCase();
    const target = getDatabaseTarget(env);
    const safeLocalMode = isTruthy(env.NOVASTORE_SAFE_LOCAL_BACKEND);
    const skipSchemaInit = isTruthy(env.SKIP_SCHEMA_INIT);
    const allowSchemaInit = isTruthy(env.NOVASTORE_ALLOW_SCHEMA_INIT);
    const isProduction = nodeEnv === 'production';
    const safeLocalDatabase = isSafeLocalDatabase(target);
    const errors = [];
    const warnings = [];

    if (safeLocalMode) {
        if (isProduction) {
            errors.push('NOVASTORE_SAFE_LOCAL_BACKEND production ortaminda kullanilamaz.');
        }
        if (!safeLocalDatabase) {
            errors.push(`Safe local backend yalnizca local ve isimli test/dev DB ile baslatilabilir. Hedef: ${target.label}`);
        }
        if (target.isSupabaseHost) {
            errors.push('Safe local backend Supabase veya remote pooler DB ile baslatilamaz.');
        }
    }

    if (isProduction && allowSchemaInit) {
        errors.push('Production ortaminda schema init izni reddedildi.');
    }

    if (!safeLocalDatabase && allowSchemaInit) {
        errors.push(`Schema init yalnizca local ve isimli test/dev DB icin calisabilir. Hedef: ${target.label}`);
    }

    if (!skipSchemaInit && !allowSchemaInit) {
        warnings.push('Schema init atlanacak. Calistirmak icin NOVASTORE_ALLOW_SCHEMA_INIT=true ve local/test DB gerekir.');
    }

    const shouldRunSchemaInit = !skipSchemaInit && allowSchemaInit && safeLocalDatabase && !isProduction;

    return {
        canStart: errors.length === 0,
        errors,
        warnings,
        nodeEnv,
        safeLocalMode,
        skipSchemaInit,
        allowSchemaInit,
        shouldRunSchemaInit,
        shouldVerifyDbConnection: !skipSchemaInit || safeLocalMode,
        target,
        safeLocalDatabase
    };
};

module.exports = {
    isTruthy,
    getDatabaseTarget,
    isSafeLocalDatabase,
    resolveStartupSafety
};
