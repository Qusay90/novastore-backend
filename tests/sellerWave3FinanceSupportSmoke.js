'use strict';

const assert = require('node:assert/strict');
const { financeSummary, SellerFinanceError } = require('../services/sellerFinanceService');
const { createConversation, SellerSupportError } = require('../services/sellerSupportService');

const context = Object.freeze({ organizationId: 1, membershipId: 1, userId: 7, storeIds: [11] });
assert.rejects(() => financeSummary({}, context, { currency: 'try' }), (error) => error instanceof SellerFinanceError && error.code === 'VALIDATION_FAILED');
assert.rejects(() => createConversation({}, context, { category: 'billing', subject: 'Need help', body: 'See https://example.test', client_message_id: 'c-1', idempotency_key: 'support-key' }), (error) => error instanceof SellerSupportError && error.code === 'VALIDATION_FAILED');
assert.rejects(() => createConversation({}, { ...context, storeIds: [] }, { category: 'billing', subject: 'Need help', body: 'No provider', client_message_id: 'c-1', idempotency_key: 'support-key' }), (error) => error instanceof SellerSupportError && error.code === 'RESOURCE_NOT_FOUND');
console.log('sellerWave3FinanceSupportSmoke PASS');
