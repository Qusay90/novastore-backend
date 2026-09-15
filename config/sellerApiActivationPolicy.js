'use strict';

const net = require('node:net');

const SUPPORTED_MODES = new Set(['local', 'uat', 'production']);
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '0.0.0.0', 'host.docker.internal']);

class SellerApiActivationError extends Error {
    constructor(code) {
        super(code);
        this.name = 'SellerApiActivationError';
        this.code = code;
    }
}

const fail = (code) => { throw new SellerApiActivationError(code); };
const normalize = (value) => String(value || '').trim().toLowerCase();
const parseBoolean = (environment, name, { required = false } = {}) => {
    const raw = normalize(environment?.[name]);
    if (!raw) {
        if (required) fail(`${name}_REQUIRED`);
        return false;
    }
    if (raw === 'true') return true;
    if (raw === 'false') return false;
    fail(`${name}_INVALID`);
};

const parseExternalOrigin = (value) => {
    const raw = String(value || '').trim();
    if (!raw) return null;
    try {
        const parsed = new URL(raw);
        const hostname = normalize(parsed.hostname);
        if (
            parsed.protocol !== 'https:' ||
            parsed.username ||
            parsed.password ||
            parsed.pathname !== '/' ||
            parsed.search ||
            parsed.hash ||
            !hostname ||
            LOCAL_HOSTS.has(hostname) ||
            net.isIP(hostname) !== 0 ||
            !hostname.includes('.')
        ) return null;
        return parsed.origin;
    } catch (_) {
        return null;
    }
};

const parseTrustedIngressCidrs = (value) => {
    const rawEntries = String(value || '').split(',').map((entry) => entry.trim()).filter(Boolean);
    if (rawEntries.length === 0 || rawEntries.length > 32) fail('SELLER_API_TRUSTED_INGRESS_CIDRS_INVALID');
    const normalizedEntries = rawEntries.map((entry) => {
        const slash = entry.lastIndexOf('/');
        const address = slash === -1 ? entry : entry.slice(0, slash);
        const family = net.isIP(address);
        const prefixRaw = slash === -1 ? String(family === 4 ? 32 : 128) : entry.slice(slash + 1);
        if (!family || !/^\d{1,3}$/u.test(prefixRaw)) fail('SELLER_API_TRUSTED_INGRESS_CIDRS_INVALID');
        const prefix = Number(prefixRaw);
        const maximum = family === 4 ? 32 : 128;
        const minimum = family === 4 ? 24 : 64;
        if (!Number.isSafeInteger(prefix) || prefix < minimum || prefix > maximum) {
            fail('SELLER_API_TRUSTED_INGRESS_CIDRS_INVALID');
        }
        return `${address}/${prefix}`;
    });
    if (new Set(normalizedEntries).size !== normalizedEntries.length) {
        fail('SELLER_API_TRUSTED_INGRESS_CIDRS_INVALID');
    }
    return Object.freeze(normalizedEntries);
};

const requireStrongTokenSecret = (environment) => {
    const secret = String(environment?.SELLER_ACCESS_TOKEN_SECRET || '');
    if (secret.length < 32) fail('SELLER_ACCESS_TOKEN_SECRET_REQUIRED');
};

const requireRemoteSecuritySecrets = (environment) => {
    const names = [
        'JWT_SECRET',
        'SELLER_ACCESS_TOKEN_SECRET',
        'SELLER_PASSWORD_RECOVERY_SECRET',
        'SELLER_APPLICATION_AUTH_SECRET'
    ];
    const values = names.map((name) => String(environment?.[name] || ''));
    if (values.some((value) => value.length < 32)) fail('SELLER_API_SECURITY_SECRETS_REQUIRED');
    if (new Set(values).size !== values.length) fail('SELLER_API_SECURITY_SECRETS_NOT_INDEPENDENT');
};

const requireLocalRuntime = ({ nodeEnv, localOnly, startupSafety, bindHost }) => {
    if (!['development', 'test'].includes(nodeEnv)) fail('SELLER_API_LOCAL_ENVIRONMENT_INVALID');
    if (!localOnly) fail('SELLER_API_LOCAL_ONLY_REQUIRED');
    if (!startupSafety?.safeLocalDatabase || startupSafety?.target?.remoteRelease) {
        fail('SELLER_API_LOCAL_DATABASE_IDENTITY_INVALID');
    }
    if (startupSafety?.allowRemoteDatabase) fail('SELLER_API_LOCAL_REMOTE_DATABASE_CAPABILITY_FORBIDDEN');
    if (bindHost !== '127.0.0.1') fail('SELLER_API_LOCAL_BIND_HOST_INVALID');
};

const requireRemoteRuntime = ({
    environment,
    localOnly,
    startupSafety,
    trustedProxyHops,
    trustedIngressCidrs,
    externalOrigin,
    bindHost
}) => {
    const target = startupSafety?.target;
    if (localOnly) fail('SELLER_API_REMOTE_LOCAL_ONLY_CONFLICT');
    if (
        !target ||
        target.local ||
        !target.remoteRelease ||
        !target.attested ||
        !target.tlsEnabled ||
        !target.tlsVerified
    ) fail('SELLER_API_REMOTE_DATABASE_IDENTITY_INVALID');
    if (['localhost', '127.0.0.1', '::1', 'host.docker.internal'].includes(normalize(bindHost))) {
        fail('SELLER_API_REMOTE_BIND_HOST_INVALID');
    }
    if (!externalOrigin) fail('SELLER_API_EXTERNAL_ORIGIN_INVALID');
    if (!Number.isSafeInteger(trustedProxyHops) || trustedProxyHops < 1 || trustedProxyHops > 8) {
        fail('SELLER_API_TRUST_PROXY_REQUIRED');
    }
    if (!trustedIngressCidrs.length) fail('SELLER_API_TRUSTED_INGRESS_CIDRS_INVALID');
    requireRemoteSecuritySecrets(environment);
};

const disabledPolicy = () => Object.freeze({
    enabled: false,
    mode: 'disabled',
    localOnly: false,
    requiresConnectedDatabaseIdentity: false,
    requiresSecureTransport: false,
    externalOrigin: null,
    trustedIngressCidrs: Object.freeze([])
});

const resolveSellerApiActivationPolicy = ({
    environment = process.env,
    startupSafety,
    bindHost = String(environment?.NOVASTORE_BIND_HOST || '').trim(),
    trustedProxyHops = 0
} = {}) => {
    const enabled = parseBoolean(environment, 'SELLER_API_V1_ENABLED');
    if (!enabled) return disabledPolicy();

    const localOnly = parseBoolean(environment, 'SELLER_API_V1_LOCAL_ONLY', { required: true });
    const configuredMode = normalize(environment.SELLER_API_V1_ACTIVATION_MODE);
    const mode = configuredMode || (localOnly ? 'local' : '');
    if (!SUPPORTED_MODES.has(mode)) fail('SELLER_API_ACTIVATION_MODE_INVALID');
    if (!startupSafety?.canStart) fail('SELLER_API_STARTUP_SAFETY_REQUIRED');
    requireStrongTokenSecret(environment);

    const nodeEnv = normalize(environment.NODE_ENV) || 'development';
    const deployEnv = normalize(environment.NOVASTORE_DEPLOY_ENV);
    const externalOrigin = parseExternalOrigin(environment.SELLER_API_V1_EXTERNAL_ORIGIN);
    const trustedIngressCidrs = mode === 'local' || (mode === 'uat' && startupSafety.target?.isLocalHost)
        ? Object.freeze([])
        : parseTrustedIngressCidrs(environment.SELLER_API_V1_TRUSTED_INGRESS_CIDRS);

    if (mode === 'local') {
        requireLocalRuntime({ nodeEnv, localOnly, startupSafety, bindHost });
    } else if (mode === 'uat' && startupSafety.target?.isLocalHost) {
        if (nodeEnv !== 'test') fail('SELLER_API_UAT_ENVIRONMENT_INVALID');
        requireLocalRuntime({ nodeEnv, localOnly, startupSafety, bindHost });
    } else {
        if (mode === 'uat' && (nodeEnv !== 'production' || deployEnv !== 'staging')) {
            fail('SELLER_API_UAT_ENVIRONMENT_INVALID');
        }
        if (mode === 'production' && (nodeEnv !== 'production' || deployEnv !== 'production')) {
            fail('SELLER_API_PRODUCTION_ENVIRONMENT_INVALID');
        }
        requireRemoteRuntime({
            environment,
            localOnly,
            startupSafety,
            trustedProxyHops,
            trustedIngressCidrs,
            externalOrigin,
            bindHost
        });
    }

    return Object.freeze({
        enabled: true,
        mode,
        localOnly,
        requiresConnectedDatabaseIdentity: true,
        requiresSecureTransport: mode === 'production' || (mode === 'uat' && !startupSafety.target.isLocalHost),
        externalOrigin,
        trustedIngressCidrs
    });
};

module.exports = Object.freeze({
    SellerApiActivationError,
    parseExternalOrigin,
    parseTrustedIngressCidrs,
    resolveSellerApiActivationPolicy
});
