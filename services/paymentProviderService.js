const crypto = require('crypto');

const buildPaymentRef = () => `NST-PMT-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;

const buildWebhookSignature = (payload, secret) => {
    const payloadString = JSON.stringify(payload);
    return crypto.createHmac('sha256', secret).update(payloadString).digest('hex');
};

const verifyWebhookSignature = (payload, signature, secret) => {
    if (!signature || !secret) return false;
    const expected = buildWebhookSignature(payload, secret);
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
};

const initializeIyzicoPayment = async ({ orderId, amount, currency }) => {
    const paymentRef = buildPaymentRef();

    const callbackBase = process.env.APP_BASE_URL || 'http://localhost:5000';
    const successUrl = `${callbackBase}/payment-result.html?status=success&paymentRef=${paymentRef}&orderId=${orderId}`;
    const failUrl = `${callbackBase}/payment-result.html?status=failed&paymentRef=${paymentRef}&orderId=${orderId}`;

    return {
        provider: 'iyzico',
        paymentRef,
        status: 'PENDING_3DS',
        amount,
        currency,
        action: {
            type: 'REDIRECT',
            successUrl,
            failUrl,
            message: '3D dogrulama adimina yonlendiriliyor.'
        },
        mock: process.env.IYZICO_MOCK_MODE !== 'false'
    };
};

module.exports = {
    initializeIyzicoPayment,
    buildWebhookSignature,
    verifyWebhookSignature
};
