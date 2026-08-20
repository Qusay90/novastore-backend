'use strict';

const express = require('express');
const { privateNoStore } = require('../middlewares/privateNoStore');

const SELLER_CONTEXT_READ_PATHS = Object.freeze([
    '/context',
    '/organizations/current',
    '/team/roles',
    '/team/members'
]);

const capabilityDisabled = (_req, res) => res.status(503).json({ code: 'CAPABILITY_DISABLED', error: 'CAPABILITY_DISABLED' });

const createSellerContextRouter = ({ enabled = false, auth, tenant, controller } = {}) => {
    const router = express.Router();
    if (enabled !== true) {
        router.use(capabilityDisabled);
        return router;
    }
    if (!auth || !tenant || !controller) throw new TypeError('Enabled seller context routes require seller dependencies.');
    const base = [privateNoStore, auth.sellerAudienceAuthenticate, auth.requireLiveSellerSession, tenant.resolveServerTenantContext];
    router.get('/context', ...base, controller.getContext);
    router.get('/organizations/current', ...base, tenant.requireSellerPermission('organization.read'), controller.getOrganizationCurrent);
    router.get('/team/roles', ...base, tenant.requireSellerPermission('team.read'), controller.getTeamRoles);
    router.get('/team/members', ...base, tenant.requireSellerPermission('team.read'), controller.getTeamMembers);
    return router;
};

module.exports = Object.freeze({ SELLER_CONTEXT_READ_PATHS, capabilityDisabled, createSellerContextRouter });
