'use strict';

const express = require('express');
const { privateNoStore } = require('../middlewares/privateNoStore');
const { createSellerRecoveryRateLimit } = require('../middlewares/sellerAuthRateLimit');

const createSellerPasswordRecoveryRouter = ({ controller, recoveryRateLimit = createSellerRecoveryRateLimit() } = {}) => {
    if (!controller || typeof recoveryRateLimit !== 'function') throw new TypeError('Seller password recovery route dependencies are required.');
    const router = express.Router();
    router.post('/auth/password/forgot', privateNoStore, recoveryRateLimit, controller.forgot);
    router.post('/auth/password/challenges/:challengeId/verify', privateNoStore, controller.verify);
    router.post('/auth/password/reset', privateNoStore, controller.reset);
    return router;
};

module.exports = Object.freeze({ createSellerPasswordRecoveryRouter });
