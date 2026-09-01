'use strict';

const BUSINESS_IDENTITY_FIELDS = Object.freeze([
    Object.freeze({ key: 'legalCompanyName', environmentKey: 'BUSINESS_LEGAL_COMPANY_NAME', requiredForPayment: true }),
    Object.freeze({ key: 'tradeName', environmentKey: 'BUSINESS_TRADE_NAME', requiredForPayment: true }),
    Object.freeze({ key: 'taxNumber', environmentKey: 'BUSINESS_TAX_VKN', requiredForPayment: true }),
    Object.freeze({ key: 'taxOffice', environmentKey: 'BUSINESS_TAX_OFFICE', requiredForPayment: false }),
    Object.freeze({ key: 'mersisNumber', environmentKey: 'BUSINESS_MERSIS_NUMBER', requiredForPayment: true }),
    Object.freeze({ key: 'registeredAddress', environmentKey: 'BUSINESS_REGISTERED_ADDRESS', requiredForPayment: true }),
    Object.freeze({ key: 'kepAddress', environmentKey: 'BUSINESS_KEP_ADDRESS', requiredForPayment: true }),
    Object.freeze({ key: 'phone', environmentKey: 'BUSINESS_PHONE', requiredForPayment: true }),
    Object.freeze({ key: 'email', environmentKey: 'BUSINESS_EMAIL', requiredForPayment: true }),
    Object.freeze({ key: 'customerDomain', environmentKey: 'CUSTOMER_PUBLIC_DOMAIN', requiredForPayment: true }),
    Object.freeze({ key: 'adminDomain', environmentKey: 'ADMIN_PUBLIC_DOMAIN', requiredForPayment: false }),
    Object.freeze({ key: 'sellerWebDomain', environmentKey: 'SELLER_WEB_PUBLIC_DOMAIN', requiredForPayment: false }),
    Object.freeze({ key: 'customerAndroidAppId', environmentKey: 'CUSTOMER_ANDROID_APP_ID', requiredForPayment: false }),
    Object.freeze({ key: 'sellerAndroidAppId', environmentKey: 'SELLER_ANDROID_APP_ID', requiredForPayment: false })
]);

const CONTROL_CHARACTER_PATTERN = /[\u0000-\u001f\u007f]/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const APP_ID_PATTERN = /^[A-Za-z][A-Za-z0-9_]*(?:\.[A-Za-z][A-Za-z0-9_]*){2,}$/;
const PUBLIC_IDENTITY_KEYS = Object.freeze([
    'legalCompanyName',
    'tradeName',
    'taxNumber',
    'mersisNumber',
    'registeredAddress',
    'kepAddress',
    'phone',
    'email',
    'customerDomain'
]);
const OPTIONAL_PUBLIC_IDENTITY_KEYS = Object.freeze(['taxOffice']);

class BusinessIdentityConfigError extends Error {
    constructor(missingEnvironmentKeys) {
        super('Real business identity configuration is incomplete.');
        this.name = 'BusinessIdentityConfigError';
        this.code = 'BUSINESS_IDENTITY_INCOMPLETE';
        this.statusCode = 503;
        this.publicMessage = 'İşletme kimliği tamamlanmadan gerçek ödeme başlatılamaz.';
        this.details = Object.freeze([...missingEnvironmentKeys]);
    }
}

const text = (value) => String(value === undefined || value === null ? '' : value).trim();

const validHttpsOrigin = (value) => {
    try {
        const parsed = new URL(value);
        return parsed.protocol === 'https:'
            && !parsed.username
            && !parsed.password
            && parsed.pathname === '/'
            && !parsed.search
            && !parsed.hash;
    } catch (_) {
        return false;
    }
};

const validText = (value, minimum, maximum) => (
    value.length >= minimum && value.length <= maximum && !CONTROL_CHARACTER_PATTERN.test(value)
);

const isValidBusinessIdentityValue = (key, value) => {
    if (!value) return false;
    if (key === 'legalCompanyName') return validText(value, 2, 200);
    if (key === 'tradeName') return validText(value, 2, 160);
    if (key === 'taxNumber') return /^\d{10}$/.test(value);
    if (key === 'taxOffice') return validText(value, 2, 160);
    if (key === 'mersisNumber') return /^\d{16}$/.test(value);
    if (key === 'registeredAddress') return validText(value, 10, 500);
    if (key === 'kepAddress' || key === 'email') return value.length <= 254 && EMAIL_PATTERN.test(value);
    if (key === 'phone') return /^\+?[1-9]\d{9,14}$/.test(value.replace(/[\s()-]/g, ''));
    if (['customerDomain', 'adminDomain', 'sellerWebDomain'].includes(key)) return validHttpsOrigin(value);
    if (['customerAndroidAppId', 'sellerAndroidAppId'].includes(key)) return APP_ID_PATTERN.test(value);
    return false;
};

const readBusinessIdentity = (env = process.env) => Object.freeze(Object.fromEntries(
    BUSINESS_IDENTITY_FIELDS.map(({ key, environmentKey }) => [key, text(env?.[environmentKey]) || null])
));

const getMissingBusinessIdentityKeys = (env = process.env, { paymentOnly = false } = {}) => (
    BUSINESS_IDENTITY_FIELDS
        .filter(({ requiredForPayment }) => !paymentOnly || requiredForPayment)
        .filter(({ environmentKey }) => !text(env?.[environmentKey]))
        .map(({ environmentKey }) => environmentKey)
);

const getInvalidBusinessIdentityKeys = (env = process.env, { paymentOnly = false } = {}) => (
    BUSINESS_IDENTITY_FIELDS
        .filter(({ requiredForPayment, environmentKey }) => (
            !paymentOnly || requiredForPayment || Boolean(text(env?.[environmentKey]))
        ))
        .filter(({ key, environmentKey }) => {
            const value = text(env?.[environmentKey]);
            return value && !isValidBusinessIdentityValue(key, value);
        })
        .map(({ environmentKey }) => environmentKey)
);

const getBusinessIdentityIssueKeys = (env = process.env, options = {}) => Object.freeze([
    ...getMissingBusinessIdentityKeys(env, options),
    ...getInvalidBusinessIdentityKeys(env, options)
]);

const assertBusinessIdentityReadyForPayment = (env = process.env) => {
    const issues = getBusinessIdentityIssueKeys(env, { paymentOnly: true });
    if (issues.length > 0) throw new BusinessIdentityConfigError(issues);
    return readBusinessIdentity(env);
};

const buildBusinessIdentitySnapshot = (identity) => Object.freeze({
    legalCompanyName: identity.legalCompanyName,
    tradeName: identity.tradeName,
    taxNumber: identity.taxNumber,
    taxOffice: identity.taxOffice || null,
    mersisNumber: identity.mersisNumber,
    registeredAddress: identity.registeredAddress,
    kepAddress: identity.kepAddress,
    phone: identity.phone,
    email: identity.email,
    customerDomain: identity.customerDomain
});

const getPublicBusinessIdentity = (env = process.env) => {
    const identity = readBusinessIdentity(env);
    const issues = BUSINESS_IDENTITY_FIELDS
        .filter(({ key }) => PUBLIC_IDENTITY_KEYS.includes(key))
        .filter(({ key, environmentKey }) => !isValidBusinessIdentityValue(key, text(env?.[environmentKey])))
        .map(({ environmentKey }) => environmentKey);
    const configured = issues.length === 0;
    return Object.freeze({
        status: configured ? 'configured' : 'pending_owner_company_formation',
        identity: configured
            ? Object.freeze(Object.fromEntries([
                ...PUBLIC_IDENTITY_KEYS.map((key) => [key, identity[key]]),
                ...OPTIONAL_PUBLIC_IDENTITY_KEYS
                    .filter((key) => isValidBusinessIdentityValue(key, text(identity[key])))
                    .map((key) => [key, identity[key]])
            ]))
            : null,
        issueCount: issues.length
    });
};

module.exports = Object.freeze({
    BUSINESS_IDENTITY_FIELDS,
    OPTIONAL_PUBLIC_IDENTITY_KEYS,
    PUBLIC_IDENTITY_KEYS,
    BusinessIdentityConfigError,
    assertBusinessIdentityReadyForPayment,
    buildBusinessIdentitySnapshot,
    getBusinessIdentityIssueKeys,
    getInvalidBusinessIdentityKeys,
    getMissingBusinessIdentityKeys,
    getPublicBusinessIdentity,
    isValidBusinessIdentityValue,
    readBusinessIdentity
});
