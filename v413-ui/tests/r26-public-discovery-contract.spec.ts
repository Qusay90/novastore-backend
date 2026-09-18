import { expect, test } from "@playwright/test";
import { createPublicPageRepository } from "../src/adapters/publicPageRepository";
import { marketplacePath, validPublicReadQuery } from "../src/adapters/publicReadQuery";
import { normalizePublicCategoryTree, normalizePublicQuestions, normalizePublicReviews } from "../src/adapters/publicDiscoveryClient";
const page = (ids: number[], cursor: string | null = null) => ({ items: ids.map(id => ({ id })), summary: undefined, limit: 20, hasMore: cursor !== null, nextCursor: cursor });
const deferred = <T,>() => { let resolve!: (value: T) => void; let reject!: (reason: Error) => void; const promise = new Promise<T>((a,b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };

test("append preserves first page on failure, retries same cursor, deduplicates canonical IDs", async () => {
  const calls: (string | undefined)[] = []; let fail = true;
  const repo = createPublicPageRepository(async cursor => { calls.push(cursor); if (!cursor) return page([1,2], "opaque_A"); if (fail) throw new Error("offline"); return page([2,3]); });
  await repo.refresh(); await repo.loadMore();
  expect(repo.getSnapshot()).toMatchObject({ items: [{id:1},{id:2}], appendError: "error", nextCursor: "opaque_A" });
  fail = false; await repo.loadMore(); expect(repo.getSnapshot().items).toEqual([{id:1},{id:2},{id:3}]);
  expect(calls).toEqual([undefined,"opaque_A","opaque_A"]); expect(repo.getSnapshot().hasMore).toBe(false);
});
test("refresh discards in-flight append and resets cursor; repeated loadMore coalesces", async () => {
  const pending = deferred<ReturnType<typeof page>>(); const calls: unknown[] = []; let refreshed = false;
  const repo = createPublicPageRepository(async cursor => { calls.push(cursor); return cursor ? pending.promise : page(refreshed ? [99] : [1], refreshed ? null : "A"); });
  await repo.refresh(); const append = repo.loadMore(); await repo.loadMore(); refreshed = true; await repo.refresh(); pending.resolve(page([2],"B")); await append;
  expect(repo.getSnapshot().items).toEqual([{id:99}]); expect(calls).toEqual([undefined,"A",undefined]); expect(repo.getSnapshot().nextCursor).toBeNull();
});
test("disposed search/category/store/product repository cannot publish a late response", async () => {
  const pending = deferred<ReturnType<typeof page>>(); const repo = createPublicPageRepository(() => pending.promise);
  const load = repo.refresh(); repo.dispose(); const snapshot = repo.getSnapshot(); pending.resolve(page([99])); await load; expect(repo.getSnapshot()).toBe(snapshot);
});
test("stale first load loses to refresh and cyclic cursor stops with retained content", async () => {
  const old = deferred<ReturnType<typeof page>>(); let call = 0;
  const repo = createPublicPageRepository(async () => ++call === 1 ? old.promise : page([22], "loop"));
  const first = repo.refresh(); await repo.refresh(); old.resolve(page([11])); await first; await repo.loadMore();
  expect(repo.getSnapshot()).toMatchObject({ items: [{id:22}], appending:false, appendError:"error" });
});
test("discovery query is bounded, server-side, encoded and rejects authority selectors", () => {
  const path = marketplacePath({ q: "Çığ %_!", categoryId: 17, includeDescendants: true }, "opaque_A");
  expect(path).toContain("q=%C3%87%C4%B1%C4%9F"); expect(path).toContain("categoryId=17"); expect(path).toContain("cursor=opaque_A");
  expect(() => marketplacePath({q:"x".repeat(121)})).toThrow();
  expect(validPublicReadQuery(new URL(path,"https://novastore.invalid"))).toBe(true);
  for (const query of ["limit=101","limit=1&limit=2","storeId=2","userId=3","q=%00","cursor=https://evil.test","pagination=offset"]) expect(validPublicReadQuery(new URL("/api/products?"+query,"https://novastore.invalid"))).toBe(false);
});
test("canonical category hierarchy validates exact parents and excludes unneeded fields", () => {
  const child = { id:2,slug:"child",name:"Alt <b>metin</b>",parent_id:1,image_url:null,children:[] };
  const root = { id:1,slug:"root",name:"Ana",parent_id:null,image_url:null,children:[child],internal:"not projected" };
  expect(normalizePublicCategoryTree([root])[0].children[0]).toMatchObject({id:2,parentId:1,name:child.name});
  expect(normalizePublicCategoryTree([root])[0]).not.toHaveProperty("internal");
  expect(() => normalizePublicCategoryTree([{...root,children:[{...child,parent_id:9}]}])).toThrow();
  expect(() => normalizePublicCategoryTree([root,root])).toThrow();
});
test("public Q&A accepts plain text only answered DTOs and rejects private fields", () => {
  const item = { id:1,question:"<img onerror=alert(1)>",answer:"<script>DATA</script>",user_name:"A*** B***",created_at:null,answered_at:null,status:"answered",is_answered:true };
  const payload = {...page([]),summary:undefined,items:[item]}; delete (payload as any).summary;
  expect(normalizePublicQuestions(payload).items[0].question).toBe(item.question);
  for (const changed of [{...item,user_id:7},{...item,answer:" "},{...item,is_answered:false},{...item,status:"pending"}]) expect(() => normalizePublicQuestions({...payload,items:[changed]})).toThrow();
});
test("review global summary never uses partial-page ratings and fails closed on PII/media", () => {
  const item = {id:1,rating:1,comment:"<b>DATA</b>",full_name:"A***",created_at:null,media:[]};
  const payload = {reviews:[item],average:"4.75",totalReviews:80,reviewPermission:{code:"LOGIN_REQUIRED"},pagination:{limit:20,hasMore:true,nextCursor:"A"}};
  expect(normalizePublicReviews(payload).summary).toEqual({average:4.75,total:80,permissionCode:"LOGIN_REQUIRED"});
  expect(() => normalizePublicReviews({...payload,reviews:[{...item,email:"private@example.test"}]})).toThrow();
  expect(() => normalizePublicReviews({...payload,reviews:[{...item,media:[{id:2,media_url:"javascript:alert(1)",media_type:"image",sort_order:0}]}]})).toThrow();
});
