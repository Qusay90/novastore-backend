const ADMIN_COMMERCE_CAPABILITY_DEFAULTS = Object.freeze({
    dashboardRead: true,
    ordersRead: true,
    returnsRead: true,
    firstPartyCatalogRead: true,
    catalogStructureRead: true,
    notificationsRead: true,
    orderStatusWrite: false,
    orderCancelWrite: false,
    manualShipmentWrite: false,
    orderBulkWrite: false,
    orderOwnerWrite: false,
    customerAdmin: false,
    sellerAdmin: false,
    sellerOffers: false,
    settlements: false,
    payouts: false
});

const WRITE_CAPABILITY_ENV = Object.freeze({
    orderCancelWrite: 'NOVASTORE_ADMIN_CANCEL_WRITE_ENABLED',
    manualShipmentWrite: 'NOVASTORE_MANUAL_FULFILLMENT_WRITE_ENABLED'
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
