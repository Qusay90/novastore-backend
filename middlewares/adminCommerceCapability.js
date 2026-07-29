const { isAdminCommerceCapabilityEnabled } = require('../services/adminCommerceCapabilityService');
const { isStagingEnvironment } = require('../config/stagingRuntimePolicy');

const DISABLED_CAPABILITY_RESPONSES = Object.freeze({
    firstPartyCatalogWrite: Object.freeze({
        code: 'ADMIN_CATALOG_PRODUCT_WRITE_DISABLED',
        error: 'Birinci taraf ürün yazma güvenlik anahtarı kapalı.'
    }),
    catalogStructureWrite: Object.freeze({
        code: 'ADMIN_CATALOG_STRUCTURE_WRITE_DISABLED',
        error: 'Katalog yapısı yazma güvenlik anahtarı kapalı.'
    }),
    orderCancelWrite: Object.freeze({
        code: 'ADMIN_ORDER_CANCEL_WRITE_DISABLED',
        error: 'Yönetici sipariş iptali güvenlik anahtarı kapalı.'
    }),
    manualShipmentWrite: Object.freeze({
        code: 'MANUAL_FULFILLMENT_DISABLED',
        error: 'Manuel kargo teslim operasyonu güvenlik anahtarı kapalı.'
    })
});

const sendDisabledCapability = (res, capability) => {
    const payload = DISABLED_CAPABILITY_RESPONSES[capability] || {
        code: 'ADMIN_COMMERCE_CAPABILITY_DISABLED',
        error: 'Yönetici yazma yeteneği etkin değil.'
    };
    return res.status(503).json(payload);
};

const requireAdminCommerceCapability = (capability) => (req, res, next) => {
    if (!isAdminCommerceCapabilityEnabled(capability)) {
        return sendDisabledCapability(res, capability);
    }
    return next();
};

const requireAdminCommerceCapabilityIfClaimed = (capability) => {
    const requireCapability = requireAdminCommerceCapability(capability);
    return (req, res, next) => {
        if (req.user?.role !== 'admin') return next();
        return requireCapability(req, res, next);
    };
};

const requireAdminCommerceCapabilityInStaging = (capability) => {
    const requireCapability = requireAdminCommerceCapability(capability);
    return (req, res, next) => {
        if (!isStagingEnvironment(process.env)) return next();
        return requireCapability(req, res, next);
    };
};

module.exports = {
    DISABLED_CAPABILITY_RESPONSES,
    requireAdminCommerceCapability,
    requireAdminCommerceCapabilityInStaging,
    requireAdminCommerceCapabilityIfClaimed,
    sendDisabledCapability
};
