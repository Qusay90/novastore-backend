const crypto = require('crypto');

const DEFAULT_PAYTR_BASE_URL = 'https://www.paytr.com';
const MERCHANT_OID_PREFIX = 'NST-PAYTR';

class PaytrPaymentServiceError extends Error {
    constructor(message) {
        super(message);
        this.name = 'PaytrPaymentServiceError';
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

const buildPaytrMerchantOid = (order, randomBytes = crypto.randomBytes) => {
    const orderId = getOrderId(order);
    const randomPart = randomBytes(8).toString('hex');
    return `${MERCHANT_OID_PREFIX}-${orderId}-${randomPart}`;
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

const appendPaymentQuery = (url, { paymentRef, orderId, status }) => {
    const safeUrl = normalizeUrl(url);
    if (!safeUrl) return '';

    const resolvedUrl = new URL(safeUrl);
    if (paymentRef && !resolvedUrl.searchParams.has('paymentRef')) {
        resolvedUrl.searchParams.set('paymentRef', paymentRef);
    }
    if (orderId && !resolvedUrl.searchParams.has('orderId')) {
        resolvedUrl.searchParams.set('orderId', String(orderId));
    }
    if (status && !resolvedUrl.searchParams.has('status')) {
        resolvedUrl.searchParams.set('status', status);
    }
    return resolvedUrl.toString();
};

const resolvePaytrUrls = ({ config, paymentRef, orderId }) => {
    assertPlainObject(config, 'config');
    const callbackUrl = normalizeUrl(config.callbackUrl);
    const successUrl = appendPaymentQuery(config.successUrl, { paymentRef, orderId, status: 'success' });
    const failUrl = appendPaymentQuery(config.failUrl, { paymentRef, orderId, status: 'failed' });

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

    const orderId = getOrderId(order);
    const paymentAmount = toPaytrPaymentAmount(amount);
    const userBasket = buildPaytrUserBasket(items);
    const finalMerchantOid = merchantOid || buildPaytrMerchantOid(order);
    const urls = resolvePaytrUrls({ config, paymentRef: finalMerchantOid, orderId });
    const testMode = config.testMode ? '1' : '0';
    const debugOn = config.debugOn ? '1' : '0';

    const payloadBase = {
        merchant_id: toSafeString(config.merchantId),
        user_ip: toSafeString(userIp),
        merchant_oid: finalMerchantOid,
        email: toSafeString(customer.email),
        payment_amount: paymentAmount,
        user_basket: userBasket,
        no_installment: String(noInstallment),
        max_installment: String(maxInstallment),
        currency,
        test_mode: testMode,
        debug_on: debugOn,
        user_name: toSafeString(customer.fullName || customer.name).slice(0, 60),
        user_address: toSafeString(customer.address).slice(0, 400),
        user_phone: toSafeString(customer.phone).slice(0, 20),
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

const buildMockPaytrTokenResponse = ({ merchantOid, paymentAmount }) => {
    const seed = `${merchantOid || ''}:${paymentAmount || ''}`;
    const token = crypto.createHash('sha256').update(seed).digest('hex').slice(0, 40);
    return {
        status: 'success',
        token: `mock-paytr-${token}`,
        mock: true
    };
};

module.exports = {
    DEFAULT_PAYTR_BASE_URL,
    MERCHANT_OID_PREFIX,
    PaytrPaymentServiceError,
    buildMockPaytrTokenResponse,
    buildPaytrCallbackHash,
    buildPaytrIframeUrl,
    buildPaytrMerchantOid,
    buildPaytrTokenHash,
    buildPaytrTokenPayload,
    buildPaytrUserBasket,
    formatBasketUnitPrice,
    resolvePaytrUrls,
    timingSafeEqualString,
    toPaytrPaymentAmount,
    verifyPaytrCallbackHash
};
