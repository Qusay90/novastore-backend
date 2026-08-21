'use strict';

const crypto = require('node:crypto');
const bcrypt = require('bcrypt');

const CODE_TTL_MS = 10 * 60 * 1000;
const RESET_TTL_MS = 10 * 60 * 1000;
const DEDUPE_MS = 60 * 1000;
const MAX_ATTEMPTS = 5;
const BCRYPT_COST = 12;
const GENERIC_ACCEPTED = Object.freeze({ accepted: true });

class SellerPasswordRecoveryError extends Error {
    constructor(code, statusCode = 400) {
        super(code);
        this.name = 'SellerPasswordRecoveryError';
        this.code = code;
        this.statusCode = statusCode;
    }
}

const assertPlainObject = (value, keys) => {
    if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some((key) => !keys.includes(key))) {
        throw new SellerPasswordRecoveryError('VALIDATION_FAILED', 400);
    }
};

const normalizeIdentifier = (value) => {
    if (typeof value !== 'string') throw new SellerPasswordRecoveryError('VALIDATION_FAILED', 400);
    const normalized = value.trim().toLocaleLowerCase('tr-TR');
    if (!normalized || normalized.length > 320) throw new SellerPasswordRecoveryError('VALIDATION_FAILED', 400);
    const email = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(normalized);
    const phone = /^\+?[1-9]\d{9,14}$/u.test(normalized.replace(/[\s()-]/gu, ''));
    if (!email && !phone) throw new SellerPasswordRecoveryError('VALIDATION_FAILED', 400);
    return Object.freeze({
        channel: email ? 'email' : 'phone',
        value: email ? normalized : normalized.replace(/[\s()-]/gu, '')
    });
};

const requireSecret = (value) => {
    if (typeof value !== 'string' || value.length < 32) {
        throw new SellerPasswordRecoveryError('SELLER_PASSWORD_RECOVERY_SECRET_REQUIRED', 503);
    }
    return value;
};

const hmac = (secret, namespace, value) => crypto
    .createHmac('sha256', secret)
    .update(`${namespace}\u0000${value}`, 'utf8')
    .digest('hex');

const safeHashEqual = (left, right) => {
    if (!/^[a-f0-9]{64}$/u.test(String(left || '')) || !/^[a-f0-9]{64}$/u.test(String(right || ''))) return false;
    return crypto.timingSafeEqual(Buffer.from(left, 'hex'), Buffer.from(right, 'hex'));
};

const uuid = (value) => {
    const normalized = String(value || '').toLowerCase();
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(normalized)) {
        throw new SellerPasswordRecoveryError('VALIDATION_FAILED', 400);
    }
    return normalized;
};

const text = (value, max = 1024) => {
    if (typeof value !== 'string' || value.length === 0 || value.length > max || /[\u0000-\u001f\u007f]/u.test(value)) {
        throw new SellerPasswordRecoveryError('VALIDATION_FAILED', 400);
    }
    return value;
};

const validatePassword = (value) => {
    const password = text(value, 128);
    if (
        password.length < 12 ||
        !/[a-zçğıöşü]/u.test(password) ||
        !/[A-ZÇĞİÖŞÜ]/u.test(password) ||
        !/\d/u.test(password) ||
        !/[^\p{L}\p{N}\s]/u.test(password) ||
        /\s/u.test(password)
    ) {
        throw new SellerPasswordRecoveryError('PASSWORD_POLICY_FAILED', 400);
    }
    return password;
};

const withTransaction = async (database, work) => {
    if (!database || typeof database.connect !== 'function') throw new TypeError('Seller recovery database pool is required.');
    const client = await database.connect();
    try {
        await client.query('BEGIN');
        const result = await work(client);
        await client.query('COMMIT');
        return result;
    } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        throw error;
    } finally {
        client.release();
    }
};

const event = (client, challengeId, eventType, resultCode, metadata = {}) => client.query(
    'INSERT INTO seller_password_recovery_events (challenge_id, event_type, result_code, metadata_redacted) VALUES ($1, $2, $3, $4::jsonb)',
    [challengeId, eventType, resultCode, JSON.stringify(metadata)]
);

const createSellerPasswordRecoveryService = ({
    database,
    secret,
    deliveryBoundary = async () => {},
    now = () => new Date(),
    randomUUID = crypto.randomUUID,
    randomBytes = crypto.randomBytes,
    bcryptModule = bcrypt
} = {}) => {
    const effectiveSecret = requireSecret(secret);
    if (typeof deliveryBoundary !== 'function') throw new TypeError('Seller recovery delivery boundary is required.');
    if (typeof now !== 'function' || typeof randomUUID !== 'function' || typeof randomBytes !== 'function') {
        throw new TypeError('Seller recovery entropy and clock dependencies are required.');
    }

    const forgot = async (body) => {
        assertPlainObject(body, ['identifier']);
        const identifier = normalizeIdentifier(body.identifier);
        const identifierHash = hmac(effectiveSecret, 'seller-recovery-identifier-v1', identifier.value);
        const issuedAt = now();
        const code = String(randomBytes(4).readUInt32BE(0) % 100000000).padStart(8, '0');
        const codeHash = hmac(effectiveSecret, 'seller-recovery-code-v1', code);
        const challengeId = randomUUID();

        const outcome = await withTransaction(database, async (client) => {
            await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [identifierHash]);
            await client.query(
                "UPDATE seller_password_recovery_challenges SET status = 'expired', updated_at = CURRENT_TIMESTAMP WHERE identifier_hash = $1 AND status = 'pending' AND expires_at <= $2",
                [identifierHash, issuedAt]
            );
            const existing = await client.query(
                "SELECT id, created_at, expires_at FROM seller_password_recovery_challenges WHERE identifier_hash = $1 AND status = 'pending' FOR UPDATE",
                [identifierHash]
            );
            const pending = existing.rows?.[0];
            if (pending && issuedAt.getTime() - new Date(pending.created_at).getTime() < DEDUPE_MS) {
                await event(client, pending.id, 'seller.password_recovery.forgot_deduplicated', 'accepted', { channel: identifier.channel });
                return Object.freeze({ challengeId: pending.id, expiresAt: new Date(pending.expires_at), deliverable: false });
            }
            if (pending) {
                await client.query("UPDATE seller_password_recovery_challenges SET status = 'superseded', updated_at = CURRENT_TIMESTAMP WHERE id = $1", [pending.id]);
            }

            const userResult = await client.query(
                "SELECT user_row.id FROM users user_row WHERE (LOWER(user_row.email) = $1 OR LOWER(COALESCE(user_row.phone, '')) = $1) AND EXISTS (SELECT 1 FROM seller_memberships membership WHERE membership.user_id = user_row.id AND membership.status = 'active') ORDER BY user_row.id LIMIT 1",
                [identifier.value]
            );
            const userId = userResult.rows?.[0]?.id || null;
            const expiresAt = new Date(issuedAt.getTime() + CODE_TTL_MS);
            await client.query(
                "INSERT INTO seller_password_recovery_challenges (id, user_id, identifier_hash, delivery_channel, code_hash, expires_at, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $7)",
                [challengeId, userId, identifierHash, identifier.channel, codeHash, expiresAt, issuedAt]
            );
            await event(client, challengeId, 'seller.password_recovery.forgot_accepted', 'accepted', { channel: identifier.channel });
            return Object.freeze({ challengeId, expiresAt, deliverable: Boolean(userId), destination: userId ? identifier.value : null });
        });

        try {
            await deliveryBoundary(Object.freeze({
                challengeId: outcome.challengeId,
                channel: identifier.channel,
                destination: outcome.destination || null,
                deliverable: outcome.deliverable,
                code: outcome.deliverable ? code : null
            }));
        } catch (_) {
            // Delivery is an external boundary. The public response remains enumeration-neutral.
        }
        return Object.freeze({ ...GENERIC_ACCEPTED, challenge_id: outcome.challengeId, expires_in: Math.max(0, Math.ceil((outcome.expiresAt.getTime() - issuedAt.getTime()) / 1000)) });
    };

    const verify = async (challengeIdValue, body) => {
        const challengeId = uuid(challengeIdValue);
        assertPlainObject(body, ['code']);
        const code = text(body.code, 32);
        const presentedHash = hmac(effectiveSecret, 'seller-recovery-code-v1', code);
        const verifiedAt = now();
        const outcome = await withTransaction(database, async (client) => {
            const result = await client.query(
                'SELECT id, status, code_hash, attempt_count, expires_at FROM seller_password_recovery_challenges WHERE id = $1 FOR UPDATE',
                [challengeId]
            );
            const row = result.rows?.[0];
            if (!row || row.status !== 'pending' || new Date(row.expires_at).getTime() <= verifiedAt.getTime()) {
                if (row && row.status === 'pending') {
                    await client.query("UPDATE seller_password_recovery_challenges SET status = 'expired', updated_at = $2 WHERE id = $1", [challengeId, verifiedAt]);
                    await event(client, challengeId, 'seller.password_recovery.verify_rejected', 'invalid', { reason: 'expired' });
                }
                return Object.freeze({ failureCode: 'RECOVERY_CHALLENGE_INVALID' });
            }
            if (!safeHashEqual(row.code_hash, presentedHash)) {
                const attempts = Number(row.attempt_count) + 1;
                const nextStatus = attempts >= MAX_ATTEMPTS ? 'locked' : 'pending';
                await client.query('UPDATE seller_password_recovery_challenges SET attempt_count = $2, status = $3, updated_at = $4 WHERE id = $1', [challengeId, attempts, nextStatus, verifiedAt]);
                await event(client, challengeId, 'seller.password_recovery.verify_rejected', 'invalid', { exhausted: nextStatus === 'locked' });
                return Object.freeze({ failureCode: 'RECOVERY_CHALLENGE_INVALID' });
            }
            const resetToken = randomBytes(48).toString('base64url');
            const resetHash = hmac(effectiveSecret, 'seller-recovery-reset-v1', resetToken);
            const resetExpiresAt = new Date(verifiedAt.getTime() + RESET_TTL_MS);
            const updated = await client.query(
                "UPDATE seller_password_recovery_challenges SET status = 'verified', reset_token_hash = $2, verified_at = $3, reset_expires_at = $4, updated_at = $3 WHERE id = $1 AND status = 'pending' RETURNING id",
                [challengeId, resetHash, verifiedAt, resetExpiresAt]
            );
            if (updated.rows?.length !== 1) throw new SellerPasswordRecoveryError('RECOVERY_CHALLENGE_INVALID', 401);
            await event(client, challengeId, 'seller.password_recovery.verified', 'reset_authority_issued', { authority_type: 'RESET_TOKEN_BOUND' });
            return Object.freeze({
                recovery_authority: Object.freeze({
                    type: 'RESET_TOKEN_BOUND',
                    challenge_id: challengeId,
                    reset_token: resetToken,
                    expires_in: Math.ceil(RESET_TTL_MS / 1000)
                })
            });
        });
        if (outcome.failureCode) throw new SellerPasswordRecoveryError(outcome.failureCode, 401);
        return outcome;
    };

    const reset = async (body) => {
        assertPlainObject(body, ['challenge_id', 'reset_token', 'new_password']);
        const challengeId = uuid(body.challenge_id);
        const resetToken = text(body.reset_token, 1024);
        const newPassword = validatePassword(body.new_password);
        const presentedHash = hmac(effectiveSecret, 'seller-recovery-reset-v1', resetToken);
        const consumedAt = now();
        return withTransaction(database, async (client) => {
            const result = await client.query(
                'SELECT challenge.id, challenge.user_id, challenge.status, challenge.reset_token_hash, challenge.reset_expires_at, user_row.password FROM seller_password_recovery_challenges challenge JOIN users user_row ON user_row.id = challenge.user_id WHERE challenge.id = $1 FOR UPDATE OF challenge, user_row',
                [challengeId]
            );
            const row = result.rows?.[0];
            if (
                !row || row.status !== 'verified' || !row.user_id ||
                new Date(row.reset_expires_at).getTime() <= consumedAt.getTime() ||
                !safeHashEqual(row.reset_token_hash, presentedHash)
            ) {
                throw new SellerPasswordRecoveryError('RESET_AUTHORITY_INVALID', 401);
            }
            if (await bcryptModule.compare(newPassword, row.password)) {
                throw new SellerPasswordRecoveryError('PASSWORD_POLICY_FAILED', 400);
            }
            const passwordHash = await bcryptModule.hash(newPassword, BCRYPT_COST);
            await client.query(
                'UPDATE users SET password = $1, password_reset_token_hash = NULL, password_reset_expires_at = NULL WHERE id = $2',
                [passwordHash, row.user_id]
            );
            const revoked = await client.query(
                "UPDATE seller_sessions SET status = 'revoked', revoked_at = $2, updated_at = $2 WHERE user_id = $1 AND audience = 'seller' AND status = 'active' RETURNING id",
                [row.user_id, consumedAt]
            );
            const revokedIds = (revoked.rows || []).map((entry) => entry.id);
            if (revokedIds.length > 0) {
                await client.query("UPDATE seller_refresh_token_families SET status = 'revoked', revoked_at = $2, updated_at = $2 WHERE session_id = ANY($1::uuid[]) AND status = 'active'", [revokedIds, consumedAt]);
                await client.query("UPDATE seller_refresh_tokens SET status = 'revoked', revoked_at = $2 WHERE family_id IN (SELECT id FROM seller_refresh_token_families WHERE session_id = ANY($1::uuid[])) AND status = 'active'", [revokedIds, consumedAt]);
            }
            const consumed = await client.query(
                "UPDATE seller_password_recovery_challenges SET status = 'consumed', consumed_at = $2, reset_token_hash = NULL, updated_at = $2 WHERE id = $1 AND status = 'verified' RETURNING id",
                [challengeId, consumedAt]
            );
            if (consumed.rows?.length !== 1) throw new SellerPasswordRecoveryError('RESET_AUTHORITY_INVALID', 401);
            const superseded = await client.query(
                "UPDATE seller_password_recovery_challenges SET status = 'superseded', reset_token_hash = NULL, updated_at = $2 WHERE user_id = $1 AND id <> $3 AND status IN ('pending', 'verified') RETURNING id",
                [row.user_id, consumedAt, challengeId]
            );
            await event(client, challengeId, 'seller.password_recovery.reset_completed', 'success', {
                revoked_session_count: revokedIds.length,
                superseded_challenge_count: superseded.rows?.length || 0,
                auto_login: false
            });
            return Object.freeze({ password_reset: true, auto_login: false, revoked_session_count: revokedIds.length });
        });
    };

    return Object.freeze({ forgot, verify, reset });
};

const toSafeRecoveryError = (error) => error instanceof SellerPasswordRecoveryError
    ? error
    : new SellerPasswordRecoveryError('SELLER_PASSWORD_RECOVERY_UNAVAILABLE', 503);

module.exports = Object.freeze({
    BCRYPT_COST,
    MAX_ATTEMPTS,
    SellerPasswordRecoveryError,
    createSellerPasswordRecoveryService,
    normalizeIdentifier,
    toSafeRecoveryError,
    validatePassword
});
