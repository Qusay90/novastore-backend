# Stocky Seller Web — Dual Store Preview Requirement

Status: future handoff only. This Customer Android lane does not modify or deploy Stocky.

Stocky Seller Web must eventually expose:

```text
Müşteri önizlemesi
├─ Web mağaza görünümü
└─ Uygulama mağaza görünümü
```

## Web mağaza görünümü

- Use the canonical Customer Web public-store surface and canonical public slug.
- Preserve the accepted read-only preview and external-navigation restrictions.
- Do not replace it with a Stocky-authored storefront mock.

## Uygulama mağaza görünümü

- Authority is the `NEW CUSTOMER ANDROID THEME` and its canonical new Store presentation.
- Consume `SELLER-R8-R2-NEW-CUSTOMER-ANDROID-APP-PREVIEW-HANDOFF.md` at presentation implementation commit `72e83aa560ce44ac35dbe72c9abde6a77e4acc1b` / tree `41327e91b936132958252eb452dd989694130801`.
- `SELLER-R8-R1-NEW-CUSTOMER-ANDROID-APP-PREVIEW-HANDOFF.md` is `SUPERSEDED_BY_R8_R2_MEDIA_FIX` and its old implementation identity must not be consumed.
- The old R8 Compose/white-teal Android UI and `SELLER-R8-CUSTOMER-ANDROID-APP-PREVIEW-HANDOFF.md` are `SUPERSEDED_DO_NOT_CONSUME`.
- Preserve the new V4.13 navy/orange visual family, wave ProductCard, canonical Store/PDP, and rounded/glass navigation treatment.
- Use normalized `card_framing` only on individually clipped card slides; use full original `contain` media with clean discrete paging and zero settled adjacent bleed on PDP and viewer.
- Preserve `mode=preview` through Store → product → PDP → Back.

The preferred implementation is an approved interactive host of the shared canonical Customer Android presentation. If a Web host cannot execute that presentation directly, any alternative requires explicit owner approval and must remain deterministically derived from the same public DTO, route identity, visual source, card geometry, framing tuple, original-media rule, and read-only capability matrix.

A screenshot, responsive Customer Web page relabeled as App preview, static fixture, old Android surface, or separately hand-written Stocky imitation is not acceptable.

Both modes use the server-resolved canonical public store slug. App preview must produce zero follow, favorite, cart, checkout, order, review, question, or customer-analytics mutations; receive no Seller-private DTO fields; and preserve Customer/Seller/Admin auth and storage isolation.

Implementation, deployment, and Stocky repository changes require a separate authorized lane after Seller R8 publishes an approved integration boundary for the new Customer Android presentation.
