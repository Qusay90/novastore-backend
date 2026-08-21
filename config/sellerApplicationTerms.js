'use strict';

const SELLER_APPLICATION_TERMS_REVISION_MAX_LENGTH = 120;
const SELLER_APPLICATION_TERMS_GENERATION_MAX = Number.MAX_SAFE_INTEGER;

class SellerApplicationTermsConfigError extends Error {
    constructor() {
        super('Seller application terms revision configuration is invalid.');
        this.name = 'SellerApplicationTermsConfigError';
        this.code = 'SELLER_APPLICATION_TERMS_REVISION_INVALID';
        this.statusCode = 503;
    }
}

const normalizeSellerApplicationTermsRevision = (value) => {
    if (value === undefined || value === null) return null;
    if (typeof value !== 'string') throw new SellerApplicationTermsConfigError();

    const normalized = value.normalize('NFKC').trim();
    if (!normalized) return null;
    if (normalized.length > SELLER_APPLICATION_TERMS_REVISION_MAX_LENGTH || /[\u0000-\u001f\u007f]/u.test(normalized)) {
        throw new SellerApplicationTermsConfigError();
    }
    return normalized;
};

const normalizeSellerApplicationTermsGeneration = (value) => {
    if (value === undefined || value === null || value === '') return null;
    if (typeof value === 'string' && !/^[1-9]\d{0,15}$/u.test(value.trim())) {
        throw new SellerApplicationTermsConfigError();
    }
    const normalized = Number(value);
    if (!Number.isSafeInteger(normalized) || normalized < 1 || normalized > SELLER_APPLICATION_TERMS_GENERATION_MAX) {
        throw new SellerApplicationTermsConfigError();
    }
    return normalized;
};

const getSellerApplicationTermsAuthority = (environment = process.env) => {
    const revision = normalizeSellerApplicationTermsRevision(environment?.SELLER_APPLICATION_TERMS_REVISION);
    const generation = normalizeSellerApplicationTermsGeneration(environment?.SELLER_APPLICATION_TERMS_REVISION_GENERATION);
    if (revision === null && generation === null) return null;
    if (revision === null || generation === null) throw new SellerApplicationTermsConfigError();
    return Object.freeze({ revision, generation });
};

const getActiveSellerApplicationTermsRevision = (environment = process.env) => (
    getSellerApplicationTermsAuthority(environment)?.revision || null
);

module.exports = Object.freeze({
    SELLER_APPLICATION_TERMS_GENERATION_MAX,
    SELLER_APPLICATION_TERMS_REVISION_MAX_LENGTH,
    SellerApplicationTermsConfigError,
    getActiveSellerApplicationTermsRevision,
    getSellerApplicationTermsAuthority,
    normalizeSellerApplicationTermsGeneration,
    normalizeSellerApplicationTermsRevision
});
