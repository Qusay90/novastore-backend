'use strict';

const defaultPublicStoreService = require('../services/publicStoreProjectionService');

const safeError = (res, error) => {
    const statusCode = Number(error?.statusCode);
    const safeStatus = Number.isInteger(statusCode) && statusCode >= 400 && statusCode < 600 ? statusCode : 503;
    const code = safeStatus >= 500 ? 'SELLER_BUSINESS_UNAVAILABLE' : (typeof error?.code === 'string' ? error.code : 'RESOURCE_NOT_FOUND');
    return res.status(safeStatus).json({ code, error: code });
};

const requireDatabase = (req) => {
    const database = req?.app?.locals?.sellerDatabase;
    if (!database || typeof database.query !== 'function') {
        const error = new Error('SELLER_BUSINESS_UNAVAILABLE');
        error.code = 'SELLER_BUSINESS_UNAVAILABLE';
        error.statusCode = 503;
        throw error;
    }
    return database;
};

const createSellerBusinessController = ({ storeService, publicStoreService = defaultPublicStoreService, offerInventoryService, orderService, financeService, supportService, reputationService } = {}) => {
    if (!storeService || !publicStoreService || !offerInventoryService || !orderService || !financeService || !supportService) throw new TypeError('Seller business services are required.');
    const respond = (handler) => async (req, res) => {
        try { return res.status(200).json(await handler(req)); } catch (error) { return safeError(res, error); }
    };
    const reputation = () => reputationService || require('../services/sellerReputationService');
    return Object.freeze({
        listReputationInbox: respond((req) => reputation().listInbox(requireDatabase(req), req.sellerContext, req.query)),
        readReputationItem: respond((req) => reputation().readItem(requireDatabase(req), req.sellerContext, req.params.itemId)),
        reputationCommand: respond((req) => reputation().command(requireDatabase(req), req.sellerContext, req.params.itemId, { ...req.body, idempotency_key: req.headers['idempotency-key'] })),
        getStore: respond((req) => storeService.readStore(requireDatabase(req), req.sellerContext, req.params.storeId)),
        getStorePublicPreview: respond((req) => publicStoreService.loadSellerPublicPreview(requireDatabase(req), req.sellerContext, req.params.storeId)),
        updateStore: respond((req) => storeService.updateStore(requireDatabase(req), req.sellerContext, req.params.storeId, { ...req.body, revision: req.body?.revision, idempotency_key: req.headers['idempotency-key'], step_up_verified: req.sellerStepUpVerified === true })),
        listOffers: respond((req) => offerInventoryService.listOffers(requireDatabase(req), req.sellerContext, req.query)),
        getOffer: respond((req) => offerInventoryService.loadOffer(requireDatabase(req), req.sellerContext, req.params.offerId)),
        createOffer: respond((req) => offerInventoryService.createOffer(requireDatabase(req), req.sellerContext, { ...req.body, idempotency_key: req.headers['idempotency-key'] })),
        updateOffer: respond((req) => offerInventoryService.updateOffer(requireDatabase(req), req.sellerContext, req.params.offerId, { ...req.body, idempotency_key: req.headers['idempotency-key'] })),
        offerCommand: respond((req) => offerInventoryService.offerCommand(requireDatabase(req), req.sellerContext, req.params.offerId, { ...req.body, idempotency_key: req.headers['idempotency-key'] })),
        listInventory: respond((req) => offerInventoryService.readInventory(requireDatabase(req), req.sellerContext, req.query)),
        adjustInventory: respond((req) => offerInventoryService.adjustInventory(requireDatabase(req), req.sellerContext, { ...req.body, idempotency_key: req.headers['idempotency-key'] })),
        updateInventoryThreshold: respond((req) => offerInventoryService.updateThreshold(requireDatabase(req), req.sellerContext, req.params.inventoryItemId, { ...req.body, idempotency_key: req.headers['idempotency-key'] })),
        listOrders: respond((req) => orderService.listOrders(requireDatabase(req), req.sellerContext, req.query)),
        getOrder: respond((req) => orderService.readOrder(requireDatabase(req), req.sellerContext, req.params.orderId)),
        orderCommand: respond((req) => orderService.orderCommand(requireDatabase(req), req.sellerContext, req.params.orderId, { ...req.body, idempotency_key: req.headers['idempotency-key'] })),
        listReturns: respond((req) => orderService.listReturns(requireDatabase(req), req.sellerContext, req.query)),
        dashboard: respond((req) => financeService.dashboard(requireDatabase(req), req.sellerContext, req.query)),
        financeSummary: respond((req) => financeService.financeSummary(requireDatabase(req), req.sellerContext, req.query)),
        financeLedger: respond((req) => financeService.listLedger(requireDatabase(req), req.sellerContext, req.query)),
        financeSettlements: respond((req) => financeService.listSettlements(requireDatabase(req), req.sellerContext, req.query)),
        listSupportConversations: respond((req) => supportService.listConversations(requireDatabase(req), req.sellerContext, req.query)),
        createSupportConversation: respond((req) => supportService.createConversation(requireDatabase(req), req.sellerContext, { ...req.body, idempotency_key: req.headers['idempotency-key'] })),
        addSupportMessage: respond((req) => supportService.addMessage(requireDatabase(req), req.sellerContext, { ...req.body, idempotency_key: req.headers['idempotency-key'] })),
        rateSupportConversation: respond((req) => supportService.rateConversation(requireDatabase(req), req.sellerContext, req.params.conversationId, { ...req.body, idempotency_key: req.headers['idempotency-key'] }))
    });
};

module.exports = Object.freeze({ createSellerBusinessController, safeError });
