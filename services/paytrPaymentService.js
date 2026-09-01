const crypto = require('crypto');
const net = require('net');
const { assertExternalSideEffectAllowed } = require('../config/stagingRuntimePolicy');

const DEFAULT_PAYTR_BASE_URL = 'https://www.paytr.com';
const PAYTR_TOKEN_URL = 'https://www.paytr.com/odeme/api/get-token';
const MERCHANT_OID_PREFIX = 'NSTPAYTR';

class PaytrPaymentServiceError extends Error {
    constructor(message) {
        super(message);
        this.name = 'PaytrPaymentServiceError';
    }
}

class PaytrProviderTransportError extends Error {
    constructor(code, publicMessage = 'Güvenli ödeme sağlayıcısına şu anda ulaşılamıyor.') {
        super(publicMessage);
        this.name = 'PaytrProviderTransportError';
        this.code = code;
        this.statusCode = 502;
        this.publicMessage = publicMessage;
    }
}

const normalizeUrl = (value) => String(value || '').trim().replace(/\/+$/, '');

const toSafeString = (value, fallback = '') => String(value === undefined || value === null ? fallback : value)
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const assertPlainObject = (value, name) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new PaytrPaymentServiceError(`${name} must be an object.`);
    }
};

const getOrderId = (order) => {
    assertPlainObject(order, 'order');
    const id = Number(order.id);
    if (!Number.isInteger(id) || id <= 0) {
        throw new PaytrPaymentServiceError('order.id must be a positive integer.');
    }
    return id;
};

const buildPaytrMerchantOid = (orderOrRandomBytes = null, suppliedRandomBytes = crypto.randomBytes) => {
    // PayTR's merchant_oid is the provider-facing payment identity. It must be
    // available before any order INSERT (and therefore before consuming an
    // order sequence value). Keep the legacy first argument shape compatible,
    // but deliberately never derive the reference from order.id.
    const randomBytes = typeof orderOrRandomBytes === 'function'
        ? orderOrRandomBytes
        : suppliedRandomBytes;
    if (typeof randomBytes !== 'function') {
        throw new TypeError('randomBytes must be a function.');
    }
    const randomValue = randomBytes(20);
    if (!Buffer.isBuffer(randomValue) || randomValue.length !== 20) {
        throw new PaytrPaymentServiceError('merchant_oid requires exactly 160 bits of randomness.');
    }
    const randomPart = randomValue.toString('hex');
    const merchantOid = `${MERCHANT_OID_PREFIX}${randomPart}`;
    if (!/^[A-Za-z0-9]{1,64}$/.test(merchantOid)) {
        throw new PaytrPaymentServiceError('Generated merchant_oid is invalid.');
    }
    return merchantOid;
};

const toPaytrPaymentAmount = (amount) => {
    const numericAmount = Number(amount);
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
        throw new PaytrPaymentServiceError('amount must be a positive number.');
    }

    const minorUnits = Math.round((numericAmount + Number.EPSILON) * 100);
    if (!Number.isSafeInteger(minorUnits) || minorUnits <= 0) {
        throw new PaytrPaymentServiceError('amount cannot be converted to safe minor units.');
    }
    return minorUnits;
};

const formatBasketUnitPrice = (value) => {
    const minorUnits = toPaytrPaymentAmount(value);
    return (minorUnits / 100).toFixed(2);
};

const normalizeBasketItem = (item) => {
    assertPlainObject(item, 'basket item');
    const quantity = Number(item.quantity || item.qty || 0);
    if (!Number.isInteger(quantity) || quantity <= 0) {
        throw new PaytrPaymentServiceError('basket item quantity must be a positive integer.');
    }

    const name = toSafeString(item.name, 'NovaStore Urun').slice(0, 120) || 'NovaStore Urun';
    return [
        name,
        formatBasketUnitPrice(item.price || item.unitPrice),
        quantity
    ];
};

const buildPaytrUserBasket = (items) => {
    if (!Array.isArray(items) || items.length === 0) {
        throw new PaytrPaymentServiceError('items must be a non-empty array.');
    }

    const basket = items.map(normalizeBasketItem);
    return Buffer.from(JSON.stringify(basket), 'utf8').toString('base64');
};

const buildPaytrIframeUrl = (token, config = {}) => {
    const safeToken = toSafeString(token);
    if (!safeToken) {
        throw new PaytrPaymentServiceError('PayTR iframe token is required.');
    }

    const baseUrl = normalizeUrl(config.baseUrl || DEFAULT_PAYTR_BASE_URL) || DEFAULT_PAYTR_BASE_URL;
    return `${baseUrl}/odeme/guvenli/${encodeURIComponent(safeToken)}`;
};

const appendPaymentQuery = (url, { paymentRef, orderId }) => {
    const safeUrl = normalizeUrl(url);
    if (!safeUrl) return '';

    const resolvedUrl = new URL(safeUrl);
    const hashRoute = resolvedUrl.hash.startsWith('#/') ? resolvedUrl.hash.slice(1) : null;
    const [hashPath, hashQuery = ''] = hashRoute ? hashRoute.split('?') : ['', ''];
    const targetParams = hashRoute ? new URLSearchParams(hashQuery) : resolvedUrl.searchParams;
    if (paymentRef && !targetParams.has('paymentRef')) targetParams.set('paymentRef', paymentRef);
    if (orderId && !targetParams.has('orderId')) targetParams.set('orderId', String(orderId));
    if (hashRoute) resolvedUrl.hash = `${hashPath}?${targetParams.toString()}`;
    return resolvedUrl.toString();
};

const resolvePaytrUrls = ({ config, paymentRef, orderId }) => {
    assertPlainObject(config, 'config');
    const callbackUrl = normalizeUrl(config.callbackUrl);
    const successUrl = appendPaymentQuery(config.successUrl, { paymentRef, orderId });
    const failUrl = appendPaymentQuery(config.failUrl, { paymentRef, orderId });

    if (!callbackUrl || !successUrl || !failUrl) {
        throw new PaytrPaymentServiceError('PayTR callback, success and fail URLs are required.');
    }

    return {
        callbackUrl,
        successUrl,
        failUrl
    };
};

const buildPaytrTokenHash = ({
    merchantId,
    userIp,
    merchantOid,
    email,
    paymentAmount,
    userBasket,
    noInstallment = '0',
    maxInstallment = '0',
    currency = 'TL',
    testMode = '0',
    merchantKey,
    merchantSalt
}) => {
    const hashString = [
        merchantId,
        userIp,
        merchantOid,
        email,
        paymentAmount,
        userBasket,
        noInstallment,
        maxInstallment,
        currency,
        testMode
    ].join('');
    return crypto
        .createHmac('sha256', String(merchantKey || ''))
        .update(`${hashString}${merchantSalt || ''}`)
        .digest('base64');
};

const buildPaytrTokenPayload = ({
    config,
    order,
    customer,
    items,
    amount,
    userIp,
    merchantOid = null,
    noInstallment = '0',
    maxInstallment = '0',
    currency = 'TL',
    timeoutLimit = 30,
    lang = 'tr'
}) => {
    assertPlainObject(config, 'config');
    assertPlainObject(customer, 'customer');

    const orderId = order === null || order === undefined ? null : getOrderId(order);
    const paymentAmount = toPaytrPaymentAmount(amount);
    const userBasket = buildPaytrUserBasket(items);
    const finalMerchantOid = merchantOid || buildPaytrMerchantOid();
    if (!/^[A-Za-z0-9]{1,64}$/.test(finalMerchantOid)) {
        throw new PaytrPaymentServiceError('merchant_oid must be alphanumeric and at most 64 characters.');
    }
    if (!net.isIP(toSafeString(userIp))) {
        throw new PaytrPaymentServiceError('user_ip must be a valid IP address.');
    }
    const customerEmail = toSafeString(customer.email);
    if (
        customerEmail.length > 100
        || !/^[\x21-\x7E]+$/.test(customerEmail)
        || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmail)
    ) {
        throw new PaytrPaymentServiceError('customer.email is invalid.');
    }
    if (!/^05[0-9]{9}$/.test(toSafeString(customer.phone))) {
        throw new PaytrPaymentServiceError('customer.phone must use the canonical Turkish mobile format.');
    }
    const customerName = toSafeString(customer.fullName || customer.name);
    const customerAddress = toSafeString(customer.address);
    if (customerName.length < 2 || customerName.length > 60) {
        throw new PaytrPaymentServiceError('customer name must be between 2 and 60 characters.');
    }
    if (customerAddress.length < 5 || customerAddress.length > 400) {
        throw new PaytrPaymentServiceError('customer address must be between 5 and 400 characters.');
    }
    const urls = resolvePaytrUrls({ config, paymentRef: finalMerchantOid, orderId });
    const testMode = config.testMode ? '1' : '0';
    const debugOn = config.debugOn ? '1' : '0';

    const payloadBase = {
        merchant_id: toSafeString(config.merchantId),
        user_ip: toSafeString(userIp),
        merchant_oid: finalMerchantOid,
        email: customerEmail,
        payment_amount: paymentAmount,
        user_basket: userBasket,
        no_installment: String(noInstallment),
        max_installment: String(maxInstallment),
        currency,
        test_mode: testMode,
        debug_on: debugOn,
        user_name: customerName,
        user_address: customerAddress,
        user_phone: toSafeString(customer.phone),
        merchant_ok_url: urls.successUrl,
        merchant_fail_url: urls.failUrl,
        timeout_limit: timeoutLimit,
        lang
    };

    return {
        ...payloadBase,
        paytr_token: buildPaytrTokenHash({
            merchantId: payloadBase.merchant_id,
            userIp: payloadBase.user_ip,
            merchantOid: payloadBase.merchant_oid,
            email: payloadBase.email,
            paymentAmount: payloadBase.payment_amount,
            userBasket: payloadBase.user_basket,
            noInstallment: payloadBase.no_installment,
            maxInstallment: payloadBase.max_installment,
            currency: payloadBase.currency,
            testMode: payloadBase.test_mode,
            merchantKey: config.merchantKey,
            merchantSalt: config.merchantSalt
        })
    };
};

const buildPaytrCallbackHash = ({ merchantOid, status, totalAmount, merchantKey, merchantSalt }) => {
    const hashSource = `${merchantOid || ''}${merchantSalt || ''}${status || ''}${totalAmount || ''}`;
    return crypto
        .createHmac('sha256', String(merchantKey || ''))
        .update(hashSource)
        .digest('base64');
};

const timingSafeEqualString = (left, right) => {
    if (!left || !right) return false;
    const leftBuffer = Buffer.from(String(left));
    const rightBuffer = Buffer.from(String(right));
    if (leftBuffer.length !== rightBuffer.length) return false;
    return crypto.timingSafeEqual(leftBuffer, rightBuffer);
};

const verifyPaytrCallbackHash = (payload, config) => {
    if (!payload || !config || !payload.hash) return false;

    const expectedHash = buildPaytrCallbackHash({
        merchantOid: payload.merchant_oid,
        status: payload.status,
        totalAmount: payload.total_amount,
        merchantKey: config.merchantKey,
        merchantSalt: config.merchantSalt
    });

    return timingSafeEqualString(payload.hash, expectedHash);
};

const serializePaytrTokenPayload = (payload) => {
    assertPlainObject(payload, 'payload');
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(payload)) {
        if (value === undefined || value === null) continue;
        params.set(key, String(value));
    }
    return params.toString();
};

const parsePaytrTokenResponse = (value) => {
    const payload = typeof value === 'string' ? (() => {
        try { return JSON.parse(value); } catch (_) { return null; }
    })() : value;
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
        throw new PaytrProviderTransportError('PAYTR_RESPONSE_INVALID');
    }
    if (String(payload.status || '').trim().toLowerCase() !== 'success') {
        throw new PaytrProviderTransportError('PAYTR_TOKEN_REJECTED');
    }
    const token = String(payload.token || '').trim();
    if (token.length < 8 || token.length > 4096 || !/^[A-Za-z0-9._~+/=-]+$/.test(token)) {
        throw new PaytrProviderTransportError('PAYTR_TOKEN_INVALID');
    }
    return Object.freeze({ status: 'success', token });
};

const createPaytrHttpTransport = ({ fetchImpl = globalThis.fetch, timeoutMs = 8000 } = {}) => {
    if (typeof fetchImpl !== 'function') throw new TypeError('PayTR transport requires fetch.');
    return async (payload) => {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), timeoutMs);
        try {
            const response = await fetchImpl(PAYTR_TOKEN_URL, {
                method: 'POST',
                redirect: 'error',
                headers: { 'content-type': 'application/x-www-form-urlencoded' },
                body: serializePaytrTokenPayload(payload),
                signal: controller.signal
            });
            if (!response || response.ok !== true) throw new PaytrProviderTransportError('PAYTR_HTTP_ERROR');
            const responseText = await response.text();
            if (Buffer.byteLength(responseText, 'utf8') > 16384) throw new PaytrProviderTransportError('PAYTR_RESPONSE_TOO_LARGE');
            return parsePaytrTokenResponse(responseText);
        } catch (error) {
            if (error instanceof PaytrProviderTransportError) throw error;
            throw new PaytrProviderTransportError(error?.name === 'AbortError' ? 'PAYTR_TIMEOUT' : 'PAYTR_NETWORK_ERROR');
        } finally {
            clearTimeout(timeout);
        }
    };
};

const requestPaytrIframeSession = async ({ payload, config, transport = createPaytrHttpTransport() }) => {
    assertExternalSideEffectAllowed('payment_initialize');
    if (config?.baseUrl !== DEFAULT_PAYTR_BASE_URL || config?.tokenUrl !== PAYTR_TOKEN_URL) {
        throw new PaytrProviderTransportError('PAYTR_ENDPOINT_NOT_ALLOWED');
    }
    if (typeof transport !== 'function') throw new TypeError('PayTR transport must be a function.');
    const response = parsePaytrTokenResponse(await transport(payload));
    return Object.freeze({
        type: 'iframe',
        token: response.token,
        iframeUrl: buildPaytrIframeUrl(response.token, config),
        successUrl: payload.merchant_ok_url,
        failUrl: payload.merchant_fail_url
    });
};

module.exports = {
    DEFAULT_PAYTR_BASE_URL,
    PAYTR_TOKEN_URL,
    MERCHANT_OID_PREFIX,
    PaytrPaymentServiceError,
    PaytrProviderTransportError,
    buildPaytrCallbackHash,
    buildPaytrIframeUrl,
    buildPaytrMerchantOid,
    buildPaytrTokenHash,
    buildPaytrTokenPayload,
    buildPaytrUserBasket,
    createPaytrHttpTransport,
    formatBasketUnitPrice,
    parsePaytrTokenResponse,
    requestPaytrIframeSession,
    resolvePaytrUrls,
    serializePaytrTokenPayload,
    timingSafeEqualString,
    toPaytrPaymentAmount,
    verifyPaytrCallbackHash
};
