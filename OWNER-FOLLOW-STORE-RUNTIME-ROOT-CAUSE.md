# Owner Follow Store Runtime Root Cause

Authority examined:

- Customer Android: `71464a39d1b2bb0a00819981e66da4b7c54493f0` / `cda756c25abd93f63a759d138259400360a4c42d`
- PC1 read-only: `47c085973ecd27bb3e8577b2cd48fb4d36523ffa` / `91bf3f5f4c1898e81fff300ee3506a8c6b4f64bf`

## Reproduction and classification

The owner's physical reproduction is consistent with the committed R11-R4 source and is treated as authoritative. `StorefrontScreen` initialized `following` to `false`; tapping the button only executed `setFollowing(!following)`. The screen never called the authenticated PC1 follow mutation and never loaded the current Customer's per-store follow state when the route was opened again.

Root-cause classification:

- `CLIENT_ONLY_OPTIMISTIC_STATE`
- `MUTATION_NOT_SENT`
- `INITIAL_STATE_REFETCH_MISSING`
- `FOLLOW_LIST_REFRESH_MISSING`
- `ANDROID_METHOD_ALLOWLIST_MISMATCH`

The failure is not caused by the store slug, Customer A/B identity, Account list endpoint, or PC1 persistence service.

## Missing client contract

R11-R4 exposed only:

- `GET /api/store-follows` for the current Customer's Account list;
- `DELETE /api/store-follows/:storeSlug` for unfollow.

The TypeScript and native Java transport allowlists rejected the authoritative per-store operations that the Store screen requires:

- `GET /api/store-follows/:storeSlug`;
- `POST /api/store-follows/:storeSlug`.

The initial Customer normalizer and both transport allowlists also bounded the slug to 80 characters while the canonical public-store and PC1 contracts accept up to 160. Closure must harmonize the Customer boundary at 160 and reject 161 characters, without widening the allowed character grammar.

## PC1 authority

The accepted PC1 router authenticates every store-follow route and provides current-user-scoped `GET /`, `GET /:storeSlug`, `POST /:storeSlug`, and `DELETE /:storeSlug`. Its service resolves the canonical public store, writes or deletes `store_follows (user_id, store_id)`, and re-reads `{ store_slug, following, follower_count }` after the mutation. Follow insertion is idempotent.

Therefore:

- `PC1_CONTRACT_DEFECT: NO`
- `CLIENT_ONLY_FOLLOW_AUTHORITY_AT_ROOT_CAUSE: YES`
- `CROSS_CUSTOMER_SERVER_SCOPE: CURRENT_AUTHENTICATED_USER`

## Required closure

The Customer Store screen must load per-store state after a verified login, send the canonical server mutation, accept only a validated echoed slug/boolean/count response, refresh the Account followed-store collection, and discard stale replies after route or session change. Guest and preview modes must not mutate follow authority. Route revisit and app reopen must load PC1 state rather than a local presentation cache.

The original R11-R4 tests were insufficient because they injected a pre-existing followed-store collection and verified Account rendering/unfollow, but never clicked the real Store follow control or asserted the required `GET → POST → route return → Account propagation` lifecycle.

## R11-R5 implementation closure

R11-R5 closes the owner-reproduced defect without introducing client-owned follow truth:

- `useCustomerStoreFollowRuntime.ts` performs the per-store authoritative `GET` after a verified Customer session and every route/remount refresh.
- `POST` and `DELETE` responses are validated before `following` or `followerCount` changes become visible; a rejected mutation preserves the last server-confirmed state.
- A confirmed mutation refreshes `CustomerAccountRuntime`'s followed-store collection, so Store and `Takip Ettiğim Mağazalar` converge on the same PC1 authority.
- Route lifecycle, mutation sequence, and verified-session guards quarantine late Customer/route responses. A delayed Customer A reply cannot overwrite Customer B state.
- Guest, preview, loading, offline, and unverified-session paths fail closed; they cannot emit a follow mutation or present local follow authority.
- TypeScript and native Java method/path allowlists now admit only canonical `GET/POST/DELETE /api/store-follows/:storeSlug` operations. The slug boundary is harmonized to 160 canonical lowercase slug characters and rejects 161 or malformed/encoded traversal input.

Targeted R11-R5 coverage explicitly exercises:

1. initial per-store GET, confirmed POST, route revisit/remount re-fetch, Account propagation, confirmed DELETE, and final re-fetch;
2. rejected mutation preservation of the last confirmed state;
3. zero follow reads/mutations in guest and preview modes;
4. delayed Customer A GET isolation after switching to Customer B.

## Physical Customer A/B closure evidence

The connected physical Android device completed the authoritative lifecycle:

- Customer A registered and began with `following: false`.
- Customer A follow mutation was server-confirmed, remained visible after route return, propagated as one followed store in Account, and survived process force-stop/reopen.
- After Customer A logout and Customer B login on the same phone, Customer B's followed-store list was empty and the Store control returned `following: false`; no stale A follow leaked.
- Customer B independently followed the same store, then unfollowed it; both the Store control and Account list converged back to false/empty.

Closure classification:

```text
OWNER_REPRODUCED_FOLLOW_DEFECT: CLOSED
FOLLOW_TRUTH_AUTHORITY: PC1_CURRENT_AUTHENTICATED_CUSTOMER
FOLLOW_ROUTE_REFETCH: PASS
FOLLOW_APP_REOPEN_PERSISTENCE: PASS
FOLLOW_ACCOUNT_PROPAGATION: PASS
FOLLOW_UNFOLLOW_CONVERGENCE: PASS
FOLLOW_GUEST_PREVIEW_MUTATION_COUNT: 0
FOLLOW_CUSTOMER_A_TO_B_LEAK_COUNT: 0
FOLLOW_PERSISTENCE_PHYSICAL_CUSTOMER_A_B: PASS
PC1_SOURCE_CHANGE_REQUIRED: NO
```
