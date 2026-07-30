const crypto = require('node:crypto');

const PURPOSES = Object.freeze({
    EMAIL_VERIFICATION: 'email_verification',
    PHONE_VERIFICATION: 'phone_verification',
    PASSWORD_RESET: 'password_reset'
});
const CHANNELS = Object.freeze({ EMAIL: 'email', SMS: 'sms' });
const CODE_TTL_MS = 10 * 60 * 1000;
const INVALID_CODE_MESSAGE = 'Kod geçersiz veya süresi dolmuş.';

class PasswordResetError extends Error {
    constructor(code, statusCode, publicMessage = INVALID_CODE_MESSAGE) {
        super(code);
        this.name = 'PasswordResetError';
        this.code = code;
        this.statusCode = statusCode;
        this.publicMessage = publicMessage;
    }
}

const normalizeEmail = (value) => {
    const email = String(value || '').trim().toLocaleLowerCase('en-US');
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254 ? email : null;
};

const normalizePhone = (value) => {
    const compact = String(value || '').trim().replace(/[\s().-]/g, '');
    if (/^\+90\d{10}$/.test(compact)) return compact;
    if (/^90\d{10}$/.test(compact)) return `+${compact}`;
    if (/^0?5\d{9}$/.test(compact)) return `+90${compact.replace(/^0/, '')}`;
    return /^\+[1-9]\d{7,14}$/.test(compact) ? compact : null;
};

const parseIdentifier = (value) => {
    const raw = String(value || '').trim();
    const email = normalizeEmail(raw);
    if (email) return Object.freeze({ channel: CHANNELS.EMAIL, value: email });
    const phone = normalizePhone(raw);
    return phone ? Object.freeze({ channel: CHANNELS.SMS, value: phone }) : null;
};

const requireCodeSecret = (env = process.env) => {
    const secret = String(env.VERIFICATION_CODE_SECRET || '');
    if (
        secret.length < 32
        || secret === String(env.JWT_SECRET || '')
        || /(?:change[_-]?me|replace[_-]?with)/i.test(secret)
    ) {
        throw new PasswordResetError(
            'PASSWORD_RESET_CONFIG_UNAVAILABLE',
            503,
            'Doğrulama işlemi şu anda kullanılamıyor.'
        );
    }
    return secret;
};

const hashResetCode = ({ userId, code, env = process.env }) => crypto
    .createHmac('sha256', requireCodeSecret(env))
    .update(`${PURPOSES.PASSWORD_RESET}:${Number(userId)}:${String(code)}`)
    .digest('hex');

const hashesEqual = (expected, actual) => {
    const left = Buffer.from(String(expected || ''), 'hex');
    const right = Buffer.from(String(actual || ''), 'hex');
    return left.length === 32 && right.length === 32 && crypto.timingSafeEqual(left, right);
};

const generateCode = () => String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
const generateChallengeId = () => crypto.randomInt(1, 2_147_483_647);

const withTransaction = async (queryable, work) => {
    if (!queryable || typeof queryable.query !== 'function') throw new TypeError('A PostgreSQL queryable is required.');
    const ownsClient = typeof queryable.connect === 'function';
    const client = ownsClient ? await queryable.connect() : queryable;
    let open = false;
    try {
        await client.query('BEGIN');
        open = true;
        const result = await work(client);
        await client.query('COMMIT');
        open = false;
        return result;
    } catch (error) {
        if (open) {
            try { await client.query('ROLLBACK'); } catch (_) { /* best effort */ }
        }
        throw error;
    } finally {
        if (ownsClient) client.release?.();
    }
};

const phoneLookupSql = `
    CASE
        WHEN REGEXP_REPLACE(phone, '[^0-9]', '', 'g') ~ '^05[0-9]{9}$'
            THEN '90' || SUBSTRING(REGEXP_REPLACE(phone, '[^0-9]', '', 'g') FROM 2)
        WHEN REGEXP_REPLACE(phone, '[^0-9]', '', 'g') ~ '^5[0-9]{9}$'
            THEN '90' || REGEXP_REPLACE(phone, '[^0-9]', '', 'g')
        ELSE REGEXP_REPLACE(phone, '[^0-9]', '', 'g')
    END
`;

const findCustomerForUpdate = async (client, identifier) => {
    const sql = identifier.channel === CHANNELS.EMAIL
        ? `SELECT id, full_name, name, email, phone, password_reset_token_hash, password_reset_expires_at
             FROM users
             WHERE role = 'customer' AND LOWER(BTRIM(email)) = $1
             ORDER BY id LIMIT 2 FOR UPDATE`
        : `SELECT id, full_name, name, email, phone, password_reset_token_hash, password_reset_expires_at
             FROM users
             WHERE role = 'customer'
               AND (${phoneLookupSql}) = REGEXP_REPLACE($1, '[^0-9]', '', 'g')
             ORDER BY id LIMIT 2 FOR UPDATE`;
    const result = await client.query(sql, [identifier.value]);
    return result.rows.length === 1 ? result.rows[0] : null;
};

const invalidCode = () => new PasswordResetError('PASSWORD_RESET_CODE_INVALID', 400);

const assertSixDigitCode = (value) => {
    const code = String(value || '').trim();
    if (!/^\d{6}$/.test(code)) throw invalidCode();
    return code;
};

const assertChallengeMatches = ({ user, code, now, env }) => {
    const expiresAt = new Date(user.password_reset_expires_at || 0).getTime();
    const actualHash = hashResetCode({ userId: user.id, code, env });
    if (!Number.isFinite(expiresAt) || expiresAt <= now.getTime() || !hashesEqual(user.password_reset_token_hash, actualHash)) {
        throw invalidCode();
    }
    return actualHash;
};

const requestPasswordResetChallenge = async ({
    queryable,
    identifier,
    env = process.env,
    now = new Date(),
    codeGenerator = generateCode,
    challengeIdGenerator = generateChallengeId
}) => {
    const parsed = parseIdentifier(identifier);
    if (!parsed) {
        throw new PasswordResetError('PASSWORD_RESET_IDENTIFIER_INVALID', 400, 'Geçerli bir e-posta veya telefon girin.');
    }
    return withTransaction(queryable, async (client) => {
        const user = await findCustomerForUpdate(client, parsed);
        if (!user) {
            // Preserve the same keyed-operation class for an unknown account without storing input.
            hashResetCode({ userId: 0, code: '000000', env });
            return Object.freeze({ accepted: true, unknown: true, channel: parsed.channel });
        }
        const code = assertSixDigitCode(codeGenerator());
        const codeHash = hashResetCode({ userId: user.id, code, env });
        const expiresAt = new Date(now.getTime() + CODE_TTL_MS);
        await client.query(
            `UPDATE users
             SET password_reset_token_hash = $1, password_reset_expires_at = $2
             WHERE id = $3`,
            [codeHash, expiresAt, Number(user.id)]
        );
        const challengeId = Number(challengeIdGenerator());
        if (!Number.isInteger(challengeId) || challengeId <= 0) throw new TypeError('Password reset challenge identifiers must be positive integers.');
        return Object.freeze({
            accepted: true,
            unknown: false,
            challengeId,
            userId: Number(user.id),
            channel: parsed.channel,
            destination: parsed.value,
            displayName: user.full_name || user.name || 'NovaStore kullanıcısı',
            purpose: PURPOSES.PASSWORD_RESET,
            code,
            expiresAt
        });
    });
};

const inspectPasswordResetCode = async ({ queryable, identifier, code, env = process.env, now = new Date() }) => {
    const parsed = parseIdentifier(identifier);
    const normalizedCode = assertSixDigitCode(code);
    if (!parsed) throw invalidCode();
    return withTransaction(queryable, async (client) => {
        const user = await findCustomerForUpdate(client, parsed);
        if (!user) {
            hashResetCode({ userId: 0, code: normalizedCode, env });
            throw invalidCode();
        }
        assertChallengeMatches({ user, code: normalizedCode, now, env });
        return Object.freeze({ valid: true, expiresAt: new Date(user.password_reset_expires_at) });
    });
};

const completePasswordReset = async ({
    queryable,
    identifier,
    code,
    passwordHash,
    env = process.env,
    now = new Date()
}) => {
    const parsed = parseIdentifier(identifier);
    const normalizedCode = assertSixDigitCode(code);
    if (!parsed || !String(passwordHash || '')) throw invalidCode();
    return withTransaction(queryable, async (client) => {
        const user = await findCustomerForUpdate(client, parsed);
        if (!user) {
            hashResetCode({ userId: 0, code: normalizedCode, env });
            throw invalidCode();
        }
        const codeHash = assertChallengeMatches({ user, code: normalizedCode, now, env });
        const updated = await client.query(
            `UPDATE users
             SET password = $1, password_reset_token_hash = NULL, password_reset_expires_at = NULL
             WHERE id = $2 AND password_reset_token_hash = $3 AND password_reset_expires_at > $4
             RETURNING id`,
            [String(passwordHash), Number(user.id), codeHash, now]
        );
        if (updated.rows.length !== 1) throw invalidCode();
        await client.query(
            `UPDATE auth_sessions
             SET revoked_at = COALESCE(revoked_at, CURRENT_TIMESTAMP),
                 revoke_reason = COALESCE(revoke_reason, 'password_reset')
             WHERE user_id = $1 AND revoked_at IS NULL AND expires_at > CURRENT_TIMESTAMP`,
            [Number(user.id)]
        );
        return Object.freeze({ valid: true, consumed: true, userId: Number(user.id) });
    });
};

const invalidatePasswordResetChallenge = async ({ queryable, userId, codeHash }) => {
    if (!Number.isInteger(Number(userId)) || !/^[a-f0-9]{64}$/i.test(String(codeHash || ''))) return false;
    const result = await queryable.query(
        `UPDATE users
         SET password_reset_token_hash = NULL, password_reset_expires_at = NULL
         WHERE id = $1 AND password_reset_token_hash = $2`,
        [Number(userId), String(codeHash)]
    );
    return Boolean(result.rowCount || result.rows?.length);
};

module.exports = {
    CHANNELS,
    CODE_TTL_MS,
    INVALID_CODE_MESSAGE,
    PURPOSES,
    PasswordResetError,
    completePasswordReset,
    generateCode,
    hashResetCode,
    inspectPasswordResetCode,
    invalidatePasswordResetChallenge,
    normalizeEmail,
    normalizePhone,
    parseIdentifier,
    requestPasswordResetChallenge
};
