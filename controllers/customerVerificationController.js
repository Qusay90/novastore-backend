const bcrypt = require('bcryptjs');
const pool = require('../config/db');
const { assertExternalSideEffectAllowed, ExternalSideEffectBlockedError } = require('../config/stagingRuntimePolicy');
const {
    CHANNELS,
    PasswordResetError,
    completePasswordReset,
    hashResetCode,
    inspectPasswordResetCode,
    invalidatePasswordResetChallenge,
    parseIdentifier,
    requestPasswordResetChallenge
} = require('../services/customerVerificationService');
const { VerificationDeliveryError, defaultDelivery } = require('../services/verificationDeliveryService');

const RESET_REQUEST_MESSAGE = 'Hesap uygunsa doğrulama kodu gönderildi.';
const INVALID_CODE_MESSAGE = 'Kod geçersiz veya süresi dolmuş.';

const isStrongPassword = (value) => (
    String(value || '').length >= 8
    && /[A-Za-zÇĞİÖŞÜçğıöşü]/.test(String(value || ''))
    && /\d/.test(String(value || ''))
);

const settlePublicResponse = async (startedAt, delayMs) => {
    const delay = Math.max(0, Math.min(Number(delayMs) || 0, 5_000));
    const remaining = delay - (Date.now() - startedAt);
    if (remaining > 0) await new Promise((resolve) => setTimeout(resolve, remaining));
};

const publicError = (res, error) => {
    if (error instanceof PasswordResetError) {
        return res.status(error.statusCode).json({ error: error.publicMessage });
    }
    if (error instanceof VerificationDeliveryError || error instanceof ExternalSideEffectBlockedError) {
        return res.status(503).json({ error: 'Doğrulama işlemi şu anda kullanılamıyor.' });
    }
    return res.status(500).json({ error: 'Doğrulama işlemi tamamlanamadı.' });
};

const createCustomerPasswordResetController = ({
    queryable = pool,
    delivery = defaultDelivery,
    env = process.env,
    passwordHasher = (password) => bcrypt.hash(password, 10),
    publicResponseDelayMs = 750,
    now = () => new Date(),
    codeGenerator,
    challengeIdGenerator
} = {}) => {
    const requestPasswordReset = async (req, res) => {
        const startedAt = Date.now();
        const identifier = req.body?.identifier || req.body?.email || req.body?.phone;
        const parsed = parseIdentifier(identifier);
        if (!parsed) {
            return res.status(400).json({ error: 'Geçerli bir e-posta veya telefon girin.' });
        }
        try {
            if (!delivery.isConfigured(parsed.channel)) {
                throw new PasswordResetError(
                    'PASSWORD_RESET_DELIVERY_UNAVAILABLE',
                    503,
                    'Doğrulama işlemi şu anda kullanılamıyor.'
                );
            }
            assertExternalSideEffectAllowed(
                parsed.channel === CHANNELS.EMAIL ? 'email' : 'sms_or_push',
                env
            );
            const challenge = await requestPasswordResetChallenge({
                queryable,
                identifier: parsed.value,
                env,
                now: now(),
                ...(codeGenerator ? { codeGenerator } : {}),
                ...(challengeIdGenerator ? { challengeIdGenerator } : {})
            });
            if (!challenge.unknown) {
                const codeHash = hashResetCode({ userId: challenge.userId, code: challenge.code, env });
                void Promise.resolve()
                    .then(() => delivery.sendCode(challenge))
                    .catch(async () => {
                        try {
                            await invalidatePasswordResetChallenge({
                                queryable,
                                userId: challenge.userId,
                                codeHash
                            });
                        } catch (_) {
                            // Delivery failures remain generic and never escape through an unhandled rejection.
                        }
                    });
            }
            await settlePublicResponse(startedAt, publicResponseDelayMs);
            return res.status(202).json({ message: RESET_REQUEST_MESSAGE });
        } catch (error) {
            await settlePublicResponse(startedAt, publicResponseDelayMs);
            return publicError(res, error);
        }
    };

    const verifyPasswordReset = async (req, res) => {
        const startedAt = Date.now();
        const identifier = req.body?.identifier || req.body?.email || req.body?.phone;
        try {
            const result = await inspectPasswordResetCode({
                queryable,
                identifier,
                code: req.body?.code,
                env,
                now: now()
            });
            await settlePublicResponse(startedAt, publicResponseDelayMs);
            return res.status(200).json({
                valid: true,
                expiresAt: result.expiresAt.toISOString(),
                message: 'Kod doğrulandı.'
            });
        } catch (error) {
            await settlePublicResponse(startedAt, publicResponseDelayMs);
            return publicError(res, error);
        }
    };

    const completePasswordResetWithCode = async (req, res) => {
        const startedAt = Date.now();
        const newPassword = String(req.body?.newPassword || '');
        if (!isStrongPassword(newPassword)) {
            return res.status(400).json({ error: 'Yeni şifre en az 8 karakter, harf ve rakam içermelidir.' });
        }
        const identifier = req.body?.identifier || req.body?.email || req.body?.phone;
        try {
            const passwordHash = await passwordHasher(newPassword);
            await completePasswordReset({
                queryable,
                identifier,
                code: req.body?.code,
                passwordHash,
                env,
                now: now()
            });
            await settlePublicResponse(startedAt, publicResponseDelayMs);
            return res.status(200).json({ message: 'Şifreniz güncellendi. Tüm açık oturumlar kapatıldı.' });
        } catch (error) {
            await settlePublicResponse(startedAt, publicResponseDelayMs);
            return publicError(res, error);
        }
    };

    return Object.freeze({
        completePasswordResetWithCode,
        requestPasswordReset,
        verifyPasswordReset
    });
};

const defaultController = createCustomerPasswordResetController();

module.exports = {
    INVALID_CODE_MESSAGE,
    RESET_REQUEST_MESSAGE,
    createCustomerPasswordResetController,
    isStrongPassword,
    ...defaultController
};
