const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'customer-verification-smoke-secret-32-bytes';
process.env.VERIFICATION_CODE_SECRET = 'independent-customer-code-secret-for-local-smoke-only';
process.env.NOVASTORE_SAFE_LOCAL_BACKEND = 'true';
process.env.NOVASTORE_ALLOW_REMOTE_DB = 'false';
process.env.SKIP_SCHEMA_INIT = 'true';
process.env.NOVASTORE_ALLOW_SCHEMA_INIT = 'false';
process.env.DATABASE_URL = 'postgresql://novastore_test:novastore_test_only@127.0.0.1:55432/novastore_customer_verification_test';
process.env.DB_HOST = '127.0.0.1';
process.env.DB_PORT = '55432';
process.env.DB_NAME = 'novastore_customer_verification_test';
process.env.DB_USER = 'novastore_test';
process.env.DB_PASSWORD = 'novastore_test_only';
process.env.DB_SSL = 'false';
process.env.SUPABASE_USE_POOLER = 'false';
process.env.SUPABASE_POOLER_HOST = '';
process.env.SUPABASE_REGION = '';
process.env.SUPABASE_PROJECT_REF = '';
delete process.env.NOVASTORE_DEPLOY_ENV;
delete process.env.NOVASTORE_STAGING_EXTERNAL_SIDE_EFFECTS_DISABLED;

const {
    CHANNELS,
    COOLDOWN_SECONDS,
    PURPOSES,
    RATE_MAX_REQUESTS,
    VerificationError,
    completePasswordReset,
    generateCode,
    hashCode,
    inspectPasswordResetCode,
    normalizePhone,
    requestChallenge,
    verifyEmail
} = require('../services/customerVerificationService');
const {
    createResendEmailAdapter,
    createUnavailableSmsAdapter,
    createVerificationDelivery
} = require('../services/verificationDeliveryService');
const {
    RESET_REQUEST_MESSAGE,
    createCustomerVerificationController
} = require('../controllers/customerVerificationController');
const {
    authenticateCustomer
} = require('../middlewares/authMiddleware');
const {
    createCounter,
    createCustomerAuthRateLimit,
    customerLoginRateLimit,
    customerPasswordResetCompleteRateLimit,
    customerPasswordResetRequestRateLimit,
    customerPasswordResetVerifyRateLimit,
    hashRateLimitKey
} = require('../middlewares/customerAuthRateLimit');
const applicationPool = require('../config/db');
const { loginUser, registerUser } = require('../controllers/userController');
const userRoutes = require('../routes/userRoutes');

class Mutex {
    constructor() {
        this.tail = Promise.resolve();
    }

    async acquire() {
        let release;
        const gate = new Promise((resolve) => { release = resolve; });
        const previous = this.tail;
        this.tail = previous.then(() => gate);
        await previous;
        return release;
    }
}

class FakeVerificationPool {
    constructor() {
        this.mutex = new Mutex();
        this.nextChallengeId = 1;
        this.nextUserId = 8;
        this.nextSessionId = 3;
        this.users = [{
            id: 7,
            full_name: 'Test Customer',
            name: null,
            email: 'customer@example.test',
            phone: '+905551112233',
            email_verified: false,
            phone_verified: false,
            role: 'customer',
            password: 'old-hash'
        }];
        this.challenges = [];
        this.sessions = [
            { id: 1, user_id: 7, revoked_at: null, expires_at: new Date('2030-01-01T00:00:00Z') },
            { id: 2, user_id: 7, revoked_at: null, expires_at: new Date('2030-01-01T00:00:00Z') }
        ];
    }

    async connect() {
        return new FakeVerificationClient(this);
    }

    async query(sql, params = []) {
        return new FakeVerificationClient(this).query(sql, params);
    }
}

class FakeVerificationClient {
    constructor(database) {
        this.database = database;
        this.unlock = null;
    }

    release() {}

    async query(sql, params = []) {
        const text = String(sql).replace(/\s+/g, ' ').trim().toLowerCase();
        if (text === 'begin') {
            this.unlock = await this.database.mutex.acquire();
            return { rows: [] };
        }
        if (text === 'commit' || text === 'rollback') {
            if (this.unlock) this.unlock();
            this.unlock = null;
            return { rows: [] };
        }

        if (text.includes('from users') && text.includes("id = $1 and role = 'customer'")) {
            return { rows: this.database.users.filter((user) => user.id === Number(params[0]) && user.role === 'customer') };
        }
        if (
            text.includes('from users')
            && (
                text.includes('lower(email) = $1')
                || text.includes('lower(btrim(email)) = $1')
            )
        ) {
            return {
                rows: this.database.users.filter(
                    (user) => user.role === 'customer' && user.email.trim().toLowerCase() === params[0]
                ).slice(0, 2)
            };
        }
        if (
            text.includes('select id from users')
            && text.includes('regexp_replace(phone')
            && text.includes('id <> $2')
        ) {
            return {
                rows: this.database.users.filter(
                    (user) => user.role === 'customer'
                        && normalizePhone(user.phone) === normalizePhone(params[0])
                        && user.id !== Number(params[1])
                ).map(({ id }) => ({ id })).slice(0, 1)
            };
        }
        if (text.includes('from users') && text.includes('regexp_replace(phone')) {
            return {
                rows: this.database.users.filter(
                    (user) => user.role === 'customer'
                        && normalizePhone(user.phone) === normalizePhone(params[0])
                ).slice(0, 2)
            };
        }
        if (text.startsWith('insert into users (')) {
            const user = {
                id: this.database.nextUserId++,
                full_name: params[0],
                name: null,
                email: params[1],
                phone: params[2],
                password: params[3],
                email_verified: false,
                phone_verified: false,
                role: 'customer',
                auth_enabled: true
            };
            this.database.users.push(user);
            return { rows: [{ ...user }] };
        }
        if (text.startsWith('insert into auth_sessions (')) {
            const session = {
                id: this.database.nextSessionId++,
                jti_hash: params[0],
                user_id: Number(params[1]),
                principal_type: params[2],
                issued_at: params[3],
                expires_at: params[4],
                revoked_at: null
            };
            this.database.sessions.push(session);
            return { rows: [{ id: session.id }] };
        }

        if (
            text.startsWith('select id, created_at, code_hash from customer_auth_challenges')
        ) {
            const threshold = new Date(params[2]).getTime() - Number(params[3]) * 1000;
            return {
                rows: this.database.challenges
                    .filter((challenge) => challenge.user_id === Number(params[0])
                        && challenge.purpose === params[1]
                        && challenge.created_at.getTime() > threshold)
                    .sort((a, b) => b.id - a.id)
                    .map(({ id, created_at, code_hash }) => ({ id, created_at, code_hash }))
            };
        }
        if (
            text.startsWith('update customer_auth_challenges set invalidated_at = $3')
            && text.includes('where user_id = $1')
        ) {
            for (const challenge of this.database.challenges) {
                if (
                    challenge.user_id === Number(params[0])
                    && challenge.purpose === params[1]
                    && !challenge.consumed_at
                    && !challenge.invalidated_at
                ) challenge.invalidated_at = params[2];
                if (challenge.invalidated_at) challenge.destination = '[redacted]';
            }
            return { rows: [] };
        }
        if (text.startsWith('insert into customer_auth_challenges')) {
            const challenge = {
                id: this.database.nextChallengeId++,
                user_id: Number(params[0]),
                purpose: params[1],
                channel: params[2],
                destination: params[3],
                code_hash: params[4],
                attempt_count: 0,
                max_attempts: Number(params[5]),
                expires_at: params[6],
                created_at: params[7],
                consumed_at: null,
                invalidated_at: null
            };
            this.database.challenges.push(challenge);
            return { rows: [{ id: challenge.id }] };
        }
        if (
            text.startsWith('select id, user_id, purpose, channel, destination, code_hash')
            && text.includes('from customer_auth_challenges')
        ) {
            const challenge = this.database.challenges
                .filter((entry) => entry.user_id === Number(params[0])
                    && entry.purpose === params[1]
                    && !entry.consumed_at
                    && !entry.invalidated_at)
                .sort((a, b) => b.id - a.id)[0];
            return { rows: challenge ? [{ ...challenge }] : [] };
        }
        if (
            text.startsWith('update customer_auth_challenges set attempt_count = $2')
        ) {
            const challenge = this.database.challenges.find((entry) => entry.id === Number(params[0]));
            if (challenge) {
                challenge.attempt_count = Number(params[1]);
                if (params[2] === true || challenge.attempt_count >= challenge.max_attempts) {
                    challenge.invalidated_at = challenge.invalidated_at || params[3];
                    challenge.destination = '[redacted]';
                }
            }
            return { rows: [] };
        }
        if (
            text.startsWith('update customer_auth_challenges set consumed_at = $2')
        ) {
            const challenge = this.database.challenges.find((entry) => entry.id === Number(params[0]));
            const now = new Date(params[1]);
            if (
                !challenge
                || challenge.consumed_at
                || challenge.invalidated_at
                || challenge.expires_at <= now
                || challenge.attempt_count >= challenge.max_attempts
            ) return { rows: [] };
            challenge.consumed_at = now;
            challenge.destination = '[redacted]';
            return { rows: [{ id: challenge.id }] };
        }
        if (
            text.startsWith('update customer_auth_challenges set invalidated_at = coalesce')
        ) {
            const challenge = this.database.challenges.find((entry) => entry.id === Number(params[0]));
            if (!challenge || challenge.consumed_at) return { rows: [] };
            challenge.invalidated_at = challenge.invalidated_at || params[1];
            challenge.destination = '[redacted]';
            return { rows: [{ id: challenge.id }] };
        }

        if (text.startsWith('update users set email_verified = true')) {
            const user = this.database.users.find((entry) => entry.id === Number(params[0]));
            user.email_verified = true;
            user.email_verified_at = user.email_verified_at || new Date();
            return { rows: [] };
        }
        if (text.startsWith('update users set password_reset_token_hash = null')) {
            const user = this.database.users.find((entry) => entry.id === Number(params[0]));
            user.password_reset_token_hash = null;
            user.password_reset_expires_at = null;
            return { rows: [] };
        }
        if (text.startsWith('update users set phone = $1')) {
            const user = this.database.users.find((entry) => entry.id === Number(params[1]));
            user.phone = params[0];
            user.phone_verified = true;
            user.phone_verified_at = user.phone_verified_at || new Date();
            return { rows: [] };
        }
        if (text.startsWith('update users set password = $1')) {
            const user = this.database.users.find((entry) => entry.id === Number(params[1]));
            user.password = params[0];
            return { rows: [] };
        }
        if (text.startsWith('update auth_sessions set revoked_at = coalesce')) {
            const revoked = [];
            for (const session of this.database.sessions) {
                if (
                    session.user_id === Number(params[0])
                    && !session.revoked_at
                    && session.expires_at > new Date()
                ) {
                    session.revoked_at = new Date();
                    session.revoke_reason = 'password_reset';
                    revoked.push({ id: session.id });
                }
            }
            return { rows: revoked };
        }

        throw new Error(`Unexpected fake SQL: ${text}`);
    }
}

const expectVerificationError = async (promise, code = 'VERIFICATION_CODE_INVALID') => {
    await assert.rejects(promise, (error) => (
        error instanceof VerificationError && error.code === code
    ));
};

const createResponse = () => ({
    statusCode: 200,
    payload: null,
    status(code) {
        this.statusCode = code;
        return this;
    },
    json(payload) {
        this.payload = payload;
        return this;
    }
});

const routeHandlers = (routePath) => {
    const layer = userRoutes.stack.find((entry) => entry.route?.path === routePath);
    assert(layer, `route missing: ${routePath}`);
    return layer.route.stack.map((entry) => entry.handle);
};

(async () => {
    for (let index = 0; index < 100; index += 1) {
        assert.match(generateCode(), /^\d{6}$/);
    }
    assert.notEqual(
        hashCode({ userId: 7, purpose: PURPOSES.EMAIL_VERIFICATION, code: '123456' }),
        hashCode({ userId: 7, purpose: PURPOSES.PASSWORD_RESET, code: '123456' }),
        'same digits must hash differently for a different purpose'
    );
    assert.throws(
        () => hashCode({
            userId: 7,
            purpose: PURPOSES.PASSWORD_RESET,
            code: '123456',
            env: { JWT_SECRET: 'same-secret-value-that-is-at-least-32-bytes', VERIFICATION_CODE_SECRET: 'same-secret-value-that-is-at-least-32-bytes' }
        }),
        /VERIFICATION_CODE_CONFIG_MISSING/
    );
    const boundedCounter = createCounter({ windowMs: 60000, maxEntries: 2 });
    for (let index = 0; index < 8; index += 1) {
        boundedCounter.take(`opaque-${index}`, 1000);
    }
    assert.equal(boundedCounter.size(), 2, 'unique live keys must obey the deterministic cap');
    const opaqueKey = hashRateLimitKey(
        'identifier',
        'email:sensitive@example.test',
        process.env
    );
    assert.match(opaqueKey, /^[0-9a-f]{64}$/);
    assert.equal(opaqueKey.includes('sensitive'), false);

    const controllerPool = new FakeVerificationPool();
    controllerPool.users = [];
    controllerPool.sessions = [];
    const originalApplicationQuery = applicationPool.query;
    const originalApplicationConnect = applicationPool.connect;
    applicationPool.query = controllerPool.query.bind(controllerPool);
    applicationPool.connect = controllerPool.connect.bind(controllerPool);
    try {
        const noPhoneRegistration = createResponse();
        await registerUser({
            body: {
                fullName: 'No Phone Customer',
                email: '  NoPhone@Example.Test ',
                password: 'Register123!'
            }
        }, noPhoneRegistration);
        assert.equal(noPhoneRegistration.statusCode, 201);
        assert.equal(noPhoneRegistration.payload.user.email, 'nophone@example.test');
        assert.equal(noPhoneRegistration.payload.user.phone, null);
        assert.equal(noPhoneRegistration.payload.user.emailVerified, false);
        assert.equal(noPhoneRegistration.payload.user.phoneVerified, false);

        const phoneRegistration = createResponse();
        await registerUser({
            body: {
                fullName: 'Phone Customer',
                email: 'phone@example.test',
                phone: '0555 111 22 33',
                password: 'Register123!'
            }
        }, phoneRegistration);
        assert.equal(phoneRegistration.statusCode, 201);
        assert.equal(phoneRegistration.payload.user.phone, '+905551112233');

        const storedNoPhoneUser = controllerPool.users.find(
            (user) => user.email === 'nophone@example.test'
        );
        storedNoPhoneUser.email = '  NoPhone@Example.Test  ';
        const emailLogin = createResponse();
        await loginUser({
            body: {
                email: '  NOPHONE@EXAMPLE.TEST  ',
                password: 'Register123!'
            }
        }, emailLogin);
        assert.equal(emailLogin.statusCode, 200);
        assert.equal(emailLogin.payload.user.email.trim().toLowerCase(), 'nophone@example.test');
        assert.equal(typeof emailLogin.payload.token, 'string');

        const storedPhoneUser = controllerPool.users.find(
            (user) => user.email === 'phone@example.test'
        );
        storedPhoneUser.phone = '05551112233';
        const phoneLogin = createResponse();
        await loginUser({
            body: {
                identifier: '+905551112233',
                password: 'Register123!'
            }
        }, phoneLogin);
        assert.equal(phoneLogin.statusCode, 200);
        assert.equal(phoneLogin.payload.user.email, 'phone@example.test');

        const knownWrongResponse = createResponse();
        const knownWrongStart = Date.now();
        await loginUser({
            body: {
                email: 'nophone@example.test',
                password: 'WrongPassword123!'
            }
        }, knownWrongResponse);
        const knownWrongMs = Date.now() - knownWrongStart;
        const unknownLoginResponse = createResponse();
        const unknownLoginStart = Date.now();
        await loginUser({
            body: {
                email: 'absent@example.test',
                password: 'WrongPassword123!'
            }
        }, unknownLoginResponse);
        const unknownLoginMs = Date.now() - unknownLoginStart;
        assert.equal(knownWrongResponse.statusCode, 400);
        assert.equal(unknownLoginResponse.statusCode, 400);
        assert.deepEqual(knownWrongResponse.payload, unknownLoginResponse.payload);
        assert(knownWrongMs >= 160);
        assert(unknownLoginMs >= 160);
    } finally {
        applicationPool.query = originalApplicationQuery;
        applicationPool.connect = originalApplicationConnect;
    }

    const firstNow = new Date('2026-07-28T10:00:00.000Z');
    const legacyPhonePool = new FakeVerificationPool();
    legacyPhonePool.users[0].phone = '05551112233';
    const legacyPhoneReset = await requestChallenge({
        queryable: legacyPhonePool,
        identifier: '+905551112233',
        purpose: PURPOSES.PASSWORD_RESET,
        now: firstNow
    });
    assert.equal(legacyPhoneReset.unknown, false);
    assert.equal(legacyPhoneReset.userId, 7);

    const hashPool = new FakeVerificationPool();
    const firstReset = await requestChallenge({
        queryable: hashPool,
        identifier: 'CUSTOMER@example.test',
        purpose: PURPOSES.PASSWORD_RESET,
        now: firstNow,
        codeGenerator: () => '123456'
    });
    const storedFirst = hashPool.challenges[0];
    assert.equal(firstReset.channel, CHANNELS.EMAIL);
    assert.equal(storedFirst.code_hash.length, 64);
    assert.equal(storedFirst.code_hash.includes(firstReset.code), false);
    assert.equal(JSON.stringify(storedFirst).includes(firstReset.code), false, 'plaintext code must not be stored');
    await expectVerificationError(requestChallenge({
        queryable: hashPool,
        identifier: 'customer@example.test',
        purpose: PURPOSES.PASSWORD_RESET,
        now: new Date(firstNow.getTime() + (COOLDOWN_SECONDS - 1) * 1000)
    }), 'VERIFICATION_COOLDOWN');

    const replacementCandidates = ['123456', '654321'];
    let replacementGeneratorCalls = 0;
    const replacement = await requestChallenge({
        queryable: hashPool,
        identifier: 'customer@example.test',
        purpose: PURPOSES.PASSWORD_RESET,
        now: new Date(firstNow.getTime() + (COOLDOWN_SECONDS + 1) * 1000),
        codeGenerator: () => {
            const code = replacementCandidates[replacementGeneratorCalls];
            replacementGeneratorCalls += 1;
            return code;
        }
    });
    assert(hashPool.challenges[0].invalidated_at, 'a new code must invalidate the previous code');
    assert.equal(replacementGeneratorCalls, 2, 'a repeated previous code must be regenerated');
    assert.equal(replacement.code, '654321');
    await expectVerificationError(inspectPasswordResetCode({
        queryable: hashPool,
        identifier: 'customer@example.test',
        code: firstReset.code,
        now: new Date(firstNow.getTime() + (COOLDOWN_SECONDS + 2) * 1000)
    }));

    const ratePool = new FakeVerificationPool();
    for (let index = 0; index < RATE_MAX_REQUESTS; index += 1) {
        await requestChallenge({
            queryable: ratePool,
            identifier: 'customer@example.test',
            purpose: PURPOSES.PASSWORD_RESET,
            now: new Date(firstNow.getTime() + index * (COOLDOWN_SECONDS + 1) * 1000)
        });
    }
    await expectVerificationError(requestChallenge({
        queryable: ratePool,
        identifier: 'customer@example.test',
        purpose: PURPOSES.PASSWORD_RESET,
        now: new Date(firstNow.getTime() + RATE_MAX_REQUESTS * (COOLDOWN_SECONDS + 1) * 1000)
    }), 'VERIFICATION_RATE_LIMIT');

    const attemptPool = new FakeVerificationPool();
    const emailCode = await requestChallenge({
        queryable: attemptPool,
        userId: 7,
        purpose: PURPOSES.EMAIL_VERIFICATION,
        now: firstNow
    });
    await expectVerificationError(inspectPasswordResetCode({
        queryable: attemptPool,
        identifier: 'customer@example.test',
        code: emailCode.code,
        now: firstNow
    }), 'VERIFICATION_CODE_INVALID');
    for (let attempt = 1; attempt <= 5; attempt += 1) {
        await expectVerificationError(verifyEmail({
            queryable: attemptPool,
            userId: 7,
            code: '999999',
            now: new Date(firstNow.getTime() + attempt * 1000)
        }));
        assert.equal(attemptPool.challenges[0].attempt_count, attempt);
    }
    assert(attemptPool.challenges[0].invalidated_at, 'attempt limit must invalidate the challenge');
    await expectVerificationError(verifyEmail({
        queryable: attemptPool,
        userId: 7,
        code: emailCode.code,
        now: new Date(firstNow.getTime() + 6000)
    }));

    const expiredPool = new FakeVerificationPool();
    const expiredCode = await requestChallenge({
        queryable: expiredPool,
        userId: 7,
        purpose: PURPOSES.EMAIL_VERIFICATION,
        now: firstNow
    });
    await expectVerificationError(verifyEmail({
        queryable: expiredPool,
        userId: 7,
        code: expiredCode.code,
        now: new Date(firstNow.getTime() + 11 * 60 * 1000)
    }));
    assert(expiredPool.challenges[0].invalidated_at);

    const resetPool = new FakeVerificationPool();
    const reset = await requestChallenge({
        queryable: resetPool,
        identifier: 'customer@example.test',
        purpose: PURPOSES.PASSWORD_RESET,
        now: firstNow
    });
    const inspected = await inspectPasswordResetCode({
        queryable: resetPool,
        identifier: 'customer@example.test',
        code: reset.code,
        now: new Date(firstNow.getTime() + 1000)
    });
    assert.equal(inspected.valid, true);
    assert.equal(resetPool.challenges[0].consumed_at, null, 'verify endpoint must not consume the code');
    await completePasswordReset({
        queryable: resetPool,
        identifier: 'customer@example.test',
        code: reset.code,
        passwordHash: 'new-password-hash',
        now: new Date(firstNow.getTime() + 2000)
    });
    assert.equal(resetPool.users[0].password, 'new-password-hash');
    assert(resetPool.challenges[0].consumed_at);
    assert(resetPool.sessions.every((session) => session.revoked_at && session.revoke_reason === 'password_reset'));
    await expectVerificationError(completePasswordReset({
        queryable: resetPool,
        identifier: 'customer@example.test',
        code: reset.code,
        passwordHash: 'replay-hash',
        now: new Date(firstNow.getTime() + 3000)
    }));
    assert.equal(resetPool.users[0].password, 'new-password-hash');

    const concurrencyPool = new FakeVerificationPool();
    const concurrentReset = await requestChallenge({
        queryable: concurrencyPool,
        identifier: 'customer@example.test',
        purpose: PURPOSES.PASSWORD_RESET,
        now: firstNow
    });
    const concurrentResults = await Promise.allSettled([
        completePasswordReset({
            queryable: concurrencyPool,
            identifier: 'customer@example.test',
            code: concurrentReset.code,
            passwordHash: 'winner-a',
            now: new Date(firstNow.getTime() + 1000)
        }),
        completePasswordReset({
            queryable: concurrencyPool,
            identifier: 'customer@example.test',
            code: concurrentReset.code,
            passwordHash: 'winner-b',
            now: new Date(firstNow.getTime() + 1000)
        })
    ]);
    assert.equal(concurrentResults.filter((entry) => entry.status === 'fulfilled').length, 1);
    assert.equal(concurrentResults.filter((entry) => entry.status === 'rejected').length, 1);

    const sent = [];
    const verificationTransitions = {};
    const transitionPool = new FakeVerificationPool();
    const transitionController = createCustomerVerificationController({
        queryable: transitionPool,
        delivery: {
            isConfigured: () => true,
            async sendCode(challenge) {
                verificationTransitions[challenge.purpose] = challenge;
            }
        },
        publicResponseDelayMs: 0
    });
    const emailSendResponse = createResponse();
    await transitionController.sendEmailVerification({
        user: { id: 7 },
        body: {}
    }, emailSendResponse);
    assert.equal(emailSendResponse.statusCode, 202);
    const emailVerifyResponse = createResponse();
    await transitionController.verifyEmailCode({
        user: { id: 7 },
        body: { code: verificationTransitions[PURPOSES.EMAIL_VERIFICATION].code }
    }, emailVerifyResponse);
    assert.equal(emailVerifyResponse.statusCode, 200);
    assert.equal(transitionPool.users[0].email_verified, true);
    assert(
        transitionPool.challenges.find(
            (challenge) => challenge.purpose === PURPOSES.EMAIL_VERIFICATION
        ).consumed_at
    );

    const phoneSendResponse = createResponse();
    await transitionController.sendPhoneVerification({
        user: { id: 7 },
        body: { phone: '0555 444 33 22' }
    }, phoneSendResponse);
    assert.equal(phoneSendResponse.statusCode, 202);
    const phoneVerifyResponse = createResponse();
    await transitionController.verifyPhoneCode({
        user: { id: 7 },
        body: { code: verificationTransitions[PURPOSES.PHONE_VERIFICATION].code }
    }, phoneVerifyResponse);
    assert.equal(phoneVerifyResponse.statusCode, 200);
    assert.equal(transitionPool.users[0].phone, '+905554443322');
    assert.equal(transitionPool.users[0].phone_verified, true);
    assert(
        transitionPool.challenges.find(
            (challenge) => challenge.purpose === PURPOSES.PHONE_VERIFICATION
        ).consumed_at
    );

    const delivery = createVerificationDelivery({
        emailAdapter: {
            name: 'fake-email',
            isConfigured: () => true,
            async send(message) {
                sent.push(message);
                return { id: 'local-only' };
            }
        },
        smsAdapter: createUnavailableSmsAdapter()
    });
    assert.deepEqual(delivery.status(), { email: 'fake-email', sms: 'unconfigured' });
    assert.equal(createResendEmailAdapter({
        env: { NODE_ENV: 'production', RESEND_API_KEY: 'configured-without-sender' }
    }).isConfigured(), false);
    assert.equal(createResendEmailAdapter({
        env: {
            NODE_ENV: 'production',
            RESEND_API_KEY: 'configured',
            MAIL_FROM: 'NovaStore <destek@example.test>',
            RESEND_VERIFIED_SENDER_DOMAINS: 'example.test'
        }
    }).isConfigured(), true);
    const throwingDelivery = createVerificationDelivery({
        emailAdapter: {
            name: 'throwing-provider',
            isConfigured: () => true,
            async send() {
                throw new Error('provider-secret-payload-must-not-escape');
            }
        },
        smsAdapter: createUnavailableSmsAdapter()
    });
    await assert.rejects(
        throwingDelivery.sendCode({
            channel: CHANNELS.EMAIL,
            destination: 'customer@example.test',
            code: '123456',
            purpose: PURPOSES.EMAIL_VERIFICATION,
            displayName: 'Customer'
        }),
        (error) => (
            error.name === 'VerificationDeliveryError'
            && error.code === 'EMAIL_DELIVERY_FAILED'
            && !String(error.message).includes('provider-secret')
        )
    );
    const enumerationPool = new FakeVerificationPool();
    const controller = createCustomerVerificationController({
        queryable: enumerationPool,
        delivery,
        passwordHasher: async () => 'unused',
        publicResponseDelayMs: 0
    });
    const knownResponse = createResponse();
    await controller.requestPasswordReset({
        body: { identifier: 'customer@example.test' }
    }, knownResponse);
    const unknownResponse = createResponse();
    await controller.requestPasswordReset({
        body: { identifier: 'unknown@example.test' }
    }, unknownResponse);
    assert.equal(knownResponse.statusCode, 202);
    assert.equal(unknownResponse.statusCode, 202);
    assert.deepEqual(knownResponse.payload, { message: RESET_REQUEST_MESSAGE });
    assert.deepEqual(unknownResponse.payload, knownResponse.payload);
    assert.equal(sent.length, 1, 'only an existing account should reach the fake provider');

    const slowDelivery = createVerificationDelivery({
        emailAdapter: {
            name: 'slow-fake-email',
            isConfigured: () => true,
            send: async () => new Promise((resolve) => setTimeout(resolve, 100))
        },
        smsAdapter: createUnavailableSmsAdapter()
    });
    const timingController = createCustomerVerificationController({
        queryable: new FakeVerificationPool(),
        delivery: slowDelivery,
        publicResponseDelayMs: 30
    });
    const knownTimingStart = Date.now();
    await timingController.requestPasswordReset(
        { body: { identifier: 'customer@example.test' } },
        createResponse()
    );
    const knownTimingMs = Date.now() - knownTimingStart;
    const unknownTimingStart = Date.now();
    await timingController.requestPasswordReset(
        { body: { identifier: 'absent@example.test' } },
        createResponse()
    );
    const unknownTimingMs = Date.now() - unknownTimingStart;
    assert(knownTimingMs >= 20 && knownTimingMs < 90, 'known response must follow the bounded schedule');
    assert(unknownTimingMs >= 20 && unknownTimingMs < 90, 'unknown response must follow the bounded schedule');
    const knownVerifyResponse = createResponse();
    const knownVerifyStart = Date.now();
    await timingController.verifyPasswordReset({
        body: { identifier: 'customer@example.test', code: '000000' }
    }, knownVerifyResponse);
    const knownVerifyMs = Date.now() - knownVerifyStart;
    const unknownVerifyResponse = createResponse();
    const unknownVerifyStart = Date.now();
    await timingController.verifyPasswordReset({
        body: { identifier: 'absent@example.test', code: '000000' }
    }, unknownVerifyResponse);
    const unknownVerifyMs = Date.now() - unknownVerifyStart;
    assert(knownVerifyMs >= 20 && knownVerifyMs < 90);
    assert(unknownVerifyMs >= 20 && unknownVerifyMs < 90);
    assert.equal(knownVerifyResponse.statusCode, 400);
    assert.equal(unknownVerifyResponse.statusCode, 400);
    assert.deepEqual(knownVerifyResponse.payload, unknownVerifyResponse.payload);

    for (const protectedPath of [
        '/verification/email/send',
        '/verification/email/verify',
        '/verification/phone/send',
        '/verification/phone/verify'
    ]) {
        const handlers = routeHandlers(protectedPath);
        assert.equal(handlers.length, 2);
        assert.equal(handlers[0], authenticateCustomer);
    }
    const loginHandlers = routeHandlers('/login');
    assert.equal(loginHandlers.length, 2);
    assert.equal(loginHandlers[0], customerLoginRateLimit);
    for (const [publicPath, expectedLimiter] of [
        ['/password-reset/request', customerPasswordResetRequestRateLimit],
        ['/password-reset/verify', customerPasswordResetVerifyRateLimit],
        ['/password-reset/complete', customerPasswordResetCompleteRateLimit]
    ]) {
        const handlers = routeHandlers(publicPath);
        assert.equal(handlers.length, 2);
        assert.equal(handlers[0], expectedLimiter);
    }

    const exercisePublicLimiter = (identifier) => {
        const limiter = createCustomerAuthRateLimit({
            env: process.env,
            windowMs: 60000,
            ipMax: 10,
            identifierMax: 1,
            maxEntries: 4,
            now: () => 1000
        });
        let nextCalls = 0;
        limiter({
            socket: { remoteAddress: '127.0.0.10' },
            path: '/password-reset/request',
            body: { identifier }
        }, createResponse(), () => { nextCalls += 1; });
        const limited = createResponse();
        limiter({
            socket: { remoteAddress: '127.0.0.10' },
            path: '/password-reset/request',
            body: { identifier }
        }, limited, () => { nextCalls += 1; });
        return { nextCalls, limited };
    };
    const knownLimit = exercisePublicLimiter('customer@example.test');
    const unknownLimit = exercisePublicLimiter('absent@example.test');
    assert.equal(knownLimit.nextCalls, 1);
    assert.equal(unknownLimit.nextCalls, 1);
    assert.equal(knownLimit.limited.statusCode, 429);
    assert.equal(unknownLimit.limited.statusCode, 429);
    assert.deepEqual(knownLimit.limited.payload, unknownLimit.limited.payload);
    const loginLimiter = createCustomerAuthRateLimit({
        env: process.env,
        windowMs: 60000,
        ipMax: 10,
        identifierMax: 1,
        responseKind: 'login',
        now: () => 1000
    });
    loginLimiter({
        socket: { remoteAddress: '127.0.0.20' },
        path: '/login',
        body: { email: 'customer@example.test' }
    }, createResponse(), () => {});
    const limitedLogin = createResponse();
    loginLimiter({
        socket: { remoteAddress: '127.0.0.20' },
        path: '/login',
        body: { email: 'customer@example.test' }
    }, limitedLogin, () => {});
    assert.equal(limitedLogin.statusCode, 429);
    assert.deepEqual(limitedLogin.payload, {
        code: 'LOGIN_RATE_LIMIT',
        error: 'E-posta, telefon veya şifre hatalı.'
    });

    const migration = fs.readFileSync(
        path.join(__dirname, '..', 'migrations', '20260728_customer_verification_codes.sql'),
        'utf8'
    );
    assert.match(migration, /email_verified BOOLEAN NOT NULL DEFAULT FALSE/);
    assert.match(migration, /phone_verified BOOLEAN NOT NULL DEFAULT FALSE/);
    assert.match(migration, /code_hash CHAR\(64\) NOT NULL/);
    assert.match(migration, /uq_customer_auth_challenges_active_purpose/);
    assert.match(migration, /uq_users_email_canonical/);
    assert.match(migration, /uq_users_customer_phone_canonical/);
    assert.match(migration, /Canonical customer phone collision blocks verification migration/);
    assert.match(migration, /WHERE consumed_at IS NULL AND invalidated_at IS NULL/);
    assert.match(migration, /trg_users_invalidate_password_reset_challenges/);
    assert.match(migration, /DROP TABLE IF EXISTS customer_auth_challenges/);

    const userControllerSource = fs.readFileSync(
        path.join(__dirname, '..', 'controllers', 'userController.js'),
        'utf8'
    );
    assert.match(userControllerSource, /req\.body\.identifier \|\| req\.body\.email \|\| req\.body\.phone/);
    assert.match(userControllerSource, /email_verified, phone_verified/);
    assert.match(userControllerSource, /phone = req\.body\.phone \? normalizePhone/);
    assert.doesNotMatch(userControllerSource, /err(?:or)?\.message/);
    assert.doesNotMatch(
        fs.readFileSync(
            path.join(__dirname, '..', 'controllers', 'customerVerificationController.js'),
            'utf8'
        ),
        /deliveryError\.message|error\.message|invalidateError\.message/
    );

    console.log(
        'customerVerificationSmoke: PASS register-login-verification-hash-single-use-expiry-rate-enumeration-session-race-routes-provider'
    );
})().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
