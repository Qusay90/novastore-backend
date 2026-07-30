const { getMailFrom } = require('../config/appConfig');
const {
    ExternalSideEffectBlockedError,
    assertExternalSideEffectAllowed
} = require('../config/stagingRuntimePolicy');
const {
    CHANNELS,
    PURPOSES
} = require('./customerVerificationService');

const NETGSM_OTP_ENDPOINT = 'https://api.netgsm.com.tr/sms/send/otp';
const RESEND_API_ORIGIN = 'https://api.resend.com';
const RESEND_IDEMPOTENCY_PREFIX = 'novastore-verification';

class VerificationDeliveryError extends Error {
    constructor(code, statusCode, publicMessage, options = {}) {
        super(code, options);
        this.name = 'VerificationDeliveryError';
        this.code = code;
        this.statusCode = statusCode;
        this.publicMessage = publicMessage;
    }
}

const escapeHtml = (value) => String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const createVerificationIdempotencyKey = ({ challengeId, purpose } = {}) => {
    const normalizedChallengeId = Number(challengeId);
    if (
        !Number.isInteger(normalizedChallengeId)
        || normalizedChallengeId <= 0
        || !Object.values(PURPOSES).includes(purpose)
    ) {
        return null;
    }
    const key = `${RESEND_IDEMPOTENCY_PREFIX}/${purpose}/${normalizedChallengeId}`;
    return key.length <= 256 ? key : null;
};

const parseSenderDomain = (value) => {
    const sender = String(value || '').trim();
    const match = sender.match(/^(?:[^<>\r\n]+<)?([^<>\s@]+@([^<>\s@]+))>?$/);
    return match ? String(match[2]).toLowerCase() : null;
};

const configuredSenderDomains = (env) => new Set(
    String(env.RESEND_VERIFIED_SENDER_DOMAINS || '')
        .split(',')
        .map((domain) => domain.trim().toLowerCase())
        .filter((domain) => /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(domain))
);

const providerConfigurationError = (channel) => new VerificationDeliveryError(
    channel === CHANNELS.SMS
        ? 'SMS_PROVIDER_CONFIGURATION_INVALID'
        : 'EMAIL_PROVIDER_CONFIGURATION_INVALID',
    500,
    channel === CHANNELS.SMS
        ? 'SMS doğrulama servisi güvenli biçimde yapılandırılmadı.'
        : 'E-posta servisi güvenli biçimde yapılandırılmadı.'
);

const assertProviderTlsEnabled = (env, channel) => {
    if (env.NODE_TLS_REJECT_UNAUTHORIZED === '0') {
        throw providerConfigurationError(channel);
    }
};

const resolveResendApiOrigin = (env) => {
    const configuredOrigin = env.RESEND_BASE_URL;
    if (
        configuredOrigin !== undefined
        && configuredOrigin !== RESEND_API_ORIGIN
    ) {
        throw providerConfigurationError(CHANNELS.EMAIL);
    }
    return RESEND_API_ORIGIN;
};

const purposeCopy = (purpose) => {
    if (purpose === PURPOSES.PASSWORD_RESET) {
        return {
            subject: 'NovaStore - Şifre Sıfırlama Kodu',
            heading: 'Şifre sıfırlama kodunuz'
        };
    }
    if (purpose === PURPOSES.EMAIL_VERIFICATION) {
        return {
            subject: 'NovaStore - E-posta Doğrulama Kodu',
            heading: 'E-posta doğrulama kodunuz'
        };
    }
    return {
        subject: 'NovaStore - Doğrulama Kodu',
        heading: 'Doğrulama kodunuz'
    };
};

const resendErrorType = (error) => String(
    error && (error.name || error.type || error.code) || ''
).trim().toLowerCase();

const mapResendProviderError = (error) => {
    const mappings = {
        invalid_idempotency_key: ['EMAIL_IDEMPOTENCY_KEY_INVALID', 500],
        invalid_idempotent_request: ['EMAIL_IDEMPOTENCY_CONFLICT', 502],
        concurrent_idempotent_requests: ['EMAIL_IDEMPOTENCY_IN_PROGRESS', 503],
        missing_api_key: ['EMAIL_PROVIDER_AUTH_FAILED', 503],
        restricted_api_key: ['EMAIL_PROVIDER_AUTH_FAILED', 503],
        invalid_api_key: ['EMAIL_PROVIDER_AUTH_FAILED', 503],
        monthly_quota_exceeded: ['EMAIL_PROVIDER_RATE_LIMITED', 503],
        daily_quota_exceeded: ['EMAIL_PROVIDER_RATE_LIMITED', 503],
        rate_limit_exceeded: ['EMAIL_PROVIDER_RATE_LIMITED', 503],
        application_error: ['EMAIL_PROVIDER_TEMPORARY_FAILURE', 502],
        internal_server_error: ['EMAIL_PROVIDER_TEMPORARY_FAILURE', 502],
        validation_error: ['EMAIL_PROVIDER_REQUEST_REJECTED', 502],
        invalid_from_address: ['EMAIL_PROVIDER_REQUEST_REJECTED', 502],
        missing_required_field: ['EMAIL_PROVIDER_REQUEST_REJECTED', 502],
        invalid_access: ['EMAIL_PROVIDER_AUTH_FAILED', 503],
        invalid_parameter: ['EMAIL_PROVIDER_REQUEST_REJECTED', 502],
        invalid_region: ['EMAIL_PROVIDER_REQUEST_REJECTED', 502],
        method_not_allowed: ['EMAIL_PROVIDER_REQUEST_REJECTED', 502],
        not_found: ['EMAIL_PROVIDER_REQUEST_REJECTED', 502],
        security_error: ['EMAIL_PROVIDER_REQUEST_REJECTED', 502]
    };
    const providerStatus = Number(error?.statusCode || error?.status);
    const fallback = providerStatus === 429
        ? ['EMAIL_PROVIDER_RATE_LIMITED', 503]
        : providerStatus === 401 || providerStatus === 403
            ? ['EMAIL_PROVIDER_AUTH_FAILED', 503]
            : providerStatus >= 400 && providerStatus < 500
                ? ['EMAIL_PROVIDER_REQUEST_REJECTED', 502]
                : providerStatus >= 500
                    ? ['EMAIL_PROVIDER_TEMPORARY_FAILURE', 502]
                    : ['EMAIL_DELIVERY_FAILED', 502];
    const [code, statusCode] = mappings[resendErrorType(error)] || fallback;
    return new VerificationDeliveryError(
        code,
        statusCode,
        'Doğrulama e-postası gönderilemedi.'
    );
};

const boundedProviderTimeout = (value, fallback = 5000) => {
    const parsed = Number(value);
    return Number.isFinite(parsed)
        ? Math.max(10, Math.min(parsed, 15000))
        : fallback;
};

const withProviderTimeout = (promise, {
    timeoutMs,
    code,
    publicMessage,
    onTimeout = () => {}
}) => new Promise((resolve, reject) => {
    let settled = false;
    const finish = (callback, value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        callback(value);
    };
    const timeout = setTimeout(() => {
        try {
            onTimeout();
        } catch (_) {
            // The timeout result stays authoritative even if transport abort fails.
        }
        finish(reject, new VerificationDeliveryError(code, 504, publicMessage));
    }, boundedProviderTimeout(timeoutMs));
    Promise.resolve(promise).then(
        (value) => finish(resolve, value),
        (error) => finish(reject, error)
    );
});

const createResendEmailAdapter = ({
    env = process.env,
    ResendClass,
    timeoutMs = 5000
} = {}) => ({
    name: 'resend',
    isConfigured: () => {
        const senderDomain = parseSenderDomain(env.MAIL_FROM);
        return Boolean(
            String(env.RESEND_API_KEY || '').trim()
            && senderDomain
            && configuredSenderDomains(env).has(senderDomain)
        );
    },
    async send(message, { idempotencyKey } = {}) {
        assertProviderTlsEnabled(env, CHANNELS.EMAIL);
        const resendApiOrigin = resolveResendApiOrigin(env);
        if (!this.isConfigured()) {
            throw new VerificationDeliveryError(
                'EMAIL_PROVIDER_UNAVAILABLE',
                503,
                'E-posta servisi şu anda kullanılamıyor.'
            );
        }
        if (
            typeof idempotencyKey !== 'string'
            || idempotencyKey.length < 1
            || idempotencyKey.length > 256
        ) {
            throw new VerificationDeliveryError(
                'EMAIL_IDEMPOTENCY_KEY_INVALID',
                500,
                'Doğrulama e-postası gönderilemedi.'
            );
        }
        assertExternalSideEffectAllowed('email', env);
        try {
            const ResendProvider = ResendClass || require('resend').Resend;
            const client = new ResendProvider(
                env.RESEND_API_KEY,
                { baseUrl: resendApiOrigin }
            );
            const abortController = new AbortController();
            const result = await withProviderTimeout(
                client.emails.send(message, {
                    idempotencyKey,
                    signal: abortController.signal
                }),
                {
                    timeoutMs,
                    code: 'EMAIL_PROVIDER_TIMEOUT',
                    publicMessage: 'Doğrulama e-postası gönderilemedi.',
                    onTimeout: () => abortController.abort()
                }
            );
            if (result && result.error) throw mapResendProviderError(result.error);
            const messageId = String(result && result.data && result.data.id || '');
            if (!/^[A-Za-z0-9-]{1,128}$/.test(messageId)) {
                throw new VerificationDeliveryError(
                    'EMAIL_DELIVERY_FAILED',
                    502,
                    'Doğrulama e-postası gönderilemedi.'
                );
            }
            return Object.freeze({ provider: 'resend', messageId });
        } catch (error) {
            if (error instanceof VerificationDeliveryError) throw error;
            throw mapResendProviderError(error);
        }
    }
});

const createUnavailableEmailAdapter = () => ({
    name: 'unconfigured',
    isConfigured: () => false,
    async send() {
        throw new VerificationDeliveryError(
            'EMAIL_PROVIDER_UNAVAILABLE',
            503,
            'E-posta servisi şu anda kullanılamıyor.'
        );
    }
});

const NETGSM_ERROR_MAPPINGS = Object.freeze({
    20: Object.freeze(['SMS_PROVIDER_MESSAGE_REJECTED', 502]),
    30: Object.freeze(['SMS_PROVIDER_AUTH_FAILED', 503]),
    40: Object.freeze(['SMS_PROVIDER_SENDER_REJECTED', 503]),
    41: Object.freeze(['SMS_PROVIDER_SENDER_REJECTED', 503]),
    50: Object.freeze(['SMS_PROVIDER_DESTINATION_REJECTED', 502]),
    52: Object.freeze(['SMS_PROVIDER_DESTINATION_REJECTED', 502]),
    60: Object.freeze(['SMS_PROVIDER_PACKAGE_UNAVAILABLE', 503]),
    70: Object.freeze(['SMS_PROVIDER_REQUEST_REJECTED', 502]),
    100: Object.freeze(['SMS_PROVIDER_TEMPORARY_FAILURE', 502])
});

const mapNetgsmResponseCode = (providerCode) => {
    const normalizedCode = String(providerCode || '').trim();
    const [code, statusCode] = NETGSM_ERROR_MAPPINGS[normalizedCode]
        || ['SMS_DELIVERY_FAILED', 502];
    return new VerificationDeliveryError(
        code,
        statusCode,
        'Doğrulama SMS mesajı gönderilemedi.'
    );
};

const mapNetgsmHttpStatus = (httpStatus) => {
    const status = Number(httpStatus);
    const [code, statusCode] = status === 408 || status === 504
        ? ['SMS_PROVIDER_TIMEOUT', 504]
        : status === 429
            ? ['SMS_PROVIDER_RATE_LIMITED', 503]
            : status === 401 || status === 403
                ? ['SMS_PROVIDER_AUTH_FAILED', 503]
                : status >= 400 && status < 500
                    ? ['SMS_PROVIDER_REQUEST_REJECTED', 502]
                    : status >= 500
                        ? ['SMS_PROVIDER_TEMPORARY_FAILURE', 502]
                        : ['SMS_PROVIDER_HTTP_ERROR', 502];
    return new VerificationDeliveryError(
        code,
        statusCode,
        'Doğrulama SMS mesajı gönderilemedi.'
    );
};

const normalizeNetgsmDestination = (destination) => {
    const match = String(destination || '').match(/^\+90(5\d{9})$/);
    return match ? match[1] : null;
};

const escapeXmlText = (value) => String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

const escapeCdata = (value) => String(value || '').replace(/]]>/g, ']]]]><![CDATA[>');

const countXmlTags = (source, pattern) => (
    (String(source || '').match(pattern) || []).length
);

const parseNetgsmOtpResponse = (value) => {
    const source = String(value || '').trim();
    if (
        !source
        || /<!DOCTYPE|<!ENTITY/i.test(source)
        || countXmlTags(source, /<\?xml\b/gi) > 1
    ) {
        return null;
    }

    const document = source.replace(/^<\?xml\s+[^?]*\?>\s*/i, '');
    if (
        countXmlTags(document, /<xml(?:\s[^<>]*)?>/gi) !== 1
        || countXmlTags(document, /<\/xml\s*>/gi) !== 1
        || countXmlTags(document, /<main(?:\s[^<>]*)?>/gi) !== 1
        || countXmlTags(document, /<\/main\s*>/gi) !== 1
    ) {
        return null;
    }

    const envelope = document.match(
        /^<xml(?:\s[^<>]*)?>\s*<main(?:\s[^<>]*)?>([\s\S]*)<\/main\s*>\s*<\/xml\s*>$/i
    );
    if (!envelope) return null;

    const body = envelope[1];
    if (
        countXmlTags(body, /<code(?:\s[^<>]*)?>/gi) !== 1
        || countXmlTags(body, /<\/code\s*>/gi) !== 1
    ) {
        return null;
    }
    const codeMatch = body.match(/<code>\s*(\d{1,3})\s*<\/code>/i);
    if (!codeMatch) return null;

    const providerCode = codeMatch[1];
    const jobIdOpenCount = countXmlTags(body, /<jobID(?:\s[^<>]*)?>/gi);
    const jobIdCloseCount = countXmlTags(body, /<\/jobID\s*>/gi);
    if (jobIdOpenCount !== jobIdCloseCount || jobIdOpenCount > 1) return null;

    if (providerCode !== '0') {
        return Object.freeze({ providerCode, messageId: null });
    }

    const success = body.match(
        /^\s*<code>\s*0\s*<\/code>\s*<jobID>\s*(\d{1,64})\s*<\/jobID>\s*$/i
    );
    if (!success) return null;
    return Object.freeze({ providerCode, messageId: success[1] });
};

const createNetgsmOtpAdapter = ({
    env = process.env,
    fetchImpl = globalThis.fetch,
    timeoutMs = 5000
} = {}) => ({
    name: 'netgsm',
    isConfigured: () => Boolean(
        String(env.NETGSM_USERCODE || '').trim()
        && String(env.NETGSM_PASSWORD || '').trim()
        && /^[A-Za-z0-9]{3,11}$/.test(String(env.NETGSM_MSGHEADER || '').trim())
        && typeof fetchImpl === 'function'
    ),
    async send({ to, text }) {
        assertProviderTlsEnabled(env, CHANNELS.SMS);
        if (!this.isConfigured()) {
            throw new VerificationDeliveryError(
                'SMS_PROVIDER_UNAVAILABLE',
                503,
                'SMS doğrulama servisi şu anda kullanılamıyor.'
            );
        }

        const destination = normalizeNetgsmDestination(to);
        if (!destination) {
            throw new VerificationDeliveryError(
                'SMS_PROVIDER_DESTINATION_REJECTED',
                400,
                'Bu telefon numarasına doğrulama SMS mesajı gönderilemiyor.'
            );
        }
        const message = String(text || '');
        if (!message || message.length > 155 || !/^[\x20-\x7E]+$/.test(message)) {
            throw new VerificationDeliveryError(
                'SMS_PROVIDER_MESSAGE_REJECTED',
                500,
                'Doğrulama SMS mesajı gönderilemedi.'
            );
        }

        assertExternalSideEffectAllowed('sms_or_push', env);
        const abortController = new AbortController();
        const boundedTimeoutMs = boundedProviderTimeout(timeoutMs);
        const timeout = setTimeout(() => abortController.abort(), boundedTimeoutMs);

        try {
            const requestBody = `<?xml version="1.0" encoding="UTF-8"?>
<mainbody>
    <header>
        <usercode>${escapeXmlText(String(env.NETGSM_USERCODE).trim())}</usercode>
        <password>${escapeXmlText(String(env.NETGSM_PASSWORD).trim())}</password>
        <msgheader>${escapeXmlText(String(env.NETGSM_MSGHEADER).trim())}</msgheader>
    </header>
    <body>
        <msg><![CDATA[${escapeCdata(message)}]]></msg>
        <no>${escapeXmlText(destination)}</no>
    </body>
</mainbody>`;
            const response = await fetchImpl(NETGSM_OTP_ENDPOINT, {
                method: 'POST',
                headers: {
                    Accept: 'application/xml, text/xml',
                    'Content-Type': 'application/xml; charset=utf-8'
                },
                body: requestBody,
                signal: abortController.signal
            });
            if (!response || typeof response.text !== 'function') {
                throw new VerificationDeliveryError(
                    'SMS_PROVIDER_RESPONSE_INVALID',
                    502,
                    'Doğrulama SMS mesajı gönderilemedi.'
                );
            }
            if (response.ok !== true) throw mapNetgsmHttpStatus(response.status);

            const responseBody = await response.text();
            if (typeof responseBody !== 'string' || responseBody.length > 8192) {
                throw new VerificationDeliveryError(
                    'SMS_PROVIDER_RESPONSE_INVALID',
                    502,
                    'Doğrulama SMS mesajı gönderilemedi.'
                );
            }
            const parsedResponse = parseNetgsmOtpResponse(responseBody);
            if (!parsedResponse) {
                throw new VerificationDeliveryError(
                    'SMS_PROVIDER_RESPONSE_INVALID',
                    502,
                    'Doğrulama SMS mesajı gönderilemedi.'
                );
            }
            const { providerCode, messageId } = parsedResponse;
            if (providerCode !== '0') throw mapNetgsmResponseCode(providerCode);
            if (!/^\d{1,64}$/.test(messageId)) {
                throw new VerificationDeliveryError(
                    'SMS_PROVIDER_RESPONSE_INVALID',
                    502,
                    'Doğrulama SMS mesajı gönderilemedi.'
                );
            }
            return Object.freeze({ provider: 'netgsm', messageId });
        } catch (error) {
            if (error instanceof VerificationDeliveryError) throw error;
            if (error && error.name === 'AbortError') {
                throw new VerificationDeliveryError(
                    'SMS_PROVIDER_TIMEOUT',
                    504,
                    'Doğrulama SMS mesajı gönderilemedi.'
                );
            }
            throw new VerificationDeliveryError(
                'SMS_DELIVERY_FAILED',
                502,
                'Doğrulama SMS mesajı gönderilemedi.'
            );
        } finally {
            clearTimeout(timeout);
        }
    }
});

const createUnavailableSmsAdapter = () => ({
    name: 'unconfigured',
    isConfigured: () => false,
    async send() {
        throw new VerificationDeliveryError(
            'SMS_PROVIDER_UNAVAILABLE',
            503,
            'SMS doğrulama servisi henüz yapılandırılmadı.'
        );
    }
});

const createDefaultSmsAdapter = ({ env = process.env } = {}) => (
    String(env.SMS_PROVIDER || '').trim().toLowerCase() === 'netgsm'
        ? createNetgsmOtpAdapter({ env })
        : createUnavailableSmsAdapter()
);

const createDefaultEmailAdapter = ({ env = process.env, ResendClass } = {}) => (
    String(env.EMAIL_PROVIDER || '').trim().toLowerCase() === 'resend'
        ? createResendEmailAdapter({ env, ResendClass })
        : createUnavailableEmailAdapter()
);

const sanitizedDeliveryError = (channel) => (
    new VerificationDeliveryError(
        channel === CHANNELS.SMS ? 'SMS_DELIVERY_FAILED' : 'EMAIL_DELIVERY_FAILED',
        502,
        channel === CHANNELS.SMS
            ? 'Doğrulama SMS mesajı gönderilemedi.'
            : 'Doğrulama e-postası gönderilemedi.'
    )
);

const createVerificationDelivery = ({
    env = process.env,
    emailAdapter = createDefaultEmailAdapter({ env }),
    smsAdapter = createDefaultSmsAdapter({ env })
} = {}) => {
    const adapters = {
        [CHANNELS.EMAIL]: emailAdapter,
        [CHANNELS.SMS]: smsAdapter
    };

    const getAdapter = (channel) => {
        const adapter = adapters[channel];
        if (!adapter) {
            throw new VerificationDeliveryError(
                'VERIFICATION_CHANNEL_UNSUPPORTED',
                400,
                'Doğrulama kanalı desteklenmiyor.'
            );
        }
        return adapter;
    };

    return Object.freeze({
        status() {
            return Object.freeze({
                email: emailAdapter.isConfigured() ? emailAdapter.name : 'unconfigured',
                sms: smsAdapter.isConfigured() ? smsAdapter.name : 'unconfigured'
            });
        },
        isConfigured(channel) {
            return getAdapter(channel).isConfigured();
        },
        async sendCode({ channel, destination, code, purpose, displayName, challengeId }) {
            try {
                const adapter = getAdapter(channel);
                if (!adapter.isConfigured()) return await adapter.send({});
                if (channel === CHANNELS.SMS) {
                    assertExternalSideEffectAllowed('sms_or_push', env);
                    return await adapter.send({
                        to: destination,
                        text: `NovaStore dogrulama kodunuz: ${code}. Kod 10 dakika gecerlidir.`,
                        purpose
                    });
                }

                const copy = purposeCopy(purpose);
                return await adapter.send(
                    {
                        from: getMailFrom(env),
                        to: destination,
                        subject: copy.subject,
                        html: `
                            <div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;padding:24px">
                                <h2>${escapeHtml(copy.heading)}</h2>
                                <p>Merhaba ${escapeHtml(displayName)},</p>
                                <p>Tek kullanımlık kodunuz:</p>
                                <p style="font-size:32px;font-weight:700;letter-spacing:8px">${escapeHtml(code)}</p>
                                <p>Bu kod 10 dakika geçerlidir. Kodu kimseyle paylaşmayın.</p>
                            </div>
                        `
                    },
                    {
                        idempotencyKey: createVerificationIdempotencyKey({ challengeId, purpose })
                    }
                );
            } catch (error) {
                if (
                    error instanceof VerificationDeliveryError
                    || error instanceof ExternalSideEffectBlockedError
                ) throw error;
                throw sanitizedDeliveryError(channel);
            }
        }
    });
};

const defaultDelivery = createVerificationDelivery();

module.exports = {
    ExternalSideEffectBlockedError,
    NETGSM_OTP_ENDPOINT,
    RESEND_API_ORIGIN,
    VerificationDeliveryError,
    createDefaultEmailAdapter,
    createDefaultSmsAdapter,
    createNetgsmOtpAdapter,
    createResendEmailAdapter,
    createUnavailableEmailAdapter,
    createUnavailableSmsAdapter,
    createVerificationDelivery,
    createVerificationIdempotencyKey,
    defaultDelivery,
    mapNetgsmResponseCode,
    mapNetgsmHttpStatus,
    mapResendProviderError,
    sanitizedDeliveryError
};
