const dns = require('node:dns');
const http = require('node:http');
const https = require('node:https');
const net = require('node:net');
const {
    VERIFICATION_OPERATOR_ENV_KEYS
} = require('../config/stagingReleaseContract');

const KNOWN_PRODUCTION_HOSTS = Object.freeze([
    'novastore.tr',
    'www.novastore.tr',
    'novastore-backend.onrender.com'
]);
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);
const FULL_REVISION_PATTERN = /^[0-9a-f]{40}$/;
const DEFAULT_TIMEOUT_MS = 5000;
const MAX_TIMEOUT_MS = 10000;
const DEFAULT_MAX_REDIRECTS = 2;
const MAX_REDIRECTS = 3;
const MAX_RESPONSE_BYTES = 64 * 1024;
const SAFE_PATHS = new Set([
    '/api/health/live',
    '/api/health/ready',
    '/api/version',
    '/',
    '/admin.html',
    '/api/products',
    '/_staging/access',
    '/_staging/logout',
    '/socket.io/'
]);

class StagingVerificationError extends Error {
    constructor(code) {
        super('Staging verification failed.');
        this.name = 'StagingVerificationError';
        this.code = code;
    }
}

const fail = (code) => {
    throw new StagingVerificationError(code);
};

const normalizeHostname = (value) => String(value || '')
    .trim()
    .toLowerCase()
    .replace(/^\[|\]$/g, '')
    .replace(/\.$/, '');

const isKnownProductionHost = (hostname) => {
    const normalized = normalizeHostname(hostname);
    return KNOWN_PRODUCTION_HOSTS.some((known) => (
        normalized === known || normalized.endsWith(`.${known}`)
    ));
};

const rawAuthorityHostname = (rawTarget) => {
    const match = rawTarget.match(/^[a-z][a-z0-9+.-]*:\/\/([^/?#]+)(?:[/?#]|$)/i);
    if (!match) fail('TARGET_URL_INVALID');
    const authority = match[1];
    if (authority.includes('@')) fail('TARGET_URL_CREDENTIALS_FORBIDDEN');

    if (authority.startsWith('[')) {
        const closing = authority.indexOf(']');
        if (closing === -1 || !/^(?::\d+)?$/.test(authority.slice(closing + 1))) {
            fail('TARGET_AUTHORITY_INVALID');
        }
        return authority.slice(1, closing).toLowerCase();
    }

    if ((authority.match(/:/g) || []).length > 1) fail('TARGET_AUTHORITY_INVALID');
    const host = authority.replace(/:\d+$/, '').toLowerCase();
    if (!host) fail('TARGET_AUTHORITY_INVALID');
    return host;
};

const validateExpectedHostname = (value) => {
    const raw = String(value || '');
    const normalized = normalizeHostname(raw);
    if (
        !normalized ||
        raw !== raw.trim() ||
        raw.endsWith('.') ||
        /[:/?#@\s]/.test(raw) ||
        !/^[a-z0-9.-]+$/i.test(raw) ||
        normalized.includes('..') ||
        normalized.startsWith('.') ||
        normalized.endsWith('.')
    ) fail('EXPECTED_HOST_INVALID');
    return normalized;
};

const planVerificationTarget = ({ target, allowRemote = false, expectedHostname = '' } = {}) => {
    const rawTarget = String(target || '');
    if (!rawTarget || rawTarget !== rawTarget.trim() || rawTarget.length > 2048) {
        fail('TARGET_URL_INVALID');
    }

    let parsed;
    try {
        parsed = new URL(rawTarget);
    } catch (_) {
        fail('TARGET_URL_INVALID');
    }

    if (parsed.username || parsed.password) fail('TARGET_URL_CREDENTIALS_FORBIDDEN');
    if (parsed.search) fail('TARGET_URL_QUERY_FORBIDDEN');
    if (parsed.hash) fail('TARGET_URL_FRAGMENT_FORBIDDEN');
    if (parsed.pathname !== '/' && parsed.pathname !== '') fail('TARGET_BASE_PATH_FORBIDDEN');
    if (!['http:', 'https:'].includes(parsed.protocol)) fail('TARGET_SCHEME_FORBIDDEN');

    const hostname = normalizeHostname(parsed.hostname);
    const rawHostname = rawAuthorityHostname(rawTarget);
    const isLoopback = LOOPBACK_HOSTS.has(hostname);
    const ipVersion = net.isIP(hostname);

    if (isKnownProductionHost(hostname)) fail('PRODUCTION_HOST_FORBIDDEN');

    if (isLoopback) {
        if (!LOOPBACK_HOSTS.has(rawHostname) || rawHostname !== hostname) {
            fail('LOOPBACK_LOOKALIKE_FORBIDDEN');
        }
        return Object.freeze({
            origin: parsed.origin,
            protocol: parsed.protocol,
            hostname,
            port: parsed.port,
            mode: 'loopback',
            isLoopback: true,
            requiresDnsAttestation: false
        });
    }

    if (parsed.protocol === 'http:') fail('NON_LOOPBACK_HTTP_FORBIDDEN');
    if (ipVersion !== 0) fail('REMOTE_IP_LITERAL_FORBIDDEN');
    if (allowRemote !== true) fail('REMOTE_CAPABILITY_REQUIRED');

    const expected = validateExpectedHostname(expectedHostname);
    if (expected !== hostname) fail('EXPECTED_HOST_MISMATCH');
    if (isKnownProductionHost(expected)) fail('PRODUCTION_HOST_FORBIDDEN');

    return Object.freeze({
        origin: parsed.origin,
        protocol: parsed.protocol,
        hostname,
        port: parsed.port,
        mode: 'remote-staging',
        isLoopback: false,
        requiresDnsAttestation: true
    });
};

const isUnsafeIpv4 = (address) => {
    const octets = address.split('.').map(Number);
    const [a, b] = octets;
    return (
        a === 0 ||
        a === 10 ||
        a === 127 ||
        (a === 100 && b >= 64 && b <= 127) ||
        (a === 169 && b === 254) ||
        (a === 172 && b >= 16 && b <= 31) ||
        (a === 192 && b === 0) ||
        (a === 192 && b === 168) ||
        (a === 198 && (b === 18 || b === 19)) ||
        a >= 224
    );
};

const isUnsafeIpAddress = (address) => {
    const normalized = normalizeHostname(address);
    const version = net.isIP(normalized);
    if (version === 4) return isUnsafeIpv4(normalized);
    if (version !== 6) return true;

    const lower = normalized.toLowerCase();
    if (
        lower === '::' ||
        lower === '::1' ||
        lower.startsWith('fc') ||
        lower.startsWith('fd') ||
        /^fe[89ab]/.test(lower) ||
        lower.startsWith('ff')
    ) return true;

    const mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    return mapped ? isUnsafeIpv4(mapped[1]) : false;
};

const attestResolvedAddresses = (records) => {
    if (!Array.isArray(records) || records.length === 0) fail('DNS_ATTESTATION_EMPTY');
    const normalized = records.map((record) => {
        const address = typeof record === 'string' ? record : record?.address;
        const family = net.isIP(String(address || ''));
        if (!family || isUnsafeIpAddress(address)) fail('DNS_REBINDING_RISK');
        return Object.freeze({ address: String(address), family });
    });
    return Object.freeze(normalized);
};

const resolvePinnedAddresses = async (plan, resolver = dns.promises.lookup) => {
    if (!plan.requiresDnsAttestation) return Object.freeze([]);
    let records;
    try {
        records = await resolver(plan.hostname, { all: true, verbatim: true });
    } catch (_) {
        fail('DNS_ATTESTATION_FAILED');
    }
    return attestResolvedAddresses(records);
};

const createPinnedLookup = (records) => (hostname, options, callback) => {
    const normalized = typeof options === 'object' ? options : {};
    const done = typeof options === 'function' ? options : callback;
    if (typeof done !== 'function' || records.length === 0) {
        throw new TypeError('Pinned DNS lookup is unavailable.');
    }
    if (normalized.all) return done(null, records.map((record) => ({ ...record })));
    return done(null, records[0].address, records[0].family);
};

const assertRedirectAllowed = (plan, location) => {
    if (typeof location !== 'string' || !location || location.length > 2048) {
        fail('REDIRECT_LOCATION_INVALID');
    }
    let next;
    try {
        next = new URL(location, plan.origin);
    } catch (_) {
        fail('REDIRECT_LOCATION_INVALID');
    }
    if (next.username || next.password || next.origin !== plan.origin) {
        fail('CROSS_ORIGIN_REDIRECT_FORBIDDEN');
    }
    if (next.hash) fail('REDIRECT_FRAGMENT_FORBIDDEN');
    return next;
};

const validateBounds = ({ timeoutMs = DEFAULT_TIMEOUT_MS, maxRedirects = DEFAULT_MAX_REDIRECTS } = {}) => {
    if (!Number.isInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > MAX_TIMEOUT_MS) {
        fail('TIMEOUT_BOUND_INVALID');
    }
    if (!Number.isInteger(maxRedirects) || maxRedirects < 0 || maxRedirects > MAX_REDIRECTS) {
        fail('REDIRECT_BOUND_INVALID');
    }
    return Object.freeze({ timeoutMs, maxRedirects, maxResponseBytes: MAX_RESPONSE_BYTES });
};

const requestOnce = ({ plan, pinnedAddresses, pathname, method, headers, body, timeoutMs }) => new Promise((resolve, reject) => {
    const transport = plan.protocol === 'https:' ? https : http;
    const options = {
        protocol: plan.protocol,
        hostname: plan.hostname,
        port: plan.port || undefined,
        path: pathname,
        method,
        headers: { Connection: 'close', ...headers },
        agent: false
    };
    if (plan.requiresDnsAttestation) {
        options.lookup = createPinnedLookup(pinnedAddresses);
        options.servername = plan.hostname;
    }

    const request = transport.request(options, (response) => {
        const chunks = [];
        let bytes = 0;
        response.on('data', (chunk) => {
            bytes += chunk.length;
            if (bytes > MAX_RESPONSE_BYTES) {
                response.destroy(new StagingVerificationError('RESPONSE_TOO_LARGE'));
                return;
            }
            chunks.push(chunk);
        });
        response.on('end', () => resolve({
            status: response.statusCode || 0,
            headers: response.headers,
            body: Buffer.concat(chunks)
        }));
        response.on('error', reject);
    });
    request.setTimeout(timeoutMs, () => request.destroy(new StagingVerificationError('REQUEST_TIMEOUT')));
    request.on('error', reject);
    if (body) request.write(body);
    request.end();
});

const createBoundedRequester = ({ plan, pinnedAddresses, bounds, metrics }) => {
    const request = async ({ pathname, method = 'GET', headers = {}, body, followRedirects = true }, redirects = 0) => {
        const pathOnly = String(pathname || '').split('?')[0];
        if (!SAFE_PATHS.has(pathOnly)) {
            metrics.functionalMutationRequests += 1;
            fail('UNSAFE_VERIFICATION_ENDPOINT');
        }
        if (!['GET', 'HEAD', 'POST'].includes(method)) {
            metrics.functionalMutationRequests += 1;
            fail('UNSAFE_VERIFICATION_METHOD');
        }
        if (method === 'POST' && !['/_staging/access', '/_staging/logout'].includes(pathOnly)) {
            metrics.functionalMutationRequests += 1;
            fail('FUNCTIONAL_MUTATION_FORBIDDEN');
        }

        metrics.httpRequests += 1;
        if (!plan.isLoopback) metrics.remoteHttpRequests += 1;
        let response;
        try {
            response = await requestOnce({
                plan,
                pinnedAddresses,
                pathname,
                method,
                headers,
                body,
                timeoutMs: bounds.timeoutMs
            });
        } catch (error) {
            if (error instanceof StagingVerificationError) throw error;
            fail('HTTP_REQUEST_FAILED');
        }

        const location = response.headers.location;
        const isRedirect = [301, 302, 303, 307, 308].includes(response.status) && location;
        if (!followRedirects || !isRedirect) return response;
        if (redirects >= bounds.maxRedirects) fail('REDIRECT_LIMIT_EXCEEDED');
        const next = assertRedirectAllowed(plan, location);
        const nextMethod = response.status === 303 ? 'GET' : method;
        return request({
            pathname: `${next.pathname}${next.search}`,
            method: nextMethod,
            headers,
            body: nextMethod === 'GET' ? undefined : body,
            followRedirects
        }, redirects + 1);
    };
    return request;
};

const assertStatus = (response, expected, code) => {
    if (response.status !== expected) fail(code);
};

const parseJsonBody = (response) => {
    try {
        return JSON.parse(response.body.toString('utf8'));
    } catch (_) {
        fail('RESPONSE_JSON_INVALID');
    }
};

const firstSetCookie = (response) => {
    const value = response.headers['set-cookie'];
    if (Array.isArray(value)) return value[0] || '';
    return String(value || '');
};

const extractSecureSessionCookie = (response) => {
    const setCookie = firstSetCookie(response);
    if (
        !/^__Host-novastore_staging_access=[^;]+;/i.test(setCookie) ||
        !/;\s*Path=\//i.test(setCookie) ||
        !/;\s*HttpOnly/i.test(setCookie) ||
        !/;\s*Secure/i.test(setCookie) ||
        !/;\s*SameSite=Strict/i.test(setCookie) ||
        !/;\s*Max-Age=\d+/i.test(setCookie)
    ) fail('SECURE_COOKIE_CONTRACT_FAILED');
    return setCookie.split(';', 1)[0];
};

const assertExpiredSessionCookie = (response) => {
    const setCookie = firstSetCookie(response);
    if (
        !/^__Host-novastore_staging_access=;/i.test(setCookie) ||
        !/;\s*Max-Age=0/i.test(setCookie) ||
        !/;\s*HttpOnly/i.test(setCookie) ||
        !/;\s*Secure/i.test(setCookie) ||
        !/;\s*SameSite=Strict/i.test(setCookie)
    ) fail('LOGOUT_COOKIE_CONTRACT_FAILED');
};

const validateSyntheticCredentials = (credentials) => {
    const username = credentials?.username;
    const password = credentials?.password;
    if (
        typeof username !== 'string' ||
        typeof password !== 'string' ||
        username.length < 3 ||
        username.length > 64 ||
        password.length < 1 ||
        password.length > 256 ||
        /[\u0000-\u001f\u007f]/.test(username) ||
        /[\u0000-\u001f\u007f]/.test(password)
    ) fail('OPERATOR_CREDENTIALS_INVALID');
    return { username, password };
};

const runVerificationHarness = async ({
    plan,
    expectedRevision,
    readCredentials,
    resolver,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    maxRedirects = DEFAULT_MAX_REDIRECTS
}) => {
    if (!plan || !FULL_REVISION_PATTERN.test(String(expectedRevision || ''))) {
        fail('VERIFICATION_INPUT_INVALID');
    }
    if (typeof readCredentials !== 'function') fail('CREDENTIAL_SOURCE_REQUIRED');

    const bounds = validateBounds({ timeoutMs, maxRedirects });
    const pinnedAddresses = await resolvePinnedAddresses(plan, resolver);
    const metrics = {
        httpRequests: 0,
        remoteHttpRequests: 0,
        functionalMutationRequests: 0,
        externalSideEffectCalls: 0
    };
    const request = createBoundedRequester({ plan, pinnedAddresses, bounds, metrics });
    const checks = [];
    const pass = (name) => checks.push(Object.freeze({ name, status: 'PASS' }));

    for (const [pathname, name] of [
        ['/api/health/live', 'health-live'],
        ['/api/health/ready', 'health-ready']
    ]) {
        assertStatus(await request({ pathname, method: 'GET', followRedirects: false }), 200, 'HEALTH_GET_FAILED');
        assertStatus(await request({ pathname, method: 'HEAD', followRedirects: false }), 200, 'HEALTH_HEAD_FAILED');
        pass(name);
    }

    assertStatus(
        await request({ pathname: '/api/version', followRedirects: false }),
        401,
        'UNAUTHENTICATED_VERSION_NOT_PROTECTED'
    );
    const unauthenticatedRoot = await request({
        pathname: '/',
        headers: { Accept: 'text/html' },
        followRedirects: false
    });
    assertStatus(unauthenticatedRoot, 302, 'UNAUTHENTICATED_STOREFRONT_NOT_PROTECTED');
    assertRedirectAllowed(plan, unauthenticatedRoot.headers.location);
    assertStatus(
        await request({ pathname: '/api/products', followRedirects: false }),
        401,
        'UNAUTHENTICATED_API_NOT_PROTECTED'
    );
    pass('unauthenticated-protection');

    assertStatus(
        await request({ pathname: '/_staging/access', followRedirects: false }),
        200,
        'ACCESS_PAGE_FAILED'
    );
    const credentials = validateSyntheticCredentials(await readCredentials());
    const loginBody = new URLSearchParams(credentials).toString();
    const login = await request({
        pathname: '/_staging/access',
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Content-Length': Buffer.byteLength(loginBody)
        },
        body: loginBody,
        followRedirects: false
    });
    assertStatus(login, 303, 'ACCESS_LOGIN_FAILED');
    assertRedirectAllowed(plan, login.headers.location);
    const sessionCookie = extractSecureSessionCookie(login);
    pass('synthetic-access-login');
    pass('secure-cookie');

    const authenticatedHeaders = { Cookie: sessionCookie };
    const version = await request({
        pathname: '/api/version',
        headers: authenticatedHeaders,
        followRedirects: false
    });
    assertStatus(version, 200, 'AUTHENTICATED_VERSION_FAILED');
    const versionBody = parseJsonBody(version);
    if (versionBody.revision !== expectedRevision) fail('REVISION_MISMATCH');
    pass('revision-attestation');

    const storefront = await request({
        pathname: '/',
        headers: { ...authenticatedHeaders, Accept: 'text/html' },
        followRedirects: false
    });
    assertStatus(storefront, 200, 'STOREFRONT_DOCUMENT_FAILED');
    if (!/^text\/html\b/i.test(String(storefront.headers['content-type'] || ''))) {
        fail('STOREFRONT_CONTENT_TYPE_INVALID');
    }
    if (!/<!doctype html>/i.test(storefront.body.toString('utf8'))) fail('STOREFRONT_DOCUMENT_INVALID');

    const admin = await request({
        pathname: '/admin.html',
        headers: { ...authenticatedHeaders, Accept: 'text/html' },
        followRedirects: false
    });
    assertStatus(admin, 200, 'ADMIN_DOCUMENT_FAILED');
    pass('read-only-documents');

    const logout = await request({
        pathname: '/_staging/logout',
        method: 'POST',
        headers: authenticatedHeaders,
        followRedirects: false
    });
    assertStatus(logout, 204, 'LOGOUT_FAILED');
    assertExpiredSessionCookie(logout);
    pass('logout-cookie-clear');

    assertStatus(await request({
        pathname: '/',
        headers: { Accept: 'text/html' },
        followRedirects: false
    }), 302, 'POST_LOGOUT_STOREFRONT_NOT_PROTECTED');
    assertStatus(await request({
        pathname: '/api/version',
        followRedirects: false
    }), 401, 'POST_LOGOUT_API_NOT_PROTECTED');
    pass('post-logout-protection');

    assertStatus(await request({
        pathname: '/socket.io/?EIO=4&transport=polling',
        followRedirects: false
    }), 401, 'UNAUTHENTICATED_SOCKET_NOT_REJECTED');
    pass('socket-unauthenticated-rejection');

    if (metrics.functionalMutationRequests !== 0) fail('FUNCTIONAL_MUTATION_DETECTED');
    if (metrics.externalSideEffectCalls !== 0) fail('EXTERNAL_SIDE_EFFECT_DETECTED');
    pass('zero-functional-mutations');
    pass('zero-external-side-effects');
    pass('bounded-transport');

    return Object.freeze({
        schemaVersion: 1,
        status: 'PASS',
        mode: plan.mode,
        revision: expectedRevision,
        checks: Object.freeze(checks),
        metrics: Object.freeze({ ...metrics }),
        bounds
    });
};

const readOperatorConfiguration = (environment = process.env) => {
    const target = environment.NOVASTORE_STAGING_VERIFY_TARGET;
    const expectedRevision = environment.NOVASTORE_STAGING_VERIFY_EXPECTED_REVISION;
    const allowRemote = environment.NOVASTORE_STAGING_VERIFY_REMOTE_ENABLED === 'true';
    const expectedHostname = environment.NOVASTORE_STAGING_VERIFY_EXPECTED_HOST || '';
    const plan = planVerificationTarget({ target, allowRemote, expectedHostname });
    if (!FULL_REVISION_PATTERN.test(String(expectedRevision || ''))) {
        fail('EXPECTED_REVISION_INVALID');
    }
    return Object.freeze({
        plan,
        expectedRevision,
        readCredentials: () => ({
            username: environment.NOVASTORE_STAGING_VERIFY_USERNAME,
            password: environment.NOVASTORE_STAGING_VERIFY_PASSWORD
        })
    });
};

const runCli = async ({ argv = process.argv.slice(2), environment = process.env } = {}) => {
    if (!Array.isArray(argv) || argv.length !== 0) fail('CLI_ARGUMENTS_FORBIDDEN');
    const configuration = readOperatorConfiguration(environment);
    return runVerificationHarness(configuration);
};

if (require.main === module) {
    runCli()
        .then((result) => process.stdout.write(`${JSON.stringify(result)}\n`))
        .catch(() => {
            process.stderr.write(`${JSON.stringify({ status: 'FAIL', code: 'VERIFICATION_FAILED' })}\n`);
            process.exitCode = 1;
        });
}

module.exports = {
    DEFAULT_MAX_REDIRECTS,
    DEFAULT_TIMEOUT_MS,
    KNOWN_PRODUCTION_HOSTS,
    MAX_REDIRECTS,
    MAX_RESPONSE_BYTES,
    MAX_TIMEOUT_MS,
    StagingVerificationError,
    VERIFICATION_OPERATOR_ENV_KEYS,
    assertRedirectAllowed,
    attestResolvedAddresses,
    isKnownProductionHost,
    isUnsafeIpAddress,
    planVerificationTarget,
    readOperatorConfiguration,
    resolvePinnedAddresses,
    runCli,
    runVerificationHarness,
    validateBounds
};
