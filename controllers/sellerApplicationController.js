'use strict';

const { toSafeApplicationError } = require('../services/sellerApplicationService');

const idempotencyKey = (req) => req.get?.('Idempotency-Key') || req.headers?.['idempotency-key'];
const applicantSecret = (req) => req.get?.('Applicant-Secret') || req.headers?.['applicant-secret'];

const failure = (res, error) => {
    const safe = toSafeApplicationError(error);
    return res.status(safe.statusCode).json({ code: safe.code, error: safe.code });
};

const createSellerApplicationController = ({ service } = {}) => {
    if (!service) throw new TypeError('Seller application service is required.');
    return Object.freeze({
        create: async (req, res) => {
            try { return res.status(201).json(await service.create(req.body, idempotencyKey(req), applicantSecret(req))); }
            catch (error) { return failure(res, error); }
        },
        current: async (req, res) => {
            try { return res.status(200).json({ application: await service.current(req.sellerApplicant) }); }
            catch (error) { return failure(res, error); }
        },
        updateStep: async (req, res) => {
            try { return res.status(200).json(await service.updateStep(req.sellerApplicant, req.params.step, req.body, idempotencyKey(req))); }
            catch (error) { return failure(res, error); }
        },
        verificationCommand: async (req, res) => {
            try { return res.status(200).json(await service.verificationCommand(req.sellerApplicant, req.params.channel, req.body, idempotencyKey(req))); }
            catch (error) { return failure(res, error); }
        }
    });
};

module.exports = Object.freeze({ applicantSecret, createSellerApplicationController, failure, idempotencyKey });
