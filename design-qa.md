# V4.13 R8-R1 Product Card Price Design QA

## Comparison target

- Source visual truth: `C:\Users\kusay\AppData\Local\Temp\codex-clipboard-f5bc82e3-be86-4ed0-8c18-e251b9e521ce.png`
- Final Android implementation: `C:\Users\kusay\AppData\Local\Temp\novastore-android-customer-r8-r1-theme-rebind-20260824T135223\10-NEW-THEME-STORE-PRODUCT-CARDS.png`
- Same-input comparison: `C:\Users\kusay\AppData\Local\Temp\novastore-android-customer-r8-r1-theme-rebind-20260824T135223\OWNER-DESIRED-VS-FINAL-ANDROID-PRODUCT-CARD.png`
- State: Customer Android public store, product `2`, `Lee Cooper Wide Leg Jean · Portre`, current price `₺1.449,90`, old price `₺1.699,90`, canonical emulator `font_scale=1.0`.
- Source pixels: `188 × 316`; implementation pixels: `488 × 851`.
- Comparison normalization: both card crops rendered at `488 × 852` CSS px in a `1072 × 936` browser viewport at device scale factor `1`. The source was enlarged only for inspection; layout assertions use the unscaled Android WebView geometry.

## Full-view comparison evidence

The combined comparison shows the complete source and final product cards at the same rendered size. The original old price extends toward the cart recess. In the final card, the current price keeps the accepted hierarchy and the old price moves to a controlled second row inside the reserved text column. The live Android measurement leaves `10.196 CSS px` between the price column and the navy cart control.

## Focused region comparison evidence

The complete card is also the focused component region, so a second crop would duplicate the same evidence. Runtime geometry confirms:

- current price font: `17px`;
- old price font: `10px`;
- current price inside price column: pass;
- old price inside price column: pass;
- price column clears cart: pass;
- old price wraps below current price: pass;
- horizontal viewport overflow: `0px`.

## Required fidelity surfaces

- Fonts and typography: accepted card type hierarchy is unchanged for ordinary values. Only 8-or-more-digit current prices receive the compact step and 10-or-more-digit values receive the tight step. The old price remains legible and struck through; unrelated card typography is unchanged.
- Spacing and layout rhythm: the price column remains reserved left of the canonical cart recess. The old price wraps without shifting the cart, changing the recess shape, or increasing card width.
- Colors and visual tokens: navy current price, muted old price, orange rating/badge, white surface, and lilac recess tokens are unchanged.
- Image quality and asset fidelity: the real public Cloudinary product image loads without failure and retains its server-provided card framing; no replacement or generated asset was introduced.
- Copy and content: product name, seller, rating, review count, current price, and old price remain complete and readable.

## Comparison history

1. Initial finding — P2: the struck-through old price shared a non-wrapping row and could extend into the cart-safe area as values grew.
2. Fix: reserve the existing cart-safe column, allow only the old-price item to wrap naturally with the row, and add bounded current/old price density steps based on numeric length.
3. Post-fix evidence: regular, compact, and tight synthetic values all remained inside the price column; the real Android product card passed with `10.196 CSS px` cart clearance and no clipping or overflow.

## Findings

No actionable P0, P1, or P2 visual differences remain for the requested product-card price correction.

## Follow-up polish

No P3 polish is needed for this correction.

final result: passed
