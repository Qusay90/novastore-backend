const crypto = require('crypto');

const buildWebhookSignature = (payload, secret) => {
    const payloadString = JSON.stringify(payload);
    return crypto.createHmac('sha256', secret).update(payloadString).digest('hex');
};

const verifyWebhookSignature = (payload, signature, secret) => {
    if (!signature || !secret) return false;
    const expected = buildWebhookSignature(payload, secret);
    const signatureBuffer = Buffer.from(String(signature));
    const expectedBuffer = Buffer.from(expected);
    if (signatureBuffer.length !== expectedBuffer.length) return false;
    return crypto.timingSafeEqual(signatureBuffer, expectedBuffer);
};

module.exports = {
    buildWebhookSignature,
    verifyWebhookSignature
};
