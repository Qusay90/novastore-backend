'use strict';

const {
    BusinessIdentityConfigError,
    assertBusinessIdentityReadyForPayment,
    buildBusinessIdentitySnapshot
} = require('./businessIdentityConfig');

class PaymentLaunchPolicyError extends Error {
    constructor(code, message, details = []) {
        super(message);
        this.name = 'PaymentLaunchPolicyError';
        this.code = code;
        this.statusCode = 503;
        this.publicMessage = message;
        this.details = Object.freeze([...details]);
    }
}

const exactTrue = (value) => String(value || '').trim().toLowerCase() === 'true';
const compactIban = (value) => String(value || '').replace(/\s+/g, '').toUpperCase();
const isValidTurkishIban = (value) => {
    const iban = compactIban(value);
    if (!/^TR\d{24}$/.test(iban)) return false;
    const rearranged = `${iban.slice(4)}${iban.slice(0, 4)}`;
    const numeric = [...rearranged].map((character) => (
        /\d/.test(character) ? character : String(character.charCodeAt(0) - 55)
    )).join('');
    let remainder = 0;
    for (const digit of numeric) remainder = (remainder * 10 + Number(digit)) % 97;
    return remainder === 1;
};

const readBankTransferConfig = (env = process.env) => {
    const accountName = String(env.HAVALE_ACCOUNT_NAME || '').trim();
    const iban = compactIban(env.HAVALE_IBAN);
    const enabled = exactTrue(env.NOVASTORE_BANK_TRANSFER_ENABLED);
    const missing = [];
    if (!enabled) missing.push('NOVASTORE_BANK_TRANSFER_ENABLED');
    if (!accountName) missing.push('HAVALE_ACCOUNT_NAME');
    if (!isValidTurkishIban(iban)) missing.push('HAVALE_IBAN');
    return Object.freeze({ enabled, accountName, iban, missing: Object.freeze(missing) });
};

const assertPaymentLaunchPolicy = ({ paymentMethod, env = process.env } = {}) => {
    const production = String(env.NODE_ENV || '').trim().toLowerCase() === 'production';
    const requireBusinessIdentity = paymentMethod !== 'havale'
        || production
        || exactTrue(env.NOVASTORE_REQUIRE_BUSINESS_IDENTITY_FOR_PAYMENT);
    let identitySnapshot = null;
    if (requireBusinessIdentity) {
        try {
            identitySnapshot = buildBusinessIdentitySnapshot(assertBusinessIdentityReadyForPayment(env));
        } catch (error) {
            if (error instanceof BusinessIdentityConfigError) throw error;
            throw error;
        }
    }

    if (paymentMethod === 'havale') {
        const bankTransfer = readBankTransferConfig(env);
        if (bankTransfer.missing.length > 0) {
            throw new PaymentLaunchPolicyError(
                'BANK_TRANSFER_CONFIG_INCOMPLETE',
                'Havale/EFT ödeme yöntemi gerçek hesap bilgileri yapılandırılmadan kullanılamaz.',
                bankTransfer.missing
            );
        }
        if (production) {
            throw new PaymentLaunchPolicyError(
                'BANK_TRANSFER_SETTLEMENT_NOT_ACTIVATED',
                'Havale/EFT ödemesi üretim mutabakatı ve yetkili ödeme onayı etkinleştirilmeden kullanılamaz.',
                ['BANK_TRANSFER_SETTLEMENT_OPERATION', 'BANK_TRANSFER_RECONCILIATION_OWNER']
            );
        }
        return Object.freeze({ production, identitySnapshot, bankTransfer });
    }

    return Object.freeze({ production, identitySnapshot, bankTransfer: null });
};

module.exports = Object.freeze({
    PaymentLaunchPolicyError,
    assertPaymentLaunchPolicy,
    compactIban,
    exactTrue,
    isValidTurkishIban,
    readBankTransferConfig
});
