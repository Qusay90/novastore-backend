'use strict';

const express = require('express');
const { authenticateCustomer } = require('../middlewares/authMiddleware');
const projectionService = require('../services/publicStoreProjectionService');
const followService = require('../services/storeFollowService');

const createStoreFollowRouter = ({ service = followService, authenticate = authenticateCustomer } = {}) => {
    if (!service || typeof service.getStoreFollowState !== 'function' || typeof service.setStoreFollow !== 'function') {
        throw new TypeError('Store follow service is required.');
    }
    if (typeof authenticate !== 'function') throw new TypeError('Customer authentication middleware is required.');
    const router = express.Router();
    router.use(authenticate);

    const respond = async (req, res, operation) => {
        try {
            const result = await operation(req.params.storeSlug, req.user?.id);
            return res.status(200).json(result);
        } catch (error) {
            if (error instanceof projectionService.PublicStoreError || error?.statusCode === 404) {
                return res.status(404).json({ code: 'STORE_NOT_FOUND', error: 'STORE_NOT_FOUND' });
            }
            return res.status(503).json({ code: 'STORE_FOLLOW_UNAVAILABLE', error: 'STORE_FOLLOW_UNAVAILABLE' });
        }
    };

    router.get('/:storeSlug', (req, res) => respond(
        req,
        res,
        (slug, userId) => service.getStoreFollowState(slug, userId)
    ));
    router.post('/:storeSlug', (req, res) => respond(
        req,
        res,
        (slug, userId) => service.setStoreFollow(slug, userId, true)
    ));
    router.delete('/:storeSlug', (req, res) => respond(
        req,
        res,
        (slug, userId) => service.setStoreFollow(slug, userId, false)
    ));

    return router;
};

module.exports = createStoreFollowRouter();
module.exports.createStoreFollowRouter = createStoreFollowRouter;
