const ADMIN_COMMERCE_CAPABILITY_DEFAULTS = Object.freeze({
    dashboardRead: true,
    ordersRead: true,
    returnsRead: true,
    returnWrite: false,
    firstPartyCatalogRead: true,
    catalogStructureRead: true,
    firstPartyCatalogWrite: false,
    catalogStructureWrite: false,
    notificationsRead: true,
    storesRead: true,
    reviewsRead: true,
    questionsRead: true,
    couponsRead: true,
    supportRead: true,
    orderStatusWrite: false,
    orderCancelWrite: false,
    manualShipmentWrite: false,
    orderBulkWrite: false,
    orderOwnerWrite: false,
    customerAdmin: false,
    sellerAdmin: false,
    sellerOffers: false,
    reviewModerationWrite: false,
    questionAnswerWrite: false,
    couponWrite: false,
    supportWrite: false,
    settlements: false,
    payouts: false
});

const WRITE_CAPABILITY_ENV = Object.freeze({
    firstPartyCatalogWrite: 'NOVASTORE_ADMIN_CATALOG_PRODUCT_WRITE_ENABLED',
    catalogStructureWrite: 'NOVASTORE_ADMIN_CATALOG_STRUCTURE_WRITE_ENABLED',
    returnWrite: 'NOVASTORE_ADMIN_RETURN_WRITE_ENABLED',
    orderCancelWrite: 'NOVASTORE_ADMIN_CANCEL_WRITE_ENABLED',
    manualShipmentWrite: 'NOVASTORE_MANUAL_FULFILLMENT_WRITE_ENABLED',
    reviewModerationWrite: 'NOVASTORE_ADMIN_REVIEW_MODERATION_WRITE_ENABLED',
    questionAnswerWrite: 'NOVASTORE_ADMIN_QUESTION_ANSWER_WRITE_ENABLED',
    couponWrite: 'NOVASTORE_ADMIN_COUPON_WRITE_ENABLED',
    supportWrite: 'NOVASTORE_ADMIN_SUPPORT_WRITE_ENABLED'
});

const parseEnabledFlag = (value) => String(value || '').trim().toLowerCase() === 'true';

const isAdminCommerceCapabilityEnabled = (capability, env = process.env) => {
    const envName = WRITE_CAPABILITY_ENV[capability];
    if (envName) return parseEnabledFlag(env?.[envName]);
    return ADMIN_COMMERCE_CAPABILITY_DEFAULTS[capability] === true;
};

const getAdminCommerceCapabilities = (env = process.env) => Object.freeze({
    ...ADMIN_COMMERCE_CAPABILITY_DEFAULTS,
    ...Object.fromEntries(
        Object.keys(WRITE_CAPABILITY_ENV).map((capability) => [
            capability,
            isAdminCommerceCapabilityEnabled(capability, env)
        ])
    )
});

module.exports = {
    ADMIN_COMMERCE_CAPABILITY_DEFAULTS,
    WRITE_CAPABILITY_ENV,
    getAdminCommerceCapabilities,
    isAdminCommerceCapabilityEnabled,
    parseEnabledFlag
};
