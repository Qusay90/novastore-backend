'use strict';

const express = require('express');
const { privateNoStore } = require('../middlewares/privateNoStore');
const { createSellerLoginRateLimit } = require('../middlewares/sellerAuthRateLimit');

const createSellerAuthRouter = ({ auth, controller, loginRateLimit = createSellerLoginRateLimit() } = {}) => {
    if (!auth || !controller) throw new TypeError('Seller auth route dependencies are required.');
    if (typeof loginRateLimit !== 'function') throw new TypeError('Seller login rate limiter is required.');
    const router = express.Router();
    router.post('/auth/login', privateNoStore, loginRateLimit, controller.login);
    router.post('/auth/refresh', privateNoStore, controller.refresh);
    router.post('/auth/logout', privateNoStore, auth.sellerAudienceAuthenticate, auth.requireLiveSellerSession, controller.logout);
    router.post('/auth/logout-all', privateNoStore, auth.sellerAudienceAuthenticate, auth.requireLiveSellerSession, controller.logoutAll);
    router.get('/security/sessions', privateNoStore, auth.sellerAudienceAuthenticate, auth.requireLiveSellerSession, controller.sessions);
    return router;
};

module.exports = Object.freeze({ createSellerAuthRouter });
