'use strict';

const express = require('express');
const { privateNoStore } = require('../middlewares/privateNoStore');

const SELLER_BUSINESS_PATHS = Object.freeze([
    '/stores/:storeId', '/stores/:storeId/public-preview', '/offers', '/offers/:offerId', '/offers/:offerId/commands', '/inventory',
    '/inventory/adjustments', '/inventory/:inventoryItemId/threshold', '/orders', '/orders/:orderId',
    '/orders/:orderId/commands', '/returns', '/dashboard', '/finance/summary', '/finance/ledger',
    '/finance/settlements', '/support/conversations', '/support/messages', '/support/conversations/:conversationId/rating'
]);

const capabilityDisabled = (_req, res) => res.status(503).json({ code: 'CAPABILITY_DISABLED', error: 'CAPABILITY_DISABLED' });
const featureGate = (enabled) => (req, res, next) => enabled === true ? next() : capabilityDisabled(req, res);
const commandPermission = (tenant, permissions) => (req, res, next) => {
    const permission = permissions[String(req.body?.command || '')];
    if (!permission) return res.status(400).json({ code: 'VALIDATION_FAILED', error: 'VALIDATION_FAILED' });
    return tenant.requireSellerPermission(permission)(req, res, next);
};

const createSellerBusinessRouter = ({ enabled = false, auth, tenant, controller, features = {} } = {}) => {
    const router = express.Router();
    if (enabled !== true) { router.use(capabilityDisabled); return router; }
    if (!auth || !tenant || !controller) throw new TypeError('Enabled seller business routes require seller dependencies.');
    const base = [privateNoStore, auth.sellerAudienceAuthenticate, auth.requireLiveSellerSession, tenant.resolveServerTenantContext];
    const offerWrite = featureGate(features.offerWrite === true);
    const orderWrite = featureGate(features.orderWrite === true);
    const financeRead = featureGate(features.financeRead === true);
    router.get('/stores/:storeId', ...base, tenant.requireSellerPermission('store.read'), controller.getStore);
    router.get('/stores/:storeId/public-preview', ...base, tenant.requireSellerPermission('store.read'), controller.getStorePublicPreview);
    router.patch('/stores/:storeId', ...base, tenant.requireSellerPermission('store.update'), controller.updateStore);
    router.get('/offers', ...base, tenant.requireSellerPermission('offer.read'), controller.listOffers);
    router.get('/offers/:offerId', ...base, tenant.requireSellerPermission('offer.read'), controller.getOffer);
    router.post('/offers', ...base, offerWrite, tenant.requireSellerPermission('offer.create'), controller.createOffer);
    router.patch('/offers/:offerId', ...base, offerWrite, tenant.requireSellerPermission('offer.update'), controller.updateOffer);
    router.post('/offers/:offerId/commands', ...base, offerWrite, commandPermission(tenant, { publish: 'offer.publish', unpublish: 'offer.update', archive: 'offer.archive' }), controller.offerCommand);
    router.get('/inventory', ...base, tenant.requireSellerPermission('inventory.read'), controller.listInventory);
    router.post('/inventory/adjustments', ...base, offerWrite, tenant.requireSellerPermission('inventory.adjust'), controller.adjustInventory);
    router.patch('/inventory/:inventoryItemId/threshold', ...base, offerWrite, tenant.requireSellerPermission('inventory.threshold.update'), controller.updateInventoryThreshold);
    router.get('/orders', ...base, tenant.requireSellerPermission('order.read'), controller.listOrders);
    router.get('/orders/:orderId', ...base, tenant.requireSellerPermission('order.read'), controller.getOrder);
    router.post('/orders/:orderId/commands', ...base, orderWrite, commandPermission(tenant, { prepare: 'order.prepare', ship: 'order.ship', cancel_request: 'order.cancel.respond' }), controller.orderCommand);
    router.get('/returns', ...base, tenant.requireSellerPermission('return.read'), controller.listReturns);
    router.get('/dashboard', ...base, financeRead, tenant.requireSellerPermission('dashboard.read'), controller.dashboard);
    router.get('/finance/summary', ...base, financeRead, tenant.requireSellerPermission('finance.read'), controller.financeSummary);
    router.get('/finance/ledger', ...base, financeRead, tenant.requireSellerPermission('finance.read'), controller.financeLedger);
    router.get('/finance/settlements', ...base, financeRead, tenant.requireSellerPermission('settlement.read'), controller.financeSettlements);
    router.get('/support/conversations', ...base, tenant.requireSellerPermission('support.read'), controller.listSupportConversations);
    router.post('/support/conversations', ...base, tenant.requireSellerPermission('support.create'), controller.createSupportConversation);
    router.post('/support/messages', ...base, tenant.requireSellerPermission('support.message'), controller.addSupportMessage);
    router.post('/support/conversations/:conversationId/rating', ...base, tenant.requireSellerPermission('support.rate'), controller.rateSupportConversation);
    return router;
};

module.exports = Object.freeze({ SELLER_BUSINESS_PATHS, capabilityDisabled, commandPermission, createSellerBusinessRouter });
