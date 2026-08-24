# Seller R8-R1 — New Customer Android App Preview Handoff

Status: `READY_FOR_SEPARATE_SELLER_R8_AUTHORIZATION`

## Superseded authority

- `SELLER-R8-CUSTOMER-ANDROID-APP-PREVIEW-HANDOFF.md` from the rejected `android-customer-theme-integration` worktree is `SUPERSEDED_DO_NOT_CONSUME`.
- Its old Compose/white-teal Customer presentation is not an App Preview authority and must remain unreachable.
- Seller R8 must not copy, import, relabel, or visually approximate that obsolete presentation.

## Canonical new-theme authority

- Customer branch: `codex/android-customer-r8-r1-authoritative-theme-rebind`
- Presentation source commit: `74367f743cc89b2db89f3ccd21358971db383a98`
- Presentation source tree: `bb8f37d9c72bd9a54102c96cbd57c3c254cf57b9`
- Runtime: authoritative V4.13 React/Vite application inside Capacitor Android.
- Android package: `com.novastore.app.v413preview`
- Canonical store presentation: `v413-ui/src/Prototype.tsx` → `StorefrontScreen`
- Canonical product card: `v413-ui/src/Prototype.tsx` → `ProductCard`
- Canonical product detail: `v413-ui/src/Prototype.tsx` → `ProductDetailScreen`
- Customer public adapter: `v413-ui/src/adapters/publicStoreContract.ts` and `publicStoreClient.ts`
- Android public bridge: `v413-ui/android/app/src/main/java/com/novastore/app/NovaPublicStorePlugin.java`
- Typed route authority: `v413-ui/src/native/routeContract.ts`
- Public API: `GET /api/public/stores/{storeSlug}`

The final closure commit adds tests and governance documents only. It does not replace this presentation source commit as the immutable implementation reference.

## Presentation contract

Seller App Preview must consume the same new navy/orange V4.13 Store, ProductCard, PDP, top bar, spacing, typography, wave-card geometry, cart treatment, and rounded/glass bottom-navigation language used by the active Customer APK. A Seller-owned visual clone, screenshot, Web page relabeled as an app, old Compose screen, or fixture-only mock is prohibited.

The route context is:

```text
CAL-04 + view=store + storeSlug=<canonical-public-slug> + mode=preview
```

Store → product navigation must preserve:

```text
CAL-06 + storeSlug=<same-slug> + productId=<public-product-id> + mode=preview
```

The public slug must match `^[a-z0-9]+(?:-[a-z0-9]+)*$`, be at most 160 characters, and match the response store slug. Invalid input, an invalid projection, a missing product, a transport error, or an origin mismatch fails closed with no fixture fallback.

## Read-only capability contract

`mode=preview` is fail-closed. The canonical new-theme Store and every descendant PDP must provide zero mutations for:

| Capability | Preview requirement |
| --- | --- |
| Follow | Disabled; no write |
| Favorite | Disabled; no write |
| Cart and quantity purchase | Disabled; no write |
| Buy now and checkout | Unreachable |
| Review | Disabled; no submission |
| Question | Disabled; no submission |
| Customer analytics mutation | No write |

The preview may use Seller authority only to resolve the Seller's canonical public slug. It must then load the Customer public projection and must not inject Seller identity, credentials, tenant data, or a private DTO into Customer presentation state.

## Media contract

- Card media consumes nullable normalized `card_framing { focal_x, focal_y, zoom }` on the canonical near-square card viewport.
- Framing is presentation-only and read-only in Customer and preview modes.
- PDP and full-screen gallery use ordered original media URLs.
- Card focal/zoom transforms must never leak into PDP or the image viewer.

## Required Seller R8 integration

`Müşteri önizlemesi` must expose exactly two explicit choices:

1. `Web mağaza görünümü` — retain the accepted canonical Customer Web preview.
2. `Uygulama mağaza görünümü` — host the canonical new-theme Customer Android presentation described here with `mode=preview`.

The implementation boundary may be an approved shared source/module or another owner-approved interactive host of this exact presentation contract. It must not duplicate visual components in Seller-owned code.

## Required Seller R8 verification

1. The chooser exposes exactly Web and App preview.
2. App preview uses this V4.13 new-theme authority and never reaches the old white/teal UI.
3. The canonical public slug is resolved server-side and the public response slug matches it.
4. Store → product → PDP → Back preserves `mode=preview` and the same store/product identity.
5. Follow, favorite, cart, checkout, order, review, question, and analytics mutation count is zero.
6. Store cards use normalized framing; PDP and viewer use originals with zero framing leakage.
7. No Seller-private, tenant, credential, payment, payout, audit, membership, or internal revision field appears in the preview.
8. Offline, 401, 403, 404, invalid slug, mismatched slug, invalid projection, and missing product fail closed.
9. Customer, Seller, and Admin package/auth/storage isolation remains intact.

Seller R8 implementation, commit, publication, and deployment remain a separate authorization.
