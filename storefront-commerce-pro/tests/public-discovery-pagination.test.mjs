import test from "node:test";
import assert from "node:assert/strict";
import { createCursorTraversal } from "../src/integration/cursorTraversal.js";
import { pageQuery, normalizePagination } from "../src/adapters/publicPagination.js";
import { createProductCommunityAdapter } from "../src/adapters/productCommunityAdapter.js";
import { createCatalogAdapter } from "../src/adapters/catalogAdapter.js";
import { configureRuntimeCatalog, getVisibleRoots } from "../src/integration/runtimeCatalog.js";
import { normalizeCustomerApiRequest } from "../src/integration/customerHttp.js";

const page = (ids, nextCursor = null) => ({ items: ids.map((id) => ({ id })), pagination: { limit: 20, hasMore: nextCursor !== null, nextCursor } });
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };

test("bounded demand: initial + 5 explicit appends reach 101, preserve server order and deduplicate", async () => {
  let calls = 0;
  const pager = createCursorTraversal(async ({ cursor }) => {
    const start = cursor == null ? 0 : Number(cursor.substring(7));
    calls++;
    return page(Array.from({ length: start === 100 ? 5 : 20 }, (_, n) => start + n + 1), start < 100 ? `opaque-${start + 20}` : null);
  });
  await pager.refresh(); assert.equal(calls, 1); assert.equal(pager.snapshot().items.length, 20);
  for (let n = 0; n < 5; n++) await pager.more();
  assert.equal(calls, 6); assert.equal(pager.snapshot().items[100].id, 101);
  await pager.more(); assert.equal(calls, 6);
});
test("append errors preserve page one and retry the identical opaque cursor", async () => {
  const cursors = []; let fail = true;
  const pager = createCursorTraversal(async ({ cursor }) => {
    cursors.push(cursor);
    if (!cursor) return page([1, 2], "opaque-secret-structure");
    if (fail) throw new Error("offline");
    return page([2, 3]);
  });
  await pager.refresh(); await pager.more();
  assert.equal(pager.snapshot().phase, "append-error"); assert.deepEqual(pager.snapshot().items, [{ id: 1 }, { id: 2 }]);
  fail = false; await pager.more();
  assert.deepEqual(pager.snapshot().items.map((row) => row.id), [1, 2, 3]);
  assert.equal(cursors[1], cursors[2]);
});
for (const transition of ["search", "category", "attribute", "route", "refresh"]) {
  for (const stage of ["initial", "append"]) test(`${transition} rejects a delayed obsolete ${stage} response even if transport ignores abort`, async () => {
    const old = deferred(); let current = false; let requests = 0; const cursors = [];
    const pager = createCursorTraversal(({ cursor }) => {
      cursors.push(cursor); requests++;
      if (current) return Promise.resolve(page([99]));
      return stage === "initial" || requests === 2 ? old.promise : Promise.resolve(page([1], "old-cursor"));
    });
    let pending = pager.refresh();
    if (stage === "append") { await pending; pending = pager.more(); }
    current = true; await pager.refresh(); old.resolve(page([7], "stale-cursor")); await pending;
    assert.deepEqual(pager.snapshot().items, [{ id: 99 }]); assert.equal(pager.snapshot().pagination.nextCursor, null);
    assert.equal(cursors.at(-1), undefined);
  });
}
test("parallel clicks issue one continuation and disposal cannot publish", async () => {
  const waiting = deferred(); let calls = 0, published = 0;
  const pager = createCursorTraversal(async ({ cursor }) => { calls++; return cursor ? waiting.promise : page([1], "next"); }, () => published++);
  await pager.refresh(); const pending = pager.more(); await pager.more(); assert.equal(calls, 2);
  pager.dispose(); const before = published; waiting.resolve(page([2])); await pending; assert.equal(published, before);
});
test("non-advancing cursor fails continuation without erasing loaded content", async () => {
  const pager = createCursorTraversal(async () => page([1], "same"));
  await pager.refresh(); await pager.more(); assert.equal(pager.snapshot().phase, "append-error"); assert.equal(pager.snapshot().items.length, 1);
});
test("public query whitelist composes filters and forwards opaque cursor verbatim", () => {
  const params = new URLSearchParams(pageQuery({ q: "kulaklık %_!", categoryId: 9, includeDescendants: true, attributes: { color: ["blue"] }, cursor: "opaque-_", store_id: 77 }));
  assert.equal(params.get("pagination"), "cursor"); assert.equal(params.get("limit"), "20");
  assert.equal(params.get("cursor"), "opaque-_"); assert.equal(params.get("q"), "kulaklık %_!");
  assert.deepEqual(JSON.parse(params.get("attributes")), { color: ["blue"] }); assert.equal(params.has("store_id"), false);
  for (const limit of [0, 101, 1.5, "20"]) assert.throws(() => pageQuery({ limit }));
  for (const value of [{ limit: 20, hasMore: true, nextCursor: null }, { limit: 20, hasMore: false, nextCursor: "stale" }, {}]) assert.throws(() => normalizePagination(value));
});
test("server category counts keep branches outside first page navigable", () => {
  configureRuntimeCatalog({ products: [], categories: [{ id: "9", name: "Unloaded", slug: "unloaded", path: "unloaded", parentId: null, serverVisibleProductCount: 105, serverSellableProductCount: 105 }] });
  assert.equal(getVisibleRoots()[0].descendantVisibleProductCount, 105);
});
test("review aggregate stays server-owned, public DTO drops private fields and text remains inert", async () => {
  const paths = [];
  const adapter = createProductCommunityAdapter({ http: { request: async (path) => {
    paths.push(path);
    return path.includes("/reviews/") ? { reviews: [{ id: 1, rating: 1, comment: "<script>data</script>", user_id: 42, email: "private", phone: "private", moderation_notes: "private" }], average: "4.7", totalReviews: 108, reviewPermission: {}, pagination: { limit: 20, hasMore: true, nextCursor: "next" } }
      : { items: [{ id: 1, question: "<b>data</b>", answer: "answer", is_answered: true, user_id: 42, email: "private", answered_by: 55 }, { id: 2, question: "private", answer: "  ", status: "answered" }, { id: 3, question: "private" }], limit: 20, hasMore: false, nextCursor: null };
  } } });
  const reviews = await adapter.loadReviews(1), questions = await adapter.loadQuestions(1);
  assert.equal(reviews.average, 4.7); assert.equal(reviews.totalReviews, 108); assert.equal(reviews.items[0].rating, 1);
  assert.equal(questions.items.length, 1); assert.equal(questions.items[0].question, "<b>data</b>");
  assert.equal(JSON.stringify([reviews, questions]).includes("private"), false);
  for (const path of paths) assert.equal(new URL(path, "https://local.test").searchParams.get("pagination"), "cursor");
});
test("only explicit public reputation continuation is allowed, private own history stays separate", () => {
  for (const type of ["questions", "reviews"]) {
    assert.doesNotThrow(() => normalizeCustomerApiRequest(`/api/${type}/product/1?pagination=cursor&limit=20&cursor=opaque`));
    assert.throws(() => normalizeCustomerApiRequest(`/api/${type}/product/1?user_id=2`));
  }
  assert.throws(() => normalizeCustomerApiRequest("/api/questions/user?cursor=opaque"));
});
test("catalog prefers explicit cursor while legacy consumers retain array normalization", async () => {
  const paths = [], categories = [{ id: "1", name: "Category", path: "category" }];
  const adapter = createCatalogAdapter({ request: async (path) => { paths.push(path); return { items: [{ id: 101, name: "Beyond page one", price: 5, stock: 2, categoryIds: [1] }], limit: 20, hasMore: true, nextCursor: "next" }; } });
  const result = await adapter.loadPage({ catalog: { categories }, q: "Beyond", categorySlug: "category", attributes: { color: "blue" } });
  assert.equal(result.items[0].id, 101); assert.equal(result.pagination.hasMore, true); assert.match(paths[0], /categorySlug=category/);
});
