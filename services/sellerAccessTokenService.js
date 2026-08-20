'use strict';

const jwt = require('jsonwebtoken');

const issuer = 'novastore-seller-v1';
const audience = 'seller';

const durationInSeconds = (value) => {
    let seconds = Number.isSafeInteger(value) ? value : null;
    if (seconds === null) {
        const match = /^(\d+)([smhd])$/u.exec(String(value || '').trim());
        if (match) {
            const multiplier = Object.freeze({ s: 1, m: 60, h: 3600, d: 86400 })[match[2]];
            seconds = Number(match[1]) * multiplier;
        }
    }
    if (!Number.isSafeInteger(seconds) || seconds < 1 || seconds > 900) {
        const error = new Error('SELLER_ACCESS_TOKEN_EXPIRY_INVALID');
        error.code = 'SELLER_ACCESS_TOKEN_EXPIRY_INVALID';
        throw error;
    }
    return seconds;
};

const nonEmpty = (value, code = 'SELLER_ACCESS_TOKEN_INVALID') => {
    if (typeof value !== 'string' || value.trim().length === 0) {
        const error = new Error(code);
        error.code = code;
        throw error;
    }
    return value.trim();
};

const createSellerAccessTokenService = ({ secret, expiresIn = '15m' } = {}) => {
    const signingSecret = nonEmpty(secret, 'SELLER_ACCESS_TOKEN_SECRET_REQUIRED');
    if (signingSecret.length < 32) {
        const error = new Error('SELLER_ACCESS_TOKEN_SECRET_REQUIRED');
        error.code = 'SELLER_ACCESS_TOKEN_SECRET_REQUIRED';
        throw error;
    }
    const expiresInSeconds = durationInSeconds(expiresIn);
    const issue = ({ sessionId, userId }) => jwt.sign(
        { sid: nonEmpty(sessionId) },
        signingSecret,
        { algorithm: 'HS256', issuer, subject: String(Number(userId)), audience, expiresIn: expiresInSeconds }
    );
    const verify = (token) => jwt.verify(nonEmpty(token), signingSecret, { algorithms: ['HS256'], issuer, audience });
    return Object.freeze({ issue, verify, issuer, audience, expiresInSeconds });
};

module.exports = Object.freeze({ createSellerAccessTokenService, issuer, audience });
