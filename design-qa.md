**Findings**

- No actionable P0, P1, or P2 visual mismatch remains.
- The compact discount ribbon now follows the supplied reference's small left-edge flag proportion, vertically centered copy, restrained notch, and minimal product-photo obstruction.
- The Admin editor preserves the supplied reference's direct-manipulation model (large source, visible mask, drag, +/−, reset, confirm) while intentionally replacing its circular crop with NovaStore's canonical 1:1 rounded product-card viewport.

**Open Questions**

- None blocking. The ribbon source is a partial card crop and the Admin source uses different photography and a circular mask, so the review is normalized to the binding component region and interaction concept rather than claiming unrelated full-screen pixel identity.

**Implementation Checklist**

- [x] Remove all multi-media text badges.
- [x] Keep 3–4 item indicators within a compact bottom-center dot group.
- [x] Match the owner ribbon's compact scale, notch direction, color family, and text centering.
- [x] Use the real card aspect ratio, radius, focal math, and zoom math in Admin.
- [x] Preserve original PDP and lightbox media with `object-fit: contain`.
- [x] Verify hover, scrub, autoplay, favorite, lightbox, and direct framing in Google Chrome.
- [x] Verify affected accessibility surfaces and browser console.

**Follow-up Polish**

- No required follow-up. Owner human acceptance remains the final product decision gate.

## Visual truth and implementation evidence

- Ribbon source visual truth: `C:\Users\kusay\AppData\Local\Temp\codex-clipboard-8eaadba7-e31c-4fcf-8052-aec47015f760.png` (483 × 208 px).
- Admin interaction source visual truth: `C:\Users\kusay\AppData\Local\Temp\codex-clipboard-3d09b11e-5cf5-4b2d-85d0-87b84ed60598.png` (568 × 489 px).
- Browser-rendered implementation contact sheet: `C:\Users\kusay\AppData\Local\Temp\novastore-pc1-main6y-r1-clean-owner-20260823T192823\MAIN6Y-R1-OWNER-CONTACT-SHEET.png`.
- Focused ribbon implementation: `C:\Users\kusay\AppData\Local\Temp\novastore-pc1-main6y-r1-clean-owner-20260823T192823\03-DISCOUNT-RIBBON-FINAL.png` (212 × 90 px).
- Focused Admin implementation: `C:\Users\kusay\AppData\Local\Temp\novastore-pc1-main6y-r1-clean-owner-20260823T192823\09-ADMIN-FRAMING-DIRECT-EDITOR.png` (818 × 940 px).
- Full-view evidence: `C:\Users\kusay\AppData\Local\Temp\novastore-pc1-main6y-r1-clean-owner-20260823T192823\MAIN6Y-R1-OWNER-CONTACT-SHEET.png`.
- Focused ribbon comparison: `C:\Users\kusay\AppData\Local\Temp\novastore-pc1-main6y-r1-clean-owner-20260823T192823\DISCOUNT-RIBBON-OWNER-COMPARISON.png` (1600 × 1100 px).
- Focused Admin comparison: `C:\Users\kusay\AppData\Local\Temp\novastore-pc1-main6y-r1-clean-owner-20260823T192823\ADMIN-FRAMING-OWNER-COMPARISON.png` (1600 × 1100 px).

## Viewport and normalization

- Customer capture: 1280 × 920 CSS px, device scale factor 1. The ribbon source and implementation were compared at the same focused top-of-media state and near-identical crop ratio (483:208 versus 212:90), then placed in equal comparison panels.
- Admin capture: 1440 × 1000 CSS px, device scale factor 1. The 410 × 410 CSS px crop viewport was verified at device scale factor 1. Source and implementation were placed in equal comparison panels with `object-fit: contain`; the source circle was treated only as interaction direction because the binding NovaStore geometry is 1:1 rounded-square.
- State: desktop, authenticated local Admin review, portrait source automatically classified as framing recommended, unzoomed initial crop; customer card default/hover/favorite states; PDP default/lightbox/zoom/next states.

## Required fidelity surfaces

- Fonts and typography: existing NovaStore Inter/system stack retained; ribbon reduced to `.6rem` with line-height 1 and flex centering; hierarchy and Turkish copy remain legible without wrapping.
- Spacing and layout rhythm: ribbon reduced to 24 px height with 7/10 px padding and a 5 px notch; four-image indicator group reduced from 43 px to approximately 32 px; Admin keeps a large 410 × 410 working viewport and clear control grouping.
- Colors and visual tokens: NovaStore orange, navy, neutral gray, warning, and active-red semantic tokens remain consistent; contrast and opacity passed affected Axe review with zero serious/critical findings.
- Image quality and asset fidelity: real product media and supplied screenshots were used; no placeholder, emoji, handcrafted SVG, CSS-drawn asset, or destructive media crop was introduced. Card framing is metadata-only; PDP and lightbox use the original URL.
- Copy and content: the rejected “N görsel · otomatik” copy is absent; Admin explicitly states that framing affects only the product card and that PDP shows the complete original.

## Comparison history

1. Initial combined comparison found two P2 density issues: the four-image indicator group measured 43 px, above the compact common-case target, and the ribbon occupied too much card width relative to the supplied partial-card reference.
2. Fix applied: indicator gap/padding/dots were reduced to a roughly 32 px four-item group; ribbon height, type, padding, notch, and shadow were reduced to 24 px / `.6rem` / 7–10 px / 5 px / restrained elevation.
3. Post-fix combined evidence: `DISCOUNT-RIBBON-OWNER-COMPARISON.png`, `ADMIN-FRAMING-OWNER-COMPARISON.png`, and `MAIN6Y-R1-OWNER-CONTACT-SHEET.png`. No actionable P0/P1/P2 difference remains.

## Runtime QA

- Primary interactions tested: hover dwell, 1650 ms autoplay, horizontal pointer scrub, autoplay restart, leave reset, favorite on/off motion, reduced motion, PDP full-original renderer, lightbox previous/next, keyboard navigation, zoom, bounded pan, reset, Escape/focus return, Admin auto-detection, direct drag, +/−, reset, save/reload, card/PDP isolation.
- Browser: real Google Chrome, local final artifacts.
- Console errors: 0.
- Page errors: 0.
- Axe serious/critical findings: 0.

final result: passed

# Main-6Y R2 Design QA

Compared the accepted R1 storefront, the supplied owner favorite-motion recording, and the final real-Chrome R2 evidence board.

- Favorite: compact neutral surface at rest; restrained red halo on confirmed add; solid red active surface with a white filled Lucide heart; symmetric remove transition; no stars, sparkles, or particles.
- Favorite placement: the 44 px target is positioned 4 px from the media top and 3 px from the media right; its visible 32 px surface sits 10 px from the top and 9 px from the right.
- PDP parity: product cards and the canonical product-detail gallery render the same shared favorite control, motion, pending guard, labeling, and authoritative-success behavior.
- Store metrics: one green backlight belongs to the enclosing metrics panel and remains outside it; individual cells do not emit or contain green light.
- Desktop motion: only the hovered metric lifts 3 px; the separate Açık status treatment lifts 2 px; both reset without layout shift.
- Mobile and reduced motion: the panel light is static, hover movement is suppressed, and the layout remains overflow-free at the required widths.
- Canonical parity: normal public store and Seller read-only preview use the same renderer; preview keeps favorite, cart, and follow mutations unavailable.

passed
