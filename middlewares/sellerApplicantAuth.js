'use strict';

const applicantFailure = (res) => res.status(401).json({ code: 'APPLICANT_AUTH_REQUIRED', error: 'APPLICANT_AUTH_REQUIRED' });

const createSellerApplicantAuth = ({ service } = {}) => {
    if (!service || typeof service.authenticate !== 'function') throw new TypeError('Seller applicant auth service is required.');
    return async (req, res, next) => {
        try {
            const header = String(req.headers?.authorization || '');
            if (!header.startsWith('Bearer ')) return applicantFailure(res);
            req.sellerApplicant = await service.authenticate(header.slice(7).trim());
            return next();
        } catch (_) {
            return applicantFailure(res);
        }
    };
};

module.exports = Object.freeze({ createSellerApplicantAuth });
