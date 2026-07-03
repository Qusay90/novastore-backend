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
    const useSupabasePooler =
        isTruthy(env.SUPABASE_USE_POOLER) ||
        Boolean(env.SUPABASE_POOLER_HOST || env.SUPABASE_REGION);
    const poolerHost =
        env.SUPABASE_POOLER_HOST ||
        (env.SUPABASE_REGION ? `aws-0-${env.SUPABASE_REGION}.pooler.supabase.com` : '');
    const host =
        env.DB_HOST ||
        (useSupabasePooler && poolerHost ? poolerHost : '') ||
        parsed?.hostname ||
        env.PGHOST ||
        '';
    const database =
        env.DB_NAME ||
        normalizeDatabaseName(parsed?.pathname) ||
        env.PGDATABASE ||
        '';
    const port = env.DB_PORT || (host === parsed?.hostname ? parsed?.port : '') || env.PGPORT || '5432';

    return {
        host,
        database,
        port,
        hasDatabaseConfig: Boolean(
            env.DATABASE_URL ||
            env.DB_HOST ||
            env.PGHOST ||
            (useSupabasePooler && poolerHost)
        ),
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

const applyDevelopmentPreviewFallback = (env = process.env) => {
    const nodeEnv = String(env.NODE_ENV || '').trim().toLowerCase();
    const target = getDatabaseTarget(env);
    const localPreviewRequested = isTruthy(env.NOVASTORE_LOCAL_PREVIEW);
    const allowRemoteDatabase = isTruthy(env.NOVASTORE_ALLOW_REMOTE_DB);

    if (
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

    env.DATABASE_URL = 'postgresql://novastore_preview:novastore_preview@127.0.0.1:55432/novastore_preview';
    env.DB_HOST = '127.0.0.1';
    env.DB_PORT = '55432';
    env.DB_NAME = 'novastore_preview';
    env.DB_USER = 'novastore_preview';
    env.DB_PASSWORD = 'novastore_preview';
    env.DB_SSL = 'false';
    env.SUPABASE_USE_POOLER = 'false';
    env.SUPABASE_POOLER_HOST = '';
    env.SUPABASE_REGION = '';
    env.SUPABASE_PROJECT_REF = '';
    env.NOVASTORE_SAFE_LOCAL_BACKEND = 'false';
    env.NOVASTORE_ALLOW_REMOTE_DB = 'false';
    env.SKIP_SCHEMA_INIT = 'true';
    env.NOVASTORE_ALLOW_SCHEMA_INIT = 'false';
    env.NOVASTORE_LOCAL_PREVIEW = 'true';

    return {
        applied: true,
        originalTarget: target,
        previewTarget: getDatabaseTarget(env)
    };
};

const resolveStartupSafety = (env = process.env) => {
    const explicitNodeEnv = String(env.NODE_ENV || '').trim().toLowerCase();
    const nodeEnv = explicitNodeEnv || 'development';
    const target = getDatabaseTarget(env);
    const safeLocalMode = isTruthy(env.NOVASTORE_SAFE_LOCAL_BACKEND);
    const localPreviewMode = isTruthy(env.NOVASTORE_LOCAL_PREVIEW);
    const allowRemoteDatabase = isTruthy(env.NOVASTORE_ALLOW_REMOTE_DB);
    const skipSchemaInit = isTruthy(env.SKIP_SCHEMA_INIT);
    const allowSchemaInit = isTruthy(env.NOVASTORE_ALLOW_SCHEMA_INIT);
    const isProduction = nodeEnv === 'production';
    const safeLocalDatabase = isSafeLocalDatabase(target);
    const isPreviewSinkTarget =
        String(target.host || '').toLowerCase() === '127.0.0.1' &&
        String(target.port || '') === '55432' &&
        target.database === 'novastore_preview';
    const errors = [];
    const warnings = [];

    if (!target.hasDatabaseConfig) {
        errors.push('Acik bir DATABASE_URL veya DB_HOST tanimi gerekli.');
    } else if (!target.isLocalHost && !allowRemoteDatabase) {
        errors.push(
            `Remote veritabani varsayilan olarak reddedildi. ` +
            `Yalnizca bilincli kullanim icin NOVASTORE_ALLOW_REMOTE_DB=true ayarlanabilir. Hedef: ${target.label}`
        );
    }

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

    if (localPreviewMode) {
        if (explicitNodeEnv !== 'development') {
            errors.push('Local preview yalnizca acik NODE_ENV=development ile kullanilabilir.');
        }
        if (allowRemoteDatabase) {
            errors.push('NOVASTORE_LOCAL_PREVIEW ve NOVASTORE_ALLOW_REMOTE_DB birlikte kullanilamaz.');
        }
        if (!isPreviewSinkTarget) {
            errors.push(
                `Local preview yalnizca 127.0.0.1:55432/novastore_preview sink hedefini kullanabilir. ` +
                `Hedef: ${target.label}`
            );
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
        errors.push(`Schema init yalnizca local ve isimli test/dev DB icin calisabilir. Hedef: ${target.label}`);
    }

    if (!skipSchemaInit && !allowSchemaInit) {
        warnings.push('Schema init atlanacak. Calistirmak icin NOVASTORE_ALLOW_SCHEMA_INIT=true ve local/test DB gerekir.');
    }

    const shouldRunSchemaInit =
        !localPreviewMode &&
        !skipSchemaInit &&
        allowSchemaInit &&
        safeLocalDatabase &&
        !isProduction;

    return {
        canStart: errors.length === 0,
        errors,
        warnings,
        nodeEnv,
        safeLocalMode,
        localPreviewMode,
        allowRemoteDatabase,
        skipSchemaInit,
        allowSchemaInit,
        shouldRunSchemaInit,
        shouldVerifyDbConnection: localPreviewMode ? false : !skipSchemaInit || safeLocalMode,
        target,
        safeLocalDatabase,
        isPreviewSinkTarget
    };
};

module.exports = {
    isTruthy,
    getDatabaseTarget,
    isSafeLocalDatabase,
    applyDevelopmentPreviewFallback,
    resolveStartupSafety
};
