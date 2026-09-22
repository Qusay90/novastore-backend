'use strict';

const crypto = require('node:crypto');
const dns = require('node:dns');
const http = require('node:http');
const https = require('node:https');
const net = require('node:net');
const {
    createPinnedLookup,
    isUnsafeIpAddress
} = require('../scripts/stagingVerificationHarness');

const CONNECTION_HEADER = 'X-NovaStore-Connection';
const KEY_ID_HEADER = 'X-NovaStore-Key-Id';
const TIMESTAMP_HEADER = 'X-NovaStore-Timestamp';
const NONCE_HEADER = 'X-NovaStore-Nonce';
const SIGNATURE_HEADER = 'X-NovaStore-Signature';
const REQUEST_TIMESTAMP_HEADER = 'X-NovaStore-Request-Timestamp';
const REQUEST_NONCE_HEADER = 'X-NovaStore-Request-Nonce';
const RESPONSE_SIGNATURE_HEADER = 'X-NovaStore-Response-Signature';
const BASE64URL_PATTERN = /^[A-Za-z0-9_-]{16,128}$/u;
const SHA256_PATTERN = /^[0-9a-f]{64}$/u;
const IDENTIFIER_PATTERN = /^[A-Za-z0-9._:-]+$/u;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const LOCAL_HOSTS = new Set(['127.0.0.1']);
const STATUS_PATH_PREFIX = '/api/integrations/novastore/v1/orders/events/';
const EVENT_PATH = '/api/integrations/novastore/v1/orders/events';
const THEME_EVENT_PATH = '/api/integrations/novastore/v1/themes/events';

class StockySystemConnectorError extends Error {
    constructor(code, statusCode = 409, details = null) {
        super(code);
        this.name = 'StockySystemConnectorError';
        this.code = code;
        this.statusCode = statusCode;
        this.details = details;
    }
}

const exactTrue = (value) => String(value || '').trim().toLowerCase() === 'true';
const boundedInteger = (value, fallback, minimum, maximum) => {
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) ? Math.max(minimum, Math.min(parsed, maximum)) : fallback;
};
const requiredText = (value, maximum, code = 'STOCKY_CONNECTOR_INPUT_INVALID') => {
    if (typeof value !== 'string' || value.trim() !== value || value.length < 1 || value.length > maximum) {
        throw new StockySystemConnectorError(code, 400);
    }
    return value;
};
const positiveInteger = (value, code = 'STOCKY_CONNECTOR_INPUT_INVALID') => {
    const parsed = typeof value === 'string' && /^\d+$/u.test(value) ? Number(value) : value;
    if (!Number.isSafeInteger(parsed) || parsed < 1) throw new StockySystemConnectorError(code, 400);
    return parsed;
};
const requiredUuid = (value, code = 'STOCKY_CONNECTOR_INPUT_INVALID') => {
    const normalized = String(value || '').trim().toLowerCase();
    if (!UUID_PATTERN.test(normalized)) throw new StockySystemConnectorError(code, 400);
    return normalized;
};
const stableStringify = (value) => {
    if (value === null || typeof value !== 'object') return JSON.stringify(value);
    if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
};
const sha256Hex = (value) => crypto.createHash('sha256').update(value).digest('hex');
const safeEqual = (left, right) => {
    const a = Buffer.from(String(left || ''), 'utf8');
    const b = Buffer.from(String(right || ''), 'utf8');
    return a.length === b.length && crypto.timingSafeEqual(a, b);
};

const isPublicAddress = (address) => net.isIP(address) !== 0 && !isUnsafeIpAddress(address);

const assertStockyRequestTarget = ({ method, path, body = '' }) => {
    const normalizedMethod = String(method || '').trim().toUpperCase();
    const normalizedPath = requiredText(path, 768, 'STOCKY_CONNECTOR_REQUEST_TARGET_INVALID');
    const eventId = '[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}';
    const statusPattern = new RegExp(`^${STATUS_PATH_PREFIX}${eventId}$`, 'u');
    const receiptPattern = new RegExp(`^${STATUS_PATH_PREFIX}${eventId}/receipt$`, 'u');
    const allowed = (normalizedMethod === 'POST' && normalizedPath === EVENT_PATH)
        || (normalizedMethod === 'GET' && statusPattern.test(normalizedPath) && body === '')
        || (normalizedMethod === 'POST' && receiptPattern.test(normalizedPath));
    if (!allowed || normalizedPath.includes('?') || normalizedPath.includes('#')) {
        throw new StockySystemConnectorError('STOCKY_CONNECTOR_REQUEST_TARGET_INVALID', 400);
    }
    return Object.freeze({ method: normalizedMethod, path: normalizedPath });
};

// A separate, finite transport domain. Order callers retain their original
// allowlist; neither public callers nor environment settings provide URL paths.
const assertStockyThemeRequestTarget = ({ method, path, body = '' }) => {
    const normalizedMethod = String(method || '').trim().toUpperCase();
    const normalizedPath = requiredText(path, 768, 'STOCKY_CONNECTOR_REQUEST_TARGET_INVALID');
    const eventId = '[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}';
    const statusPattern = new RegExp(`^${THEME_EVENT_PATH}/${eventId}$`, 'u');
    const receiptPattern = new RegExp(`^${THEME_EVENT_PATH}/${eventId}/receipt$`, 'u');
    if (!((normalizedMethod === 'POST' && normalizedPath === THEME_EVENT_PATH)
        || (normalizedMethod === 'GET' && statusPattern.test(normalizedPath) && body === '')
        || (normalizedMethod === 'POST' && receiptPattern.test(normalizedPath)))) {
        throw new StockySystemConnectorError('STOCKY_CONNECTOR_REQUEST_TARGET_INVALID', 400);
    }
    return Object.freeze({ method: normalizedMethod, path: normalizedPath });
};

const assertStockyThemeSellerRequestTarget = ({ method, path }) => {
    if (method !== 'POST' || path !== '/api/integrations/novastore/v1/theme-seller-session/introspect') {
        throw new StockySystemConnectorError('STOCKY_CONNECTOR_REQUEST_TARGET_INVALID', 400);
    }
    return Object.freeze({ method, path });
};

const readResponse = (response, maximumBytes = 1024 * 1024) => new Promise((resolve, reject) => {
    const chunks = [];
    let bytes = 0;
    response.on('data', (chunk) => {
        bytes += chunk.length;
        if (bytes > maximumBytes) {
            response.destroy(new StockySystemConnectorError('STOCKY_CONNECTOR_RESPONSE_TOO_LARGE', 502));
            return;
        }
        chunks.push(chunk);
    });
    response.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    response.on('error', reject);
});

const createTransportForDomain = (assertTarget, { lookup = dns.promises.lookup, timeoutMs = 10000 } = {}) => async ({
    url,
    method,
    headers,
    body = '',
    runtime
}) => {
    if (!runtime?.enabled) throw new StockySystemConnectorError('STOCKY_CONNECTOR_DISABLED', 503);
    const endpoint = new URL(url);
    if (endpoint.username || endpoint.password || endpoint.search || endpoint.hash) {
        throw new StockySystemConnectorError('STOCKY_CONNECTOR_REQUEST_TARGET_INVALID', 400);
    }
    validateEndpointOrigin(endpoint.origin, runtime);
    assertTarget({ method, path: endpoint.pathname, body });
    const hostname = endpoint.hostname.toLowerCase().replace(/^\[|\]$/gu, '').replace(/\.$/u, '');
    let pinned = null;
    if (runtime?.localOnly) {
        if (!LOCAL_HOSTS.has(hostname)) throw new StockySystemConnectorError('STOCKY_CONNECTOR_LOCAL_ENDPOINT_INVALID', 400);
    } else {
        const answers = await lookup(hostname, { all: true, verbatim: true });
        if (!Array.isArray(answers) || answers.length === 0 || answers.some((entry) => (
            !isPublicAddress(entry.address) || Number(entry.family) !== net.isIP(entry.address)
        ))) {
            throw new StockySystemConnectorError('STOCKY_CONNECTOR_RESOLVED_ADDRESS_FORBIDDEN', 502);
        }
        pinned = Object.freeze(answers.map((entry) => Object.freeze({ address: entry.address, family: Number(entry.family) })));
    }

    return new Promise((resolve, reject) => {
        const client = endpoint.protocol === 'https:' ? https : http;
        const request = client.request(endpoint, {
            method,
            headers: {
                ...headers,
                'Content-Length': Buffer.byteLength(body)
            },
            lookup: pinned
                ? createPinnedLookup(pinned)
                : undefined,
            servername: endpoint.protocol === 'https:' ? hostname : undefined,
            timeout: timeoutMs
        }, async (response) => {
            try {
                const rawBody = await readResponse(response);
                if (Number(response.statusCode) >= 300 && Number(response.statusCode) < 400) {
                    throw new StockySystemConnectorError('STOCKY_CONNECTOR_REDIRECT_FORBIDDEN', 502);
                }
                resolve(Object.freeze({
                    statusCode: Number(response.statusCode),
                    headers: response.headers,
                    rawBody
                }));
            } catch (error) {
                reject(error);
            }
        });
        request.on('timeout', () => request.destroy(new StockySystemConnectorError('STOCKY_CONNECTOR_TIMEOUT', 504)));
        request.on('error', reject);
        if (body) request.write(body);
        request.end();
    });
};

const createSafeStockyTransport = (options) => createTransportForDomain(assertStockyRequestTarget, options);
const createSafeStockyThemeTransport = (options) => createTransportForDomain(assertStockyThemeRequestTarget, options);
const createSafeStockyThemeSellerTransport = (options) => createTransportForDomain(assertStockyThemeSellerRequestTarget, options);

const parseSecrets = (value) => {
    let parsed;
    try {
        parsed = JSON.parse(String(value || ''));
    } catch (_) {
        throw new StockySystemConnectorError('STOCKY_CONNECTOR_SECRETS_INVALID', 503);
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new StockySystemConnectorError('STOCKY_CONNECTOR_SECRETS_INVALID', 503);
    }
    const secrets = Object.create(null);
    for (const [reference, secret] of Object.entries(parsed)) {
        if (!IDENTIFIER_PATTERN.test(reference)
            || reference.length > 128
            || typeof secret !== 'string'
            || !/^[\x21-\x7e]{32,256}$/u.test(secret)) {
            throw new StockySystemConnectorError('STOCKY_CONNECTOR_SECRETS_INVALID', 503);
        }
        secrets[reference] = secret;
    }
    if (Object.keys(secrets).length === 0) throw new StockySystemConnectorError('STOCKY_CONNECTOR_SECRETS_INVALID', 503);
    return Object.freeze(secrets);
};

const resolveStockySystemCommerceRuntime = ({ environment = process.env, startupSafety = null } = {}) => {
    const enabled = exactTrue(environment.NOVASTORE_STOCKY_SYSTEM_COMMERCE_ENABLED);
    if (!enabled) {
        return Object.freeze({
            enabled: false,
            workerEnabled: false,
            mode: 'disabled',
            localOnly: false,
            manualResultPollIntervalMs: 300000,
            allowedHosts: Object.freeze([]),
            secretsByRef: Object.freeze(Object.create(null))
        });
    }

    const mode = String(environment.NOVASTORE_STOCKY_SYSTEM_COMMERCE_ACTIVATION_MODE || '').trim().toLowerCase();
    const nodeEnvironment = String(environment.NODE_ENV || '').trim().toLowerCase();
    const deployEnvironment = String(environment.NOVASTORE_DEPLOY_ENV || '').trim().toLowerCase();
    const allowedHosts = [...new Set(String(environment.NOVASTORE_STOCKY_SYSTEM_COMMERCE_ALLOWED_HOSTS || '')
        .split(',')
        .map((host) => host.trim().toLowerCase())
        .filter(Boolean))];
    if (!['local', 'uat', 'production'].includes(mode)) {
        throw new StockySystemConnectorError('STOCKY_CONNECTOR_ACTIVATION_MODE_INVALID', 503);
    }

    const localOnly = mode === 'local';
    if (localOnly) {
        const localSafe = ['test', 'development'].includes(nodeEnvironment)
            && exactTrue(environment.NOVASTORE_SAFE_LOCAL_BACKEND)
            && !exactTrue(environment.NOVASTORE_ALLOW_REMOTE_DB)
            && exactTrue(environment.NOVASTORE_STOCKY_SYSTEM_COMMERCE_LOCAL_TRANSPORT_ENABLED)
            && startupSafety?.canStart === true
            && startupSafety?.safeLocalMode === true
            && startupSafety?.safeLocalDatabase === true
            && startupSafety?.target?.isLocalHost === true
            && startupSafety?.target?.remoteRelease !== true;
        if (!localSafe) throw new StockySystemConnectorError('STOCKY_CONNECTOR_LOCAL_RUNTIME_UNSAFE', 503);
    } else {
        const expectedDeploy = mode === 'uat' ? 'staging' : 'production';
        const target = startupSafety?.target;
        const remoteSafe = nodeEnvironment === 'production'
            && deployEnvironment === expectedDeploy
            && startupSafety?.canStart === true
            && startupSafety?.shouldVerifyDbConnection === true
            && target?.remoteRelease === true
            && target?.tlsEnabled === true
            && target?.tlsVerified === true
            && target?.attested === true;
        if (!remoteSafe) throw new StockySystemConnectorError('STOCKY_CONNECTOR_REMOTE_RUNTIME_UNSAFE', 503);
        if (allowedHosts.length === 0) throw new StockySystemConnectorError('STOCKY_CONNECTOR_ALLOWED_HOSTS_REQUIRED', 503);
    }

    return Object.freeze({
        enabled: true,
        workerEnabled: exactTrue(environment.NOVASTORE_STOCKY_SYSTEM_COMMERCE_WORKER_ENABLED),
        mode,
        localOnly,
        manualResultPollIntervalMs: boundedInteger(
            environment.NOVASTORE_STOCKY_SYSTEM_COMMERCE_MANUAL_RESULT_POLL_INTERVAL_MS,
            300000,
            30000,
            3600000
        ),
        allowedHosts: Object.freeze(allowedHosts),
        secretsByRef: parseSecrets(environment.NOVASTORE_STOCKY_SYSTEM_COMMERCE_SECRETS_JSON)
    });
};

const validateEndpointOrigin = (value, runtime) => {
    let url;
    try {
        url = new URL(requiredText(value, 512));
    } catch (error) {
        if (error instanceof StockySystemConnectorError) throw error;
        throw new StockySystemConnectorError('STOCKY_CONNECTOR_ENDPOINT_INVALID', 400);
    }
    if (url.username || url.password || url.search || url.hash || !['', '/'].includes(url.pathname)) {
        throw new StockySystemConnectorError('STOCKY_CONNECTOR_ENDPOINT_INVALID', 400);
    }
    const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/gu, '').replace(/\.$/u, '');
    if (runtime.localOnly) {
        if (url.protocol !== 'http:' || !LOCAL_HOSTS.has(hostname)) {
            throw new StockySystemConnectorError('STOCKY_CONNECTOR_LOCAL_ENDPOINT_INVALID', 400);
        }
    } else {
        if (url.protocol !== 'https:' || net.isIP(hostname) !== 0 || LOCAL_HOSTS.has(hostname)) {
            throw new StockySystemConnectorError('STOCKY_CONNECTOR_REMOTE_ENDPOINT_INVALID', 400);
        }
        if (!runtime.allowedHosts.includes(hostname)) {
            throw new StockySystemConnectorError('STOCKY_CONNECTOR_HOST_NOT_ALLOWED', 400);
        }
    }
    return Object.freeze({ origin: url.origin, host: hostname, hostname, port: url.port, protocol: url.protocol });
};

const createStockyConnectorBinding = async (database, input, { runtime } = {}) => {
    if (!runtime?.enabled) throw new StockySystemConnectorError('STOCKY_CONNECTOR_DISABLED', 503);
    if (!database || typeof database.query !== 'function') throw new TypeError('Stocky connector database is required.');
    const endpoint = validateEndpointOrigin(input?.endpointOrigin, runtime);
    const secretRef = requiredText(input?.secretRef, 128);
    const keyId = requiredText(input?.keyId, 64);
    if (!IDENTIFIER_PATTERN.test(secretRef) || !/^[A-Za-z0-9._-]{1,64}$/u.test(keyId) || !runtime.secretsByRef[secretRef]) {
        throw new StockySystemConnectorError('STOCKY_CONNECTOR_SECRET_REFERENCE_INVALID', 400);
    }
    const organizationId = positiveInteger(input?.organizationId);
    const storeId = positiveInteger(input?.storeId);
    const remoteStoreId = requiredText(input?.remoteStoreId, 191);
    if (/[\x00-\x1f\x7f]/u.test(remoteStoreId)) {
        throw new StockySystemConnectorError('STOCKY_CONNECTOR_REMOTE_STORE_INVALID', 400);
    }
    const id = input?.id ? requiredUuid(input.id) : crypto.randomUUID();
    const result = await database.query(
        `WITH binding AS (
         INSERT INTO stocky_connector_connections
            (id, organization_id, store_id, remote_store_id, endpoint_origin, key_id, secret_ref)
         SELECT $1, seller_store.organization_id, seller_store.id, $4, $5, $6, $7
         FROM seller_stores seller_store
         JOIN seller_organizations organization ON organization.id = seller_store.organization_id
         WHERE seller_store.organization_id = $2
           AND seller_store.id = $3
           AND seller_store.status = 'active'
           AND seller_store.closed_at IS NULL
           AND organization.status = 'active'
           AND organization.closed_at IS NULL
         ON CONFLICT DO NOTHING
         RETURNING id, organization_id, store_id, remote_store_id, endpoint_origin, key_id,
                   secret_ref, status, revision
         ), audit AS (
             INSERT INTO seller_audit_events
                (organization_id, store_id, event_type, target_type, target_id, result_code, metadata_redacted)
             SELECT organization_id, store_id, 'stocky.connector.bound', 'stocky_connection', id::text,
                    'success', '{"source":"system","action":"bind"}'::jsonb
             FROM binding
             RETURNING id
         )
         SELECT binding.* FROM binding CROSS JOIN audit`,
        [
            id,
            organizationId,
            storeId,
            remoteStoreId,
            endpoint.origin,
            keyId,
            secretRef
        ]
    );
    if (result.rows?.[0]) return Object.freeze({ ...result.rows[0], id: String(result.rows[0].id), reused: false });
    const existing = await database.query(
        `SELECT id, organization_id, store_id, remote_store_id, endpoint_origin, key_id,
                secret_ref, status, revision
         FROM stocky_connector_connections
         WHERE organization_id = $1 AND store_id = $2 AND status = 'active'`,
        [organizationId, storeId]
    );
    const row = existing.rows?.[0];
    if (!row) throw new StockySystemConnectorError('STOCKY_CONNECTOR_STORE_BINDING_INVALID', 404);
    if (String(row.remote_store_id) !== remoteStoreId
        || String(row.endpoint_origin) !== endpoint.origin
        || String(row.key_id) !== keyId
        || String(row.secret_ref) !== secretRef) {
        throw new StockySystemConnectorError('STOCKY_CONNECTOR_BINDING_CONFLICT', 409);
    }
    return Object.freeze({ ...row, id: String(row.id), reused: true });
};

const canonicalSignatureInput = ({ method, path, host, connectionId, keyId, timestamp, nonce, body }) => [
    'v1',
    String(method || '').trim().toUpperCase(),
    requiredText(path, 768),
    requiredText(host, 255).toLowerCase(),
    requiredUuid(connectionId),
    requiredText(keyId, 128),
    String(timestamp),
    requiredText(nonce, 128),
    sha256Hex(body || '')
].join('\n');

const signRequestForDomain = (assertTarget, { method, path, body = '', connection, runtime, nonce = crypto.randomBytes(24).toString('base64url'), timestamp = Math.floor(Date.now() / 1000) }) => {
    if (!runtime?.enabled) throw new StockySystemConnectorError('STOCKY_CONNECTOR_DISABLED', 503);
    const endpoint = validateEndpointOrigin(connection?.endpoint_origin, runtime);
    const target = assertTarget({ method, path, body });
    const connectionId = requiredUuid(connection?.id);
    const keyId = requiredText(connection?.key_id, 64);
    const secret = runtime.secretsByRef[connection?.secret_ref];
    if (typeof secret !== 'string' || secret.length < 32) throw new StockySystemConnectorError('STOCKY_CONNECTOR_SECRET_UNAVAILABLE', 503);
    if (!BASE64URL_PATTERN.test(nonce) || !Number.isSafeInteger(timestamp) || String(timestamp).length !== 10) {
        throw new StockySystemConnectorError('STOCKY_CONNECTOR_SIGNATURE_INPUT_INVALID', 400);
    }
    const signature = crypto.createHmac('sha256', secret).update(canonicalSignatureInput({
        method: target.method, path: target.path, host: endpoint.host, connectionId, keyId, timestamp, nonce, body
    })).digest('hex');
    return Object.freeze({
        url: `${endpoint.origin}${target.path}`,
        nonce,
        timestamp,
        bodySha256: sha256Hex(body),
        headers: Object.freeze({
            [CONNECTION_HEADER]: connectionId,
            [KEY_ID_HEADER]: keyId,
            [TIMESTAMP_HEADER]: String(timestamp),
            [NONCE_HEADER]: nonce,
            [SIGNATURE_HEADER]: `sha256=${signature}`,
            'Content-Type': 'application/json'
        })
    });
};

const signStockyRequest = (input) => signRequestForDomain(assertStockyRequestTarget, input);
const signStockyThemeRequest = (input) => signRequestForDomain(assertStockyThemeRequestTarget, input);
const signStockyThemeSellerRequest = (input) => signRequestForDomain(assertStockyThemeSellerRequestTarget, input);

const getHeader = (headers, name) => {
    if (headers && typeof headers.get === 'function') return headers.get(name);
    const target = name.toLowerCase();
    const entry = Object.entries(headers || {}).find(([key]) => key.toLowerCase() === target);
    return entry?.[1] ?? null;
};

const verifyStockyResponse = ({ statusCode, path, rawBody, headers, connection, runtime, expectedNonce, expectedTimestamp }) => {
    const responseConnection = String(getHeader(headers, CONNECTION_HEADER) || '').trim().toLowerCase();
    const responseKeyId = String(getHeader(headers, KEY_ID_HEADER) || '').trim();
    const timestampText = String(getHeader(headers, REQUEST_TIMESTAMP_HEADER) || '').trim();
    const responseNonce = String(getHeader(headers, REQUEST_NONCE_HEADER) || '').trim();
    const supplied = String(getHeader(headers, RESPONSE_SIGNATURE_HEADER) || '').trim();
    if (responseConnection !== requiredUuid(connection?.id)
        || responseKeyId !== connection?.key_id
        || responseNonce !== expectedNonce
        || timestampText !== String(expectedTimestamp)
        || !/^\d{10}$/u.test(timestampText)
        || !BASE64URL_PATTERN.test(responseNonce)
        || !/^sha256=[0-9a-f]{64}$/u.test(supplied)) {
        throw new StockySystemConnectorError('STOCKY_CONNECTOR_RESPONSE_SIGNATURE_INVALID', 502);
    }
    const timestamp = Number(timestampText);
    const endpoint = validateEndpointOrigin(connection.endpoint_origin, runtime);
    const secret = runtime.secretsByRef[connection.secret_ref];
    const canonical = [
        'v1-response',
        String(statusCode),
        requiredText(path, 768),
        endpoint.host,
        responseConnection,
        responseKeyId,
        timestampText,
        responseNonce,
        sha256Hex(rawBody || '')
    ].join('\n');
    const expected = crypto.createHmac('sha256', secret).update(canonical).digest('hex');
    if (!safeEqual(supplied, `sha256=${expected}`)) {
        throw new StockySystemConnectorError('STOCKY_CONNECTOR_RESPONSE_SIGNATURE_INVALID', 502);
    }
    return Object.freeze({ nonce: responseNonce, bodySha256: sha256Hex(rawBody), timestamp });
};

module.exports = Object.freeze({
    CONNECTION_HEADER,
    EVENT_PATH,
    THEME_EVENT_PATH,
    KEY_ID_HEADER,
    NONCE_HEADER,
    REQUEST_NONCE_HEADER,
    REQUEST_TIMESTAMP_HEADER,
    RESPONSE_SIGNATURE_HEADER,
    SIGNATURE_HEADER,
    STATUS_PATH_PREFIX,
    TIMESTAMP_HEADER,
    StockySystemConnectorError,
    assertStockyRequestTarget,
    assertStockyThemeRequestTarget,
    assertStockyThemeSellerRequestTarget,
    canonicalSignatureInput,
    createSafeStockyTransport,
    createSafeStockyThemeTransport,
    createSafeStockyThemeSellerTransport,
    createStockyConnectorBinding,
    getHeader,
    isPublicAddress,
    requiredUuid,
    resolveStockySystemCommerceRuntime,
    sha256Hex,
    signStockyRequest,
    signStockyThemeRequest,
    signStockyThemeSellerRequest,
    stableStringify,
    validateEndpointOrigin,
    verifyStockyResponse
});
