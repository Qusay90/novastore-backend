import assert from 'node:assert/strict';
import { normalizeAdminOrderDetail } from '../admin-commerce-pro/src/integration/orderDetail.js';
import { createSameOriginAdapter } from '../admin-commerce-pro/src/adapters/sameOriginAdapter.js';

// Check trust boundaries independently of the disposable HTTP/database test.
const payload = {
  id: 42,
  customerProfile: { mustNotReachView: true },
  deliveryRecipient: {
    source: 'order_snapshot', name: 'Synthetic recipient', phone: null,
    addressLine: '<strong>literal address text</strong>',
    profile: { mustNotReachView: true }, note: { invalid: true },
  },
  missingDeliveryFields: [],
};
const normalized = normalizeAdminOrderDetail(payload, 42);
assert.deepEqual(Object.keys(normalized).sort(), ['deliveryRecipient', 'id', 'missingDeliveryFields']);
assert.deepEqual(normalized.missingDeliveryFields, ['phone']);
assert.equal(normalized.deliveryRecipient.note, null);
assert.equal(normalized.deliveryRecipient.addressLine === payload.deliveryRecipient.addressLine, true);
assert.equal(Object.hasOwn(normalized.deliveryRecipient, 'profile'), false);
assert(Object.isFrozen(normalized.deliveryRecipient));
for (const bad of [null, { ...payload, id: 43 }, { ...payload, id: 42.5 },
  { ...payload, deliveryRecipient: null },
  { ...payload, deliveryRecipient: { ...payload.deliveryRecipient, source: 'current_profile' } }]) {
  assert.throws(() => normalizeAdminOrderDetail(bad, 42), TypeError);
}
const calls = [];
const adapter = createSameOriginAdapter({ request: async (url, options) => {
  calls.push({ url, options }); return payload;
} });
const controller = new AbortController();
await adapter.orderDetail({ orderId: 42, signal: controller.signal });
assert.equal(calls[0].url, '/api/admin/orders/42');
assert.equal(calls[0].options.signal, controller.signal);
for (const orderId of [0, -1, '1?customerId=2', NaN, Number.MAX_SAFE_INTEGER + 1]) {
  await assert.rejects(adapter.orderDetail({ orderId }), TypeError);
}
assert.equal(calls.length, 1);
await assert.rejects(createSameOriginAdapter({ request: async () => ({ ...payload, id: 43 }) }).orderDetail({ orderId: 42 }), TypeError);
console.log('adminOrderDeliveryContractSmoke: PASS identity, snapshot source, whitelist, missing data, exact URL, abort signal');
