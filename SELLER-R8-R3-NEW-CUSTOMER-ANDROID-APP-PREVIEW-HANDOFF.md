# Seller R8-R3 — New Customer Android App Preview Handoff

Status: `READY_FOR_SEPARATE_SELLER_R8_AUTHORIZATION`

Seller R8 implementation has not started. Publication, deployment, and owner
acceptance remain a separate authorization.

## Superseded authority

- `SELLER-R8-R2-NEW-CUSTOMER-ANDROID-APP-PREVIEW-HANDOFF.md` is
  `SUPERSEDED_BY_R8_R3_WRAPAROUND`.
- `SELLER-R8-R1-NEW-CUSTOMER-ANDROID-APP-PREVIEW-HANDOFF.md` remains
  `SUPERSEDED_BY_R8_R2_MEDIA_FIX`.
- `SELLER-R8-CUSTOMER-ANDROID-APP-PREVIEW-HANDOFF.md` from the rejected
  `android-customer-theme-integration` worktree remains
  `SUPERSEDED_DO_NOT_CONSUME`.
- The old Compose/white-teal Customer presentation and every pre-R8-R3
  implementation identity are prohibited for Seller App Preview.

## Canonical R8-R3 new-theme authority

- Customer branch: `codex/android-customer-r8-r3-carousel-wrap`
- Presentation implementation commit:
  `ad15931b1a7889316a9f13c299cabfa463036705`
- Presentation implementation tree:
  `e4c6860070bec2807c55d2e08d4bd1472bcad9df`
- Runtime: authoritative V4.13 React/Vite application inside Capacitor Android.
- Android package: `com.novastore.app.v413preview`
- Canonical store presentation: `v413-ui/src/Prototype.tsx` →
  `StorefrontScreen`
- Canonical product card: `v413-ui/src/Prototype.tsx` → `ProductCard`
- Canonical product detail and viewer: `v413-ui/src/Prototype.tsx` →
  `ProductDetailScreen`
- Shared carousel authority: `v413-ui/src/mobile/Carousel.tsx`
- Customer public adapter: `v413-ui/src/adapters/publicStoreContract.ts` and
  `publicStoreClient.ts`
- Android public bridge:
  `v413-ui/android/app/src/main/java/com/novastore/app/NovaPublicStorePlugin.java`
- Typed route authority: `v413-ui/src/native/routeContract.ts`
- Public API: `GET /api/public/stores/{storeSlug}`

The implementation commit and tree above are the immutable presentation
identity. A later closure-only commit may contain this handoff document without
changing that presentation identity.

## Presentation contract

Seller App Preview must consume the same new navy/orange V4.13 Store, shared
ProductCard, PDP, full-screen viewer, top bar, typography, wave-card geometry,
cart treatment, and rounded/glass bottom-navigation language used by the active
Customer APK. A Seller-owned visual clone, screenshot, responsive Customer Web
page relabeled as an app, old Compose screen, or fixture-only mock is
prohibited.

The route context is:

```text
CAL-04 + view=store + storeSlug=<canonical-public-slug> + mode=preview
```

Store → product navigation must preserve:

```text
CAL-06 + storeSlug=<same-slug> + productId=<public-product-id> + mode=preview
```

The public slug must match `^[a-z0-9]+(?:-[a-z0-9]+)*$`, be at most 160
characters, and match the response store slug. Invalid input, an invalid
projection, a missing product, a transport error, or an origin mismatch fails
closed with no fixture fallback.

## Read-only capability contract

`mode=preview` is fail-closed and permits zero customer mutations:

| Capability | Preview requirement |
| --- | --- |
| Follow | Disabled; no write |
| Favorite | Disabled; no write |
| Cart, quantity, buy now, checkout, and order | Disabled or unreachable |
| Review and question | Disabled; no submission |
| Customer analytics mutation | No write |

Seller authority may resolve only the Seller's canonical public slug. The
preview must then load the Customer public projection and must not inject Seller
identity, credentials, tenant data, or a private DTO into Customer presentation
state.

## R8-R3 circular media contract

- Multi-media ProductCard, PDP, and full-screen viewer navigation is circular.
  The last media advances to the first and the first media moves back to the
  last with one valid gesture.
- Public state remains one canonical logical index from `0` through
  `mediaCount - 1`; counter, dots, and any applicable selection indicator must
  resolve to that logical index.
- Visible previous/next controls remain enabled at both boundaries. Viewer
  `ArrowRight` and `ArrowLeft` use the same circular contract.
- Every settled state owns exactly one full carousel viewport. Endpoint
  rubber-band, snap-back, partial settled slides, mixed media, and adjacent-media
  bleed are prohibited.
- Any physical edge clones used by the shared Customer carousel are
  implementation-only, inert, hidden from accessibility, and normalized back
  to the ordered original media without changing logical identity.
- A one-media product has no fake looping motion. Two-media products alternate
  stably in both directions.
- Card media may consume normalized nullable
  `card_framing { focal_x, focal_y, zoom }`, isolated and clipped inside that
  card slide only.
- PDP and full-screen viewer preserve ordered original media and default to
  full-source `contain` without a card-framing transform.
- At fit/1×, a valid horizontal swipe owns media navigation. Above 1×, the
  zoomed image owns pan and carousel drag stays locked.
- Media changes reset zoom/pan to the centered fit baseline.
- Android/coarse-pointer presentation has no desktop hover autoplay or
  pointer-position scrub mechanism.

## Required Seller R8 integration

`Müşteri önizlemesi` must expose exactly two explicit choices:

1. `Web mağaza görünümü` — retain the accepted canonical Customer Web preview.
2. `Uygulama mağaza görünümü` — host this canonical R8-R3 V4.13 Customer
   Android presentation with `mode=preview`.

The implementation boundary may be an approved shared source/module or another
owner-approved interactive host of this exact presentation contract. It must
not duplicate visual components in Seller-owned code.

## Required Seller R8 verification

1. The chooser exposes exactly Web and App preview.
2. App preview uses this R8-R3 V4.13 authority and never reaches the old
   white/teal UI.
3. Canonical public slug resolution is server-side and response slug identity
   matches.
4. Store → product → PDP → viewer → Back preserves `mode=preview`, store
   identity, product identity, selected logical media, and ordered original
   media identity.
5. Card, PDP, and viewer wrap last → first and first → last; arrows, viewer
   keyboard controls, counter, and dots stay synchronized.
6. Every settled media state shows one complete slide with zero partial image,
   mixed media, adjacent bleed, endpoint rubber-band, or snap-back.
7. Follow, favorite, cart, checkout, order, review, question, and analytics
   mutation count is zero.
8. Card framing remains card-only; PDP/viewer use originals with `contain` and
   media changes reset viewer zoom/pan.
9. No Seller-private, tenant, credential, payment, payout, audit, membership,
   or internal revision field appears in preview.
10. Offline, 401, 403, 404, invalid slug, mismatched slug, invalid projection,
    and missing product fail closed.
11. Customer, Seller, and Admin package/auth/storage isolation remains intact.

Seller R8 must not start until the Customer owner manually confirms the final
R8-R3 wraparound behavior.
