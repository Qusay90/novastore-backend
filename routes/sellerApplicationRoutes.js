'use strict';

const express = require('express');
const { privateNoStore } = require('../middlewares/privateNoStore');

const SELLER_APPLICATION_PATHS = Object.freeze([
    '/applications',
    '/applications/current',
    '/applications/current/steps/:step',
    '/applications/current/verifications/:channel/commands'
]);

const createSellerApplicationRouter = ({ controller, applicantAuth } = {}) => {
    if (!controller || typeof applicantAuth !== 'function') throw new TypeError('Seller application route dependencies are required.');
    const router = express.Router();
    router.post('/applications', privateNoStore, controller.create);
    router.get('/applications/current', privateNoStore, applicantAuth, controller.current);
    router.patch('/applications/current/steps/:step', privateNoStore, applicantAuth, controller.updateStep);
    router.post('/applications/current/verifications/:channel/commands', privateNoStore, applicantAuth, controller.verificationCommand);
    return router;
};

module.exports = Object.freeze({ SELLER_APPLICATION_PATHS, createSellerApplicationRouter });
