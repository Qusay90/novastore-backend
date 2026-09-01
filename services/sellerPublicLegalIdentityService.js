'use strict';

const crypto = require('crypto');

const VERSION_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,79}$/;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const CONTROL_CHARACTER_PATTERN = /[\u0000\u000b\u000c\u007f]/;

class SellerPublicLegalIdentityError extends Error {
    constructor(details = null) {
        super('Verified seller public legal identity is required.');
        this.name = 'SellerPublicLegalIdentityError';
        this.code = 'SELLER_PUBLIC_LEGAL_IDENTITY_REQUIRED';
        this.statusCode = 503;
        this.publicMessage = 'Satıcıya ait doğrulanmış kamusal kimlik tamamlanmadan ödeme sözleşmesi oluşturulamaz.';
        this.details = details;
    }
}

const text = (value) => String(value === undefined || value === null ? '' : value).trim();
const validText = (value, minimum, maximum) => (
    value.length >= minimum
    && value.length <= maximum
    && !CONTROL_CHARACTER_PATTERN.test(value)
);

const canonicalSellerPublicLegalIdentity = ({
    version,
    publicLegalName,
    publicTradeName,
    publicDisclosureText
}) => JSON.stringify({
    publicDisclosureText,
    publicLegalName,
    publicTradeName,
    version
});

const buildSellerPublicLegalIdentityContentSha256 = (value = {}) => {
    const version = text(value.version ?? value.seller_legal_identity_version);
    const publicLegalName = text(value.publicLegalName ?? value.public_legal_name);
    const publicTradeName = text(value.publicTradeName ?? value.public_trade_name);
    const publicDisclosureText = text(value.publicDisclosureText ?? value.public_disclosure_text);
    return crypto.createHash('sha256').update(canonicalSellerPublicLegalIdentity({
        version,
        publicLegalName,
        publicTradeName,
        publicDisclosureText
    }), 'utf8').digest('hex');
};

const normalizeApprovedSellerPublicLegalIdentity = (input = {}) => {
    const row = input && typeof input === 'object' ? input : {};
    const id = Number(row.seller_legal_identity_id ?? row.id);
    const organizationId = Number(row.organization_id ?? row.organizationId);
    const version = text(row.seller_legal_identity_version ?? row.version);
    const publicLegalName = text(row.public_legal_name ?? row.publicLegalName);
    const publicTradeName = text(row.public_trade_name ?? row.publicTradeName);
    const publicDisclosureText = text(row.public_disclosure_text ?? row.publicDisclosureText);
    const contentSha256 = text(row.seller_legal_identity_content_sha256 ?? row.content_sha256 ?? row.contentSha256).toLowerCase();
    const status = text(row.seller_legal_identity_status ?? row.status).toLowerCase();
    const approvedAt = text(row.seller_legal_identity_approved_at ?? row.approved_at ?? row.approvedAt);
    const expectedHash = buildSellerPublicLegalIdentityContentSha256({
        version,
        publicLegalName,
        publicTradeName,
        publicDisclosureText
    });
    const valid = Number.isSafeInteger(id)
        && id > 0
        && Number.isSafeInteger(organizationId)
        && organizationId > 0
        && status === 'approved'
        && VERSION_PATTERN.test(version)
        && validText(publicLegalName, 2, 200)
        && validText(publicTradeName, 2, 160)
        && validText(publicDisclosureText, 2, 4000)
        && SHA256_PATTERN.test(contentSha256)
        && contentSha256 === expectedHash
        && Number.isFinite(Date.parse(approvedAt));
    if (!valid) return null;
    return Object.freeze({
        id,
        organizationId,
        version,
        publicLegalName,
        publicTradeName,
        publicDisclosureText,
        contentSha256,
        approvedAt: new Date(approvedAt).toISOString()
    });
};

const assertApprovedSellerPublicLegalIdentity = (row, details = null) => {
    const identity = normalizeApprovedSellerPublicLegalIdentity(row);
    const expectedOrganizationId = Number(details?.organizationId);
    const organizationMismatch = Number.isSafeInteger(expectedOrganizationId)
        && expectedOrganizationId > 0
        && identity?.organizationId !== expectedOrganizationId;
    if (!identity || organizationMismatch) throw new SellerPublicLegalIdentityError(details);
    return identity;
};

module.exports = Object.freeze({
    SellerPublicLegalIdentityError,
    assertApprovedSellerPublicLegalIdentity,
    buildSellerPublicLegalIdentityContentSha256,
    canonicalSellerPublicLegalIdentity,
    normalizeApprovedSellerPublicLegalIdentity
});
