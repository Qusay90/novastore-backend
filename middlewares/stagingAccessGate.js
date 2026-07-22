const crypto = require('crypto');
const express = require('express');
const bcrypt = require('bcrypt');
const {
    getStagingAccessConfiguration,
    isStagingEnvironment
} = require('../config/stagingRuntimePolicy');

const COOKIE_NAME = '__Host-novastore_staging_access';
const SESSION_MAX_AGE_SECONDS = 12 * 60 * 60;
const LOGIN_RATE_LIMIT_WINDOW_MS = 5 * 60 * 1000;
const LOGIN_RATE_LIMIT_MAX_FAILURES = 5;
const ACCESS_PATH = '/_staging/access';
const LOGOUT_PATH = '/_staging/logout';
const HEALTH_BYPASSES = new Set(['/api/health/live', '/api/health/ready']);

const LOGIN_PAGE = `<!doctype html>
<html lang="tr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex,nofollow,noarchive">
  <title>NovaStore Staging Erişimi</title>
  <style>
    :root { color-scheme: light; font-family: system-ui, sans-serif; }
    body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #f4f6f8; }
    main { width: min(92vw, 24rem); padding: 2rem; border-radius: 1rem; background: white; box-shadow: 0 1rem 3rem rgba(15, 42, 67, .12); }
    h1 { margin-top: 0; color: #0f2a43; font-size: 1.35rem; }
    label { display: grid; gap: .4rem; margin-top: 1rem; font-weight: 600; }
    input, button { box-sizing: border-box; width: 100%; padding: .75rem; border-radius: .55rem; font: inherit; }
    input { border: 1px solid #b8c2cc; }
    button { margin-top: 1.25rem; border: 0; color: white; background: #0f2a43; font-weight: 700; cursor: pointer; }
  </style>
</head>
<body>
  <main>
    <h1>NovaStore Staging Erişimi</h1>
    <form method="post" action="/_staging/access" autocomplete="off">
      <label>Kullanıcı adı<input name="username" required maxlength="64" autocomplete="username"></label>
      <label>Parola<input name="password" type="password" required maxlength="256" autocomplete="current-password"></label>
      <button type="submit">Devam et</button>
    </form>
  </main>
</body>
</html>`;

const rawRequestPath = (req) => {
    const originalUrl = String(req?.originalUrl || req?.url || '/');
    const queryIndex = originalUrl.indexOf('?');
    return queryIndex === -1 ? originalUrl : originalUrl.slice(0, queryIndex);
};

const hasQueryString = (req) => String(req?.originalUrl || req?.url || '').includes('?');

const setStagingResponseHeaders = (res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');
};

const parseCookies = (header) => {
    const output = Object.create(null);
    const raw = String(header || '');
    if (!raw || raw.length > 8192) return output;

    for (const part of raw.split(';')) {
        const separator = part.indexOf('=');
        if (separator <= 0) continue;
        const name = part.slice(0, separator).trim();
        if (!name || Object.prototype.hasOwnProperty.call(output, name)) continue;
        output[name] = part.slice(separator + 1).trim();
    }
    return output;
};

const hmacSignature = (value, secret) => crypto
    .createHmac('sha256', secret)
    .update(value)
    .digest('base64url');

const timingSafeStringEqual = (left, right) => {
    const leftDigest = crypto.createHash('sha256').update(String(left || '')).digest();
    const rightDigest = crypto.createHash('sha256').update(String(right || '')).digest();
    return crypto.timingSafeEqual(leftDigest, rightDigest);
};

const createSignedSessionToken = ({ sessionSecret, now = Date.now, randomBytes = crypto.randomBytes }) => {
    const expiresAt = Math.floor(now() / 1000) + SESSION_MAX_AGE_SECONDS;
    const nonce = randomBytes(18).toString('base64url');
    const payload = `v1.${expiresAt}.${nonce}`;
    return `${payload}.${hmacSignature(payload, sessionSecret)}`;
};

const verifySignedSessionToken = (token, { sessionSecret, now = Date.now }) => {
    const raw = String(token || '');
    if (!raw || raw.length > 512) return false;

    const parts = raw.split('.');
    if (parts.length !== 4 || parts[0] !== 'v1') return false;

    const expiresAt = Number(parts[1]);
    if (!Number.isSafeInteger(expiresAt)) return false;

    const nowSeconds = Math.floor(now() / 1000);
    if (expiresAt <= nowSeconds || expiresAt > nowSeconds + SESSION_MAX_AGE_SECONDS + 5) return false;

    const payload = parts.slice(0, 3).join('.');
    const expectedSignature = hmacSignature(payload, sessionSecret);
    const receivedSignature = parts[3];
    const expectedBuffer = Buffer.from(expectedSignature);
    const receivedBuffer = Buffer.from(receivedSignature);
    if (expectedBuffer.length !== receivedBuffer.length) return false;
    return crypto.timingSafeEqual(expectedBuffer, receivedBuffer);
};

const sessionCookie = (token) => (
    `${COOKIE_NAME}=${token}; Max-Age=${SESSION_MAX_AGE_SECONDS}; Path=/; HttpOnly; Secure; SameSite=Strict`
);

const expiredSessionCookie = () => (
    `${COOKIE_NAME}=; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Path=/; HttpOnly; Secure; SameSite=Strict`
);

const isExactHealthBypass = (req, path) => (
    ['GET', 'HEAD'].includes(String(req.method || '').toUpperCase()) && HEALTH_BYPASSES.has(path)
);

const isLikelyHtmlRequest = (req, path) => {
    const method = String(req.method || '').toUpperCase();
    if (!['GET', 'HEAD'].includes(method)) return false;
    if (path.startsWith('/api/') || path.startsWith('/socket.io/')) return false;

    const accept = String(req.headers?.accept || '').toLowerCase();
    if (accept.includes('text/html')) return true;
    if (path === '/' || path.endsWith('.html')) return true;
    const lastSegment = path.split('/').filter(Boolean).pop() || '';
    return !lastSegment.includes('.');
};

const sendUnauthenticated = (req, res, path) => {
    if (isLikelyHtmlRequest(req, path)) {
        res.statusCode = 302;
        res.setHeader('Location', ACCESS_PATH);
        return res.end();
    }
    return res.status(401).json({ error: 'Staging access required.' });
};

const createFailureLimiter = ({
    now = Date.now,
    windowMs = LOGIN_RATE_LIMIT_WINDOW_MS,
    maxFailures = LOGIN_RATE_LIMIT_MAX_FAILURES
} = {}) => {
    const buckets = new Map();

    const keyFor = (req) => crypto
        .createHash('sha256')
        .update(String(req.ip || req.socket?.remoteAddress || 'unknown'))
        .digest('hex');

    const current = (key) => {
        const value = buckets.get(key);
        if (!value || value.expiresAt <= now()) {
            buckets.delete(key);
            return null;
        }
        return value;
    };

    return Object.freeze({
        isLimited(req, username) {
            const value = current(keyFor(req, username));
            return Boolean(value && value.count >= maxFailures);
        },
        recordFailure(req, username) {
            const key = keyFor(req, username);
            const value = current(key);
            if (!value) {
                buckets.set(key, { count: 1, expiresAt: now() + windowMs });
                return 1;
            }
            value.count += 1;
            return value.count;
        },
        clear(req, username) {
            buckets.delete(keyFor(req, username));
        }
    });
};

const createStagingAccessGate = ({
    environment = process.env,
    comparePassword = bcrypt.compare,
    now = Date.now,
    randomBytes = crypto.randomBytes,
    rateLimit = {}
} = {}) => {
    if (!isStagingEnvironment(environment)) return (_req, _res, next) => next();

    const config = getStagingAccessConfiguration(environment);
    const limiter = createFailureLimiter({ now, ...rateLimit });
    const parseAccessBody = express.urlencoded({
        extended: false,
        limit: '4kb',
        parameterLimit: 4,
        type: 'application/x-www-form-urlencoded'
    });

    return (req, res, next) => {
        const path = rawRequestPath(req);
        const method = String(req.method || '').toUpperCase();
        setStagingResponseHeaders(res);

        if (method === 'OPTIONS') return next();
        if (isExactHealthBypass(req, path)) return next();

        if (path === LOGOUT_PATH && method === 'POST') {
            res.setHeader('Set-Cookie', expiredSessionCookie());
            return res.status(204).end();
        }

        if (path === ACCESS_PATH && method === 'GET') {
            if (hasQueryString(req)) return res.status(400).send('Invalid staging access request.');
            return res.status(200).type('html').send(LOGIN_PAGE);
        }

        if (path === ACCESS_PATH && method === 'POST') {
            if (hasQueryString(req)) return res.status(400).json({ error: 'Invalid staging access request.' });

            return parseAccessBody(req, res, (parseError) => {
                if (parseError) return res.status(400).json({ error: 'Invalid staging access request.' });

                const username = typeof req.body?.username === 'string' ? req.body.username : '';
                const password = typeof req.body?.password === 'string' ? req.body.password : '';
                if (limiter.isLimited(req, username)) {
                    return res.status(429).json({ error: 'Staging access temporarily unavailable.' });
                }

                const boundedPassword = password.length > 0 && password.length <= 256;
                return Promise.resolve()
                    .then(() => boundedPassword ? comparePassword(password, config.passwordHash) : false)
                    .then((passwordMatches) => {
                        const usernameMatches = timingSafeStringEqual(username, config.username);
                        if (!usernameMatches || !passwordMatches) {
                            limiter.recordFailure(req, username);
                            return res.status(401).json({ error: 'Staging access denied.' });
                        }

                        limiter.clear(req, username);
                        const token = createSignedSessionToken({
                            sessionSecret: config.sessionSecret,
                            now,
                            randomBytes
                        });
                        res.setHeader('Set-Cookie', sessionCookie(token));
                        return res.redirect(303, '/');
                    })
                    .catch(() => res.status(401).json({ error: 'Staging access denied.' }));
            });
        }

        const token = parseCookies(req.headers?.cookie)[COOKIE_NAME];
        if (verifySignedSessionToken(token, { sessionSecret: config.sessionSecret, now })) {
            return next();
        }

        return sendUnauthenticated(req, res, path);
    };
};

const createStagingEngineAccessGate = ({ environment = process.env, now = Date.now } = {}) => {
    if (!isStagingEnvironment(environment)) return (_req, _res, next) => next();
    const config = getStagingAccessConfiguration(environment);

    return (req, res, next) => {
        setStagingResponseHeaders(res);
        const token = parseCookies(req.headers?.cookie)[COOKIE_NAME];
        if (verifySignedSessionToken(token, { sessionSecret: config.sessionSecret, now })) return next();

        res.statusCode = 401;
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        return res.end(JSON.stringify({ error: 'Staging access required.' }));
    };
};

module.exports = {
    ACCESS_PATH,
    COOKIE_NAME,
    HEALTH_BYPASSES,
    LOGIN_RATE_LIMIT_MAX_FAILURES,
    LOGIN_RATE_LIMIT_WINDOW_MS,
    LOGOUT_PATH,
    SESSION_MAX_AGE_SECONDS,
    createSignedSessionToken,
    createStagingAccessGate,
    createStagingEngineAccessGate,
    parseCookies,
    verifySignedSessionToken
};
