'use strict';

const createSellerPasswordRecoveryDeliveryBoundary = ({ syntheticEnabled = false } = {}) => {
    const deliveries = new Map();
    const deliver = async (payload) => {
        if (!syntheticEnabled || !payload?.deliverable || !payload?.code) return Object.freeze({ queued: false, provider: 'unavailable' });
        deliveries.set(String(payload.challengeId), Object.freeze({
            challengeId: String(payload.challengeId),
            channel: String(payload.channel),
            destination: String(payload.destination),
            code: String(payload.code)
        }));
        return Object.freeze({ queued: true, provider: 'synthetic-local-memory' });
    };
    const consumeSynthetic = (challengeId) => {
        const key = String(challengeId);
        const delivery = deliveries.get(key) || null;
        deliveries.delete(key);
        return delivery;
    };
    return Object.freeze({ deliver, consumeSynthetic });
};

module.exports = Object.freeze({ createSellerPasswordRecoveryDeliveryBoundary });
