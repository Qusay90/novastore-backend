import assert from 'node:assert/strict';
import test from 'node:test';
import { CART_V2_CAPABILITIES, normalizeCartV2, cartV2MutationBody } from '../src/checkout/cartV2Contract.ts';
const row = (variantId, storeId = 41) => ({ storeId, productId: 501, variantId, quantity: 1, name: 'Telefon', storeName: 'Nova Mağaza', price: 120, oldPrice: null, stock: 8, imageUrl: '/phone.png', variantSelections: variantId ? [{ group: 'Renk', value: String(variantId) }] : [] });
const response = (items, revision = 4) => ({ key: 'cart', exists: true, revision, payload: { cartSchemaVersion: 2, items }, migration: { status: 'NONE', unresolvedItems: [] } });
test('server store/product/variant survives reload and mutation without display authority', () => {
  const state = normalizeCartV2(response([row(901), row(902), row(null, 42)]));
  assert.equal(new Set(state.lines.map((line) => line.id)).size, 3);
  assert.deepEqual(cartV2MutationBody(state, state.lines), { expectedRevision: 4, payload: { cartSchemaVersion: 2, items: [
    { productId: 501, variantId: 901, quantity: 1, storeId: 41 }, { productId: 501, variantId: 902, quantity: 1, storeId: 41 }, { productId: 501, variantId: null, quantity: 1, storeId: 42 },
  ] } });
  assert.deepEqual(Object.keys(CART_V2_CAPABILITIES).sort(), ['X-Cart-CAS', 'X-Cart-Schema-Version', 'X-Cart-Variant-Line-Identity']);
});
test('exact line removal keeps sibling variant and other store', () => {
  const state = normalizeCartV2(response([row(901), row(902), row(901, 42)]));
  const kept = state.lines.filter((line) => line.id !== state.lines[0].id);
  assert.deepEqual(cartV2MutationBody(state, kept).payload.items.map(({ storeId, variantId }) => [storeId, variantId]), [[41, 902], [42, 901]]);
});
test('native relative cart media uses only the approved API origin, not packaged localhost assets', () => {
  assert.equal(normalizeCartV2(response([row(901)]), { apiOrigin: 'https://novastore.tr' }).lines[0].snapshot.image, 'https://novastore.tr/phone.png');
  assert.equal(normalizeCartV2(response([row(901)]), { apiOrigin: 'http://127.0.0.1:5000', allowCleartextAssets: true }).lines[0].snapshot.image, 'http://127.0.0.1:5000/phone.png');
  assert.throws(() => normalizeCartV2(response([{ ...row(901), imageUrl: 'http://unapproved.test/a.png' }]), { apiOrigin: 'http://127.0.0.1:5000', allowCleartextAssets: true }));
});
test('unknown schema, missing variant null, duplicate identities and invalid revisions fail closed', () => {
  for (const invalid of [{ ...response([]), revision: -1 }, { ...response([]), revision: 1.5 }, { ...response([]), payload: { cartSchemaVersion: 99, items: [] } }, response([row(undefined)]), response([row(901), row(901)]), response([row(0)]), response([{ ...row(901), imageUrl: 'javascript:alert(1)' }]), response([{ ...row(901), quantity: 1000 }])]) assert.throws(() => normalizeCartV2(invalid));
});
test('valid larger server storage stays lossless for reduction/removal, independent of checkout limits', () => {
  const rows = Array.from({ length: 21 }, (_, index) => ({ ...row(901 + index), quantity: 21 }));
  const state = normalizeCartV2(response(rows));
  assert.equal(state.lines.length, 21);
  assert.equal(state.lines.reduce((sum, line) => sum + line.quantity, 0), 441);
  const changed = state.lines.slice(1).map((line, index) => index === 0 ? { ...line, quantity: 20 } : line);
  assert.deepEqual(cartV2MutationBody(state, changed).payload.items.map((line) => line.quantity), [20, ...Array(19).fill(21)]);
  const maximum = normalizeCartV2(response(Array.from({ length: 200 }, (_, index) => ({ ...row(901 + index), quantity: 999 }))));
  assert.equal(cartV2MutationBody(maximum, maximum.lines).payload.items.reduce((sum, line) => sum + line.quantity, 0), 199800);
  assert.throws(() => normalizeCartV2(response(Array.from({ length: 201 }, (_, index) => row(901 + index)))));
  assert.throws(() => cartV2MutationBody(state, [{ ...state.lines[0], quantity: 1000 }]));
});
test('ambiguous v1 migration stays pending until user resolves exact product', () => {
  const value = response([row(901)]);
  value.migration = { status: 'REVIEW_REQUIRED', unresolvedItems: [{ productId: 502, quantity: 2, reason: 'VARIANT_SELECTION_REQUIRED' }] };
  const state = normalizeCartV2(value);
  assert.deepEqual(state.pending, value.migration.unresolvedItems);
  assert.equal(Object.hasOwn(cartV2MutationBody(state, state.lines), 'resolveLegacyProductIds'), false);
  assert.deepEqual(cartV2MutationBody(state, state.lines, [502]).resolveLegacyProductIds, [502]);
});
