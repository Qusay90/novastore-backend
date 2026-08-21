'use strict';

const { toSafeRecoveryError } = require('../services/sellerPasswordRecoveryService');

const failure = (res, error) => {
    const safe = toSafeRecoveryError(error);
    return res.status(safe.statusCode).json({ code: safe.code, error: safe.code });
};

const createSellerPasswordRecoveryController = ({ service } = {}) => {
    if (!service) throw new TypeError('Seller password recovery service is required.');
    return Object.freeze({
        forgot: async (req, res) => {
            try { return res.status(202).json(await service.forgot(req.body)); }
            catch (error) { return failure(res, error); }
        },
        verify: async (req, res) => {
            try { return res.status(200).json(await service.verify(req.params.challengeId, req.body)); }
            catch (error) { return failure(res, error); }
        },
        reset: async (req, res) => {
            try { return res.status(200).json(await service.reset(req.body)); }
            catch (error) { return failure(res, error); }
        }
    });
};

module.exports = Object.freeze({ createSellerPasswordRecoveryController, failure });
