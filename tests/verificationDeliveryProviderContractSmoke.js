const assert = require('node:assert/strict');

const {
    CHANNELS,
    PURPOSES
} = require('../services/customerVerificationService');
const {
    NETGSM_OTP_ENDPOINT,
    RESEND_API_ORIGIN,
    createDefaultEmailAdapter,
    createDefaultSmsAdapter,
    createNetgsmOtpAdapter,
    createResendEmailAdapter,
    createVerificationDelivery,
    createVerificationIdempotencyKey,
    mapNetgsmHttpStatus,
    mapNetgsmResponseCode,
    mapResendProviderError
} = require('../services/verificationDeliveryService');

const resendEnv = Object.freeze({
    NODE_ENV: 'production',
    EMAIL_PROVIDER: 'resend',
    RESEND_API_KEY: 're_provider_contract_test',
    MAIL_FROM: 'NovaStore <security@novastore.test>',
    RESEND_VERIFIED_SENDER_DOMAINS: 'novastore.test'
});

const withTemporaryRuntime = async ({ env = {}, fetchImpl }, callback) => {
    const previousFetch = globalThis.fetch;
    const previousEnv = new Map(
        Object.keys(env).map((key) => [
            key,
            Object.prototype.hasOwnProperty.call(process.env, key)
                ? process.env[key]
                : undefined
        ])
    );
    try {
        for (const [key, value] of Object.entries(env)) {
            if (value === undefined) {
                delete process.env[key];
            } else {
                process.env[key] = value;
            }
        }
        globalThis.fetch = fetchImpl;
        return await callback();
    } finally {
        for (const [key, value] of previousEnv.entries()) {
            if (value === undefined) {
                delete process.env[key];
            } else {
                process.env[key] = value;
            }
        }
        if (previousFetch === undefined) {
            delete globalThis.fetch;
        } else {
            globalThis.fetch = previousFetch;
        }
    }
};

const createResendClass = ({ calls, result, thrown }) => class FakeResend {
    constructor(apiKey, options) {
        assert.equal(apiKey, resendEnv.RESEND_API_KEY);
        assert.deepEqual(options, { baseUrl: RESEND_API_ORIGIN });
        this.emails = {
            send: async (message, options) => {
                calls.push({ message, options });
                if (thrown) throw thrown;
                return result;
            }
        };
    }
};

(async () => {
    assert.equal(typeof mapNetgsmHttpStatus, 'function');
    assert.equal(createDefaultEmailAdapter({ env: {} }).name, 'unconfigured');
    assert.equal(createDefaultSmsAdapter({ env: {} }).name, 'unconfigured');
    assert.equal(createResendEmailAdapter({
        env: { ...resendEnv, MAIL_FROM: 'NovaStore <security@other.test>' }
    }).isConfigured(), false);
    assert.equal(createResendEmailAdapter({
        env: { ...resendEnv, RESEND_VERIFIED_SENDER_DOMAINS: '' }
    }).isConfigured(), false);

    const resendCalls = [];
    const resendAdapter = createResendEmailAdapter({
        env: resendEnv,
        ResendClass: createResendClass({
            calls: resendCalls,
            result: { data: { id: '49a3999c-0ce1-4ea6-ab68-afcd6dc2e794' } }
        })
    });
    const emailDelivery = createVerificationDelivery({
        env: resendEnv,
        emailAdapter: resendAdapter
    });
    const emailChallenge = {
        channel: CHANNELS.EMAIL,
        destination: 'customer@example.test',
        code: '123456',
        purpose: PURPOSES.EMAIL_VERIFICATION,
        displayName: 'Customer',
        challengeId: 417
    };
    const firstEmailResult = await emailDelivery.sendCode(emailChallenge);
    const secondEmailResult = await emailDelivery.sendCode(emailChallenge);
    assert.deepEqual(firstEmailResult, {
        provider: 'resend',
        messageId: '49a3999c-0ce1-4ea6-ab68-afcd6dc2e794'
    });
    assert.deepEqual(secondEmailResult, firstEmailResult);
    assert.equal(resendCalls.length, 2);
    assert.deepEqual(resendCalls[0].message, resendCalls[1].message);
    assert.equal(
        resendCalls[0].options.idempotencyKey,
        'novastore-verification/email_verification/417'
    );
    assert.equal(
        resendCalls[1].options.idempotencyKey,
        resendCalls[0].options.idempotencyKey
    );
    assert.equal(resendCalls[0].options.signal instanceof AbortSignal, true);
    assert.equal(resendCalls[1].options.signal instanceof AbortSignal, true);
    assert.equal(resendCalls[0].options.signal.aborted, false);
    assert.equal(resendCalls[1].options.signal.aborted, false);

    const maliciousResendOrigins = [
        'https://synthetic.invalid',
        'https://api.resend.com/redirect',
        'https://user@api.resend.com',
        'https://api.resend.com:443',
        'https://api.resend.com.evil.test',
        'https://api-resend.com'
    ];
    let rejectedOriginProviderConstructions = 0;
    class RejectedOriginResend {
        constructor() {
            rejectedOriginProviderConstructions += 1;
            throw new Error('provider must not be constructed');
        }
    }
    for (const maliciousOrigin of maliciousResendOrigins) {
        const rejectedOriginAdapter = createResendEmailAdapter({
            env: { ...resendEnv, RESEND_BASE_URL: maliciousOrigin },
            ResendClass: RejectedOriginResend
        });
        await assert.rejects(
            rejectedOriginAdapter.send(
                resendCalls[0].message,
                resendCalls[0].options
            ),
            (error) => (
                error.code === 'EMAIL_PROVIDER_CONFIGURATION_INVALID'
                && error.statusCode === 500
            )
        );
    }
    assert.equal(
        rejectedOriginProviderConstructions,
        0,
        'non-canonical Resend origins must fail before provider construction or fetch'
    );

    let rejectedOriginFetches = 0;
    await withTemporaryRuntime(
        {
            env: {
                ...resendEnv,
                RESEND_BASE_URL: 'https://synthetic.invalid',
                NODE_TLS_REJECT_UNAUTHORIZED: undefined,
                NOVASTORE_DEPLOY_ENV: undefined
            },
            fetchImpl: async () => {
                rejectedOriginFetches += 1;
                throw new Error('fetch must not run');
            }
        },
        async () => {
            const rejectedRealSdkAdapter = createResendEmailAdapter();
            await assert.rejects(
                rejectedRealSdkAdapter.send(
                    resendCalls[0].message,
                    resendCalls[0].options
                ),
                (error) => (
                    error.code === 'EMAIL_PROVIDER_CONFIGURATION_INVALID'
                    && error.statusCode === 500
                )
            );
        }
    );
    assert.equal(
        rejectedOriginFetches,
        0,
        'non-canonical process RESEND_BASE_URL must fail before real SDK fetch'
    );

    const realSdkCalls = [];
    const temporaryRuntimeKeys = [
        ...Object.keys(resendEnv),
        'RESEND_BASE_URL',
        'NODE_TLS_REJECT_UNAUTHORIZED',
        'NOVASTORE_DEPLOY_ENV'
    ];
    const runtimeEnvBefore = new Map(
        temporaryRuntimeKeys.map((key) => [
            key,
            {
                present: Object.prototype.hasOwnProperty.call(process.env, key),
                value: process.env[key]
            }
        ])
    );
    const globalFetchBefore = globalThis.fetch;
    await withTemporaryRuntime(
        {
            env: {
                ...resendEnv,
                RESEND_BASE_URL: RESEND_API_ORIGIN,
                NODE_TLS_REJECT_UNAUTHORIZED: undefined,
                NOVASTORE_DEPLOY_ENV: undefined
            },
            fetchImpl: async (url, options) => {
                const headers = new Headers(options.headers);
                realSdkCalls.push({
                    url,
                    method: options.method,
                    authorizationPresent: Boolean(headers.get('authorization')),
                    idempotencyKey: headers.get('idempotency-key')
                });
                return {
                    ok: true,
                    status: 200,
                    headers: new Headers(),
                    json: async () => ({
                        id: '49a3999c-0ce1-4ea6-ab68-afcd6dc2e795'
                    })
                };
            }
        },
        async () => {
            const realSdkAdapter = createResendEmailAdapter();
            const result = await realSdkAdapter.send(
                resendCalls[0].message,
                resendCalls[0].options
            );
            assert.deepEqual(result, {
                provider: 'resend',
                messageId: '49a3999c-0ce1-4ea6-ab68-afcd6dc2e795'
            });
        }
    );
    assert.equal(globalThis.fetch, globalFetchBefore);
    for (const [key, before] of runtimeEnvBefore.entries()) {
        assert.equal(
            Object.prototype.hasOwnProperty.call(process.env, key),
            before.present
        );
        assert.equal(process.env[key], before.value);
    }
    assert.deepEqual(realSdkCalls, [{
        url: 'https://api.resend.com/emails',
        method: 'POST',
        authorizationPresent: true,
        idempotencyKey: 'novastore-verification/email_verification/417'
    }]);

    let tlsDisabledResendConstructions = 0;
    class TlsDisabledResend {
        constructor() {
            tlsDisabledResendConstructions += 1;
            throw new Error('provider must not be constructed');
        }
    }
    const tlsDisabledResend = createResendEmailAdapter({
        env: {
            ...resendEnv,
            RESEND_BASE_URL: RESEND_API_ORIGIN,
            NODE_TLS_REJECT_UNAUTHORIZED: '0'
        },
        ResendClass: TlsDisabledResend
    });
    await assert.rejects(
        tlsDisabledResend.send(
            resendCalls[0].message,
            resendCalls[0].options
        ),
        (error) => (
            error.code === 'EMAIL_PROVIDER_CONFIGURATION_INVALID'
            && error.statusCode === 500
        )
    );
    assert.equal(
        tlsDisabledResendConstructions,
        0,
        'TLS-disabled Resend must fail before provider construction or fetch'
    );
    assert.equal(
        createVerificationIdempotencyKey({
            challengeId: 418,
            purpose: PURPOSES.EMAIL_VERIFICATION
        }),
        'novastore-verification/email_verification/418'
    );
    assert.equal(createVerificationIdempotencyKey({
        challengeId: 0,
        purpose: PURPOSES.EMAIL_VERIFICATION
    }), null);

    await assert.rejects(
        emailDelivery.sendCode({ ...emailChallenge, challengeId: undefined }),
        (error) => error.code === 'EMAIL_IDEMPOTENCY_KEY_INVALID'
    );
    assert.equal(resendCalls.length, 2, 'invalid idempotency context must fail before provider call');

    const resendMappings = {
        invalid_idempotency_key: ['EMAIL_IDEMPOTENCY_KEY_INVALID', 500],
        invalid_idempotent_request: ['EMAIL_IDEMPOTENCY_CONFLICT', 502],
        concurrent_idempotent_requests: ['EMAIL_IDEMPOTENCY_IN_PROGRESS', 503],
        missing_api_key: ['EMAIL_PROVIDER_AUTH_FAILED', 503],
        invalid_api_key: ['EMAIL_PROVIDER_AUTH_FAILED', 503],
        rate_limit_exceeded: ['EMAIL_PROVIDER_RATE_LIMITED', 503],
        application_error: ['EMAIL_PROVIDER_TEMPORARY_FAILURE', 502],
        validation_error: ['EMAIL_PROVIDER_REQUEST_REJECTED', 502],
        invalid_access: ['EMAIL_PROVIDER_AUTH_FAILED', 503],
        invalid_parameter: ['EMAIL_PROVIDER_REQUEST_REJECTED', 502],
        invalid_region: ['EMAIL_PROVIDER_REQUEST_REJECTED', 502],
        method_not_allowed: ['EMAIL_PROVIDER_REQUEST_REJECTED', 502],
        not_found: ['EMAIL_PROVIDER_REQUEST_REJECTED', 502],
        security_error: ['EMAIL_PROVIDER_REQUEST_REJECTED', 502]
    };
    for (const [providerType, [expectedCode, expectedStatus]] of Object.entries(resendMappings)) {
        const mapped = mapResendProviderError({
            name: providerType,
            message: 'provider-secret-must-not-escape'
        });
        assert.equal(mapped.code, expectedCode);
        assert.equal(mapped.statusCode, expectedStatus);
        assert.doesNotMatch(JSON.stringify(mapped), /provider-secret/);
    }

    const resendHttpMappings = {
        401: ['EMAIL_PROVIDER_AUTH_FAILED', 503],
        403: ['EMAIL_PROVIDER_AUTH_FAILED', 503],
        422: ['EMAIL_PROVIDER_REQUEST_REJECTED', 502],
        429: ['EMAIL_PROVIDER_RATE_LIMITED', 503],
        500: ['EMAIL_PROVIDER_TEMPORARY_FAILURE', 502],
        503: ['EMAIL_PROVIDER_TEMPORARY_FAILURE', 502]
    };
    for (const [httpStatus, [expectedCode, expectedStatus]] of Object.entries(resendHttpMappings)) {
        const mapped = mapResendProviderError({
            name: 'unknown_provider_error',
            statusCode: Number(httpStatus),
            message: 'provider-secret-must-not-escape'
        });
        assert.equal(mapped.code, expectedCode);
        assert.equal(mapped.statusCode, expectedStatus);
        assert.doesNotMatch(JSON.stringify(mapped), /provider-secret/);
    }

    const failedResend = createResendEmailAdapter({
        env: resendEnv,
        ResendClass: createResendClass({
            calls: [],
            result: {
                error: {
                    name: 'invalid_idempotent_request',
                    message: 'provider-secret-must-not-escape'
                }
            }
        })
    });
    await assert.rejects(
        failedResend.send(
            resendCalls[0].message,
            resendCalls[0].options
        ),
        (error) => (
            error.code === 'EMAIL_IDEMPOTENCY_CONFLICT'
            && !JSON.stringify(error).includes('provider-secret')
        )
    );

    const missingIdResend = createResendEmailAdapter({
        env: resendEnv,
        ResendClass: createResendClass({
            calls: [],
            result: { data: {} }
        })
    });
    await assert.rejects(
        missingIdResend.send(resendCalls[0].message, resendCalls[0].options),
        (error) => error.code === 'EMAIL_DELIVERY_FAILED'
    );

    const thrownResend = createResendEmailAdapter({
        env: resendEnv,
        ResendClass: createResendClass({
            calls: [],
            thrown: new Error('provider-secret-must-not-escape')
        })
    });
    await assert.rejects(
        thrownResend.send(resendCalls[0].message, resendCalls[0].options),
        (error) => (
            error.code === 'EMAIL_DELIVERY_FAILED'
            && !JSON.stringify(error).includes('provider-secret')
        )
    );

    let resendTimeoutSignalObserved = false;
    let resendProviderAborted = false;
    let resendProviderCompleted = false;
    class AbortAwareResend {
        constructor(apiKey) {
            assert.equal(apiKey, resendEnv.RESEND_API_KEY);
            this.emails = {
                send: async (_message, options) => new Promise((resolve, reject) => {
                    resendTimeoutSignalObserved = options.signal instanceof AbortSignal;
                    const completionTimer = setTimeout(() => {
                        resendProviderCompleted = true;
                        resolve({ data: { id: 'late-provider-result' } });
                    }, 100);
                    options.signal?.addEventListener('abort', () => {
                        clearTimeout(completionTimer);
                        resendProviderAborted = true;
                        const error = new Error('synthetic-resend-timeout');
                        error.name = 'AbortError';
                        reject(error);
                    }, { once: true });
                })
            };
        }
    }
    const timedOutResend = createResendEmailAdapter({
        env: resendEnv,
        timeoutMs: 25,
        ResendClass: AbortAwareResend
    });
    await assert.rejects(
        timedOutResend.send(resendCalls[0].message, resendCalls[0].options),
        (error) => (
            error.code === 'EMAIL_PROVIDER_TIMEOUT'
            && error.statusCode === 504
        )
    );
    assert.equal(resendTimeoutSignalObserved, true);
    assert.equal(resendProviderAborted, true);
    await new Promise((resolve) => setTimeout(resolve, 110));
    assert.equal(resendProviderCompleted, false);

    const netgsmEnv = Object.freeze({
        NODE_ENV: 'production',
        SMS_PROVIDER: 'netgsm',
        NETGSM_USERCODE: '850<&',
        NETGSM_PASSWORD: 'password<&',
        NETGSM_MSGHEADER: 'NOVASTORE'
    });
    const netgsmCalls = [];
    const netgsmAdapter = createNetgsmOtpAdapter({
        env: netgsmEnv,
        fetchImpl: async (url, options) => {
            netgsmCalls.push({ url, options });
            return {
                ok: true,
                text: async () => `<?xml version="1.0"?>
                    <xml><main><code>0</code><jobID>172551745916519453710565585</jobID></main></xml>`
            };
        }
    });
    assert.equal(netgsmAdapter.isConfigured(), true);
    const netgsmResult = await netgsmAdapter.send({
        to: '+905101112233',
        text: 'NovaStore OTP ]]> 123456'
    });
    assert.deepEqual(netgsmResult, {
        provider: 'netgsm',
        messageId: '172551745916519453710565585'
    });
    assert.equal(netgsmCalls.length, 1);
    assert.equal(netgsmCalls[0].url, NETGSM_OTP_ENDPOINT);
    assert.equal(netgsmCalls[0].options.method, 'POST');
    assert.equal(
        netgsmCalls[0].options.headers['Content-Type'],
        'application/xml; charset=utf-8'
    );
    assert.equal('Authorization' in netgsmCalls[0].options.headers, false);
    assert.match(netgsmCalls[0].options.body, /<usercode>850&lt;&amp;<\/usercode>/);
    assert.match(netgsmCalls[0].options.body, /<password>password&lt;&amp;<\/password>/);
    assert.match(netgsmCalls[0].options.body, /<no>5101112233<\/no>/);
    assert.match(netgsmCalls[0].options.body, /<!\[CDATA\[NovaStore OTP \]\]\]\]><!\[CDATA\[> 123456\]\]>/);

    let tlsDisabledNetgsmFetches = 0;
    const tlsDisabledNetgsm = createNetgsmOtpAdapter({
        env: {
            ...netgsmEnv,
            NODE_TLS_REJECT_UNAUTHORIZED: '0'
        },
        fetchImpl: async () => {
            tlsDisabledNetgsmFetches += 1;
            throw new Error('fetch must not run');
        }
    });
    await assert.rejects(
        tlsDisabledNetgsm.send({
            to: '+905101112233',
            text: 'OTP 123456'
        }),
        (error) => (
            error.code === 'SMS_PROVIDER_CONFIGURATION_INVALID'
            && error.statusCode === 500
        )
    );
    assert.equal(
        tlsDisabledNetgsmFetches,
        0,
        'TLS-disabled Netgsm must fail before fetch'
    );

    const netgsmMappings = {
        20: ['SMS_PROVIDER_MESSAGE_REJECTED', 502],
        30: ['SMS_PROVIDER_AUTH_FAILED', 503],
        40: ['SMS_PROVIDER_SENDER_REJECTED', 503],
        41: ['SMS_PROVIDER_SENDER_REJECTED', 503],
        50: ['SMS_PROVIDER_DESTINATION_REJECTED', 502],
        52: ['SMS_PROVIDER_DESTINATION_REJECTED', 502],
        60: ['SMS_PROVIDER_PACKAGE_UNAVAILABLE', 503],
        70: ['SMS_PROVIDER_REQUEST_REJECTED', 502],
        100: ['SMS_PROVIDER_TEMPORARY_FAILURE', 502]
    };
    for (const [providerCode, [expectedCode, expectedStatus]] of Object.entries(netgsmMappings)) {
        const mapped = mapNetgsmResponseCode(providerCode);
        assert.equal(mapped.code, expectedCode);
        assert.equal(mapped.statusCode, expectedStatus);
    }

    const netgsmHttpMappings = {
        401: ['SMS_PROVIDER_AUTH_FAILED', 503],
        403: ['SMS_PROVIDER_AUTH_FAILED', 503],
        408: ['SMS_PROVIDER_TIMEOUT', 504],
        422: ['SMS_PROVIDER_REQUEST_REJECTED', 502],
        429: ['SMS_PROVIDER_RATE_LIMITED', 503],
        500: ['SMS_PROVIDER_TEMPORARY_FAILURE', 502],
        503: ['SMS_PROVIDER_TEMPORARY_FAILURE', 502],
        504: ['SMS_PROVIDER_TIMEOUT', 504]
    };
    for (const [httpStatus, [expectedCode, expectedStatus]] of Object.entries(netgsmHttpMappings)) {
        const mapped = mapNetgsmHttpStatus(Number(httpStatus));
        assert.equal(mapped.code, expectedCode);
        assert.equal(mapped.statusCode, expectedStatus);
    }

    const rejectedNetgsm = createNetgsmOtpAdapter({
        env: netgsmEnv,
        fetchImpl: async () => ({
            ok: true,
            text: async () => '<xml><main><code>30</code><error>provider-secret</error></main></xml>'
        })
    });
    await assert.rejects(
        rejectedNetgsm.send({ to: '+905101112233', text: 'OTP 123456' }),
        (error) => (
            error.code === 'SMS_PROVIDER_AUTH_FAILED'
            && !JSON.stringify(error).includes('provider-secret')
        )
    );

    for (const [httpStatus, [expectedCode, expectedStatus]] of Object.entries(netgsmHttpMappings)) {
        const httpFailureAdapter = createNetgsmOtpAdapter({
            env: netgsmEnv,
            fetchImpl: async () => ({
                ok: false,
                status: Number(httpStatus),
                text: async () => '<xml><main><error>provider-secret</error></main></xml>'
            })
        });
        await assert.rejects(
            httpFailureAdapter.send({ to: '+905101112233', text: 'OTP 123456' }),
            (error) => (
                error.code === expectedCode
                && error.statusCode === expectedStatus
                && !JSON.stringify(error).includes('provider-secret')
            )
        );
    }

    for (const malformedBody of [
        '',
        '<html>upstream proxy</html>',
        'junk<code>0</code><jobID>123</jobID>junk',
        '<html><code>0</code><jobID>123</jobID></html>',
        '<xml><main><code>0</code><code>30</code><jobID>123</jobID></main></xml>',
        '<xml><main><code>0</code></main></xml>',
        '<xml><main><code></code><jobID>123</jobID></main></xml>'
    ]) {
        const malformedNetgsm = createNetgsmOtpAdapter({
            env: netgsmEnv,
            fetchImpl: async () => ({
                ok: true,
                status: 200,
                text: async () => malformedBody
            })
        });
        await assert.rejects(
            malformedNetgsm.send({ to: '+905101112233', text: 'OTP 123456' }),
            (error) => error.code === 'SMS_PROVIDER_RESPONSE_INVALID'
        );
    }

    const oversizedNetgsm = createNetgsmOtpAdapter({
        env: netgsmEnv,
        fetchImpl: async () => ({
            ok: true,
            status: 200,
            text: async () => 'x'.repeat(8193)
        })
    });
    await assert.rejects(
        oversizedNetgsm.send({ to: '+905101112233', text: 'OTP 123456' }),
        (error) => error.code === 'SMS_PROVIDER_RESPONSE_INVALID'
    );

    let timeoutSignalObserved = false;
    const timeoutNetgsm = createNetgsmOtpAdapter({
        env: netgsmEnv,
        timeoutMs: 25,
        fetchImpl: async (_url, options) => new Promise((_resolve, reject) => {
            timeoutSignalObserved = Boolean(options.signal);
            options.signal.addEventListener('abort', () => {
                const error = new Error('synthetic-timeout-secret');
                error.name = 'AbortError';
                reject(error);
            }, { once: true });
        })
    });
    await assert.rejects(
        timeoutNetgsm.send({ to: '+905101112233', text: 'OTP 123456' }),
        (error) => (
            error.code === 'SMS_PROVIDER_TIMEOUT'
            && error.statusCode === 504
            && !JSON.stringify(error).includes('synthetic-timeout-secret')
        )
    );
    assert.equal(timeoutSignalObserved, true);

    const connectionFailureNetgsm = createNetgsmOtpAdapter({
        env: netgsmEnv,
        fetchImpl: async () => {
            throw new Error('synthetic-connection-secret');
        }
    });
    await assert.rejects(
        connectionFailureNetgsm.send({ to: '+905101112233', text: 'OTP 123456' }),
        (error) => (
            error.code === 'SMS_DELIVERY_FAILED'
            && !JSON.stringify(error).includes('synthetic-connection-secret')
        )
    );

    let disabledProviderCalls = 0;
    const disabledNetgsm = createNetgsmOtpAdapter({
        env: { SMS_PROVIDER: 'netgsm' },
        fetchImpl: async () => {
            disabledProviderCalls += 1;
            throw new Error('must not run');
        }
    });
    await assert.rejects(
        disabledNetgsm.send({ to: '+905101112233', text: 'OTP 123456' }),
        (error) => error.code === 'SMS_PROVIDER_UNAVAILABLE'
    );
    assert.equal(disabledProviderCalls, 0);
    assert.equal(
        createDefaultSmsAdapter({ env: { ...netgsmEnv, SMS_PROVIDER: 'disabled' } }).name,
        'unconfigured'
    );

    const source = require('node:fs').readFileSync(
        require('node:path').join(__dirname, '..', 'services', 'verificationDeliveryService.js'),
        'utf8'
    );
    assert.doesNotMatch(source, /console\.(?:log|warn|error)/);

    console.log('verificationDeliveryProviderContractSmoke: PASS');
})().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
