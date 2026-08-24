# Seller R8-R2 — New Customer Android App Preview Handoff

Status: `READY_FOR_SEPARATE_SELLER_R8_AUTHORIZATION`

## Superseded authority

- `SELLER-R8-R1-NEW-CUSTOMER-ANDROID-APP-PREVIEW-HANDOFF.md` is `SUPERSEDED_BY_R8_R2_MEDIA_FIX`.
- `SELLER-R8-CUSTOMER-ANDROID-APP-PREVIEW-HANDOFF.md` from the rejected `android-customer-theme-integration` worktree remains `SUPERSEDED_DO_NOT_CONSUME`.
- Neither the old Compose/white-teal Customer presentation nor the pre-media-fix R8-R1 implementation identity may be consumed by Seller R8.

## Canonical R8-R2 new-theme authority

- Customer branch: `codex/android-customer-r8-r2-media-gallery-fix`
- Presentation implementation commit: `72e83aa560ce44ac35dbe72c9abde6a77e4acc1b`
- Presentation implementation tree: `41327e91b936132958252eb452dd989694130801`
- Runtime: authoritative V4.13 React/Vite application inside Capacitor Android.
- Android package: `com.novastore.app.v413preview`
- Canonical store presentation: `v413-ui/src/Prototype.tsx` → `StorefrontScreen`
- Canonical product card: `v413-ui/src/Prototype.tsx` → `ProductCard`
- Canonical product detail and viewer: `v413-ui/src/Prototype.tsx` → `ProductDetailScreen`
- Customer public adapter: `v413-ui/src/adapters/publicStoreContract.ts` and `publicStoreClient.ts`
- Android public bridge: `v413-ui/android/app/src/main/java/com/novastore/app/NovaPublicStorePlugin.java`
- Typed route authority: `v413-ui/src/native/routeContract.ts`
- Public API: `GET /api/public/stores/{storeSlug}`

Any later closure-only commit may add handoff or evidence documents without replacing the immutable presentation implementation identity above.

## Presentation contract

Seller App Preview must consume the same new navy/orange V4.13 Store, shared ProductCard, PDP, full-screen viewer, top bar, typography, wave-card geometry, cart treatment, and rounded/glass bottom-navigation language used by the active Customer APK. A Seller-owned visual clone, screenshot, responsive Customer Web page relabeled as an app, old Compose screen, or fixture-only mock is prohibited.

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

`mode=preview` is fail-closed and permits zero customer mutations:

| Capability | Preview requirement |
| --- | --- |
| Follow | Disabled; no write |
| Favorite | Disabled; no write |
| Cart, quantity, buy now, checkout, and order | Disabled or unreachable |
| Review and question | Disabled; no submission |
| Customer analytics mutation | No write |

Seller authority may resolve only the Seller's canonical public slug. The preview must then load the Customer public projection and must not inject Seller identity, credentials, tenant data, or a private DTO into Customer presentation state.

## R8-R2 media contract

- Each paged card, PDP, and full-screen media item owns exactly one carousel viewport; settled adjacent-media bleed is zero.
- Card media may consume normalized nullable `card_framing { focal_x, focal_y, zoom }`, isolated and clipped inside that card slide only.
- PDP, thumbnails, and full-screen viewer preserve the same ordered original-media identity. PDP and viewer default to full-source `contain` with no card-framing transform.
- At fit/1×, touch swipe advances exactly one previous or next media item. Above 1×, the zoomed image owns pan and the carousel is locked.
- Reset and media changes clear stale zoom/pan and restore the selected media's centered fit baseline.
- Android/coarse-pointer presentation has no desktop hover autoplay or pointer-position scrub mechanism.

## Required Seller R8 integration

`Müşteri önizlemesi` must expose exactly two explicit choices:

1. `Web mağaza görünümü` — retain the accepted canonical Customer Web preview.
2. `Uygulama mağaza görünümü` — host this canonical R8-R2 V4.13 Customer Android presentation with `mode=preview`.

The implementation boundary may be an approved shared source/module or another owner-approved interactive host of this exact presentation contract. It must not duplicate visual components in Seller-owned code.

## Required Seller R8 verification

1. The chooser exposes exactly Web and App preview.
2. App preview uses this R8-R2 V4.13 authority and never reaches the old white/teal UI.
3. Canonical public slug resolution is server-side and response slug identity matches.
4. Store → product → PDP → viewer → Back preserves `mode=preview`, store identity, product identity, selected media, and ordered original-media identity.
5. Follow, favorite, cart, checkout, order, review, question, and analytics mutation count is zero.
6. Card framing remains card-only; PDP/viewer use originals with `contain`, clean discrete paging, and zero adjacent bleed at rest.
7. No Seller-private, tenant, credential, payment, payout, audit, membership, or internal revision field appears in preview.
8. Offline, 401, 403, 404, invalid slug, mismatched slug, invalid projection, and missing product fail closed.
9. Customer, Seller, and Admin package/auth/storage isolation remains intact.

Seller R8 implementation, publication, deployment, and owner acceptance remain a separate authorization.
