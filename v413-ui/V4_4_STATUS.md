# NovaStore Android Customer Visual Calibration V4.4

Status: `HUMAN_APPROVAL_PENDING`

V4 and V4.2 remain rejected visual baselines. V4.4 is the current editable owner-feedback revision and must not be presented as human-approved, production-ready, or authorized for the 112-screen expansion until the owner approves the open browser render.

## What changed in V4.4

- Rebuilt the product-media seam as one responsive Bézier wave with its trough at about `64%`, a visibly raised right edge, and no symmetric flat center.
- Rebuilt the lower white body as a responsive Bézier surface: it holds a shoulder, wraps down the cart's left side, and exposes a distinct light gray/lilac recess.
- Removed the cart's white halo and separate plus badge. The plus now belongs to the cart glyph itself.
- Kept the cart orb navy during confirmation; only the compound cart-plus glyph becomes a green check for about 950 ms.
- Removed default shipping, free-shipping, and generic shipping-information copy from product cards, filters, and PDP. A future calculation engine may conditionally supply real fulfillment results.
- Made description and specifications visible on first render. Long copy fades and expands through `Devamını gör`.
- Added working verified-purchase review, product-question, and recommended-product open/favorite/cart flows in local mock state.
- Added working address-book and notification-center views from the home actions, with prototype-session persistence.
- Moved every visible route and subview top bar outside `MobileScroll`, so the bar remains fixed while its screen content scrolls.
- Extended the focused regression suites to cover the revised behavior and 320–480 px edge widths.

## Verification snapshot

- Protected mobile runtime integrity: passed, 28 files.
- TypeScript: passed.
- Production build: passed.
- Sites worker tests: 4 passed, 0 failed.
- Playwright discovery: 30 focused tests found across two suites.
- Playwright browser execution: infrastructure-blocked before assertions because the Chromium executable is absent; this is not recorded as a behavioral pass or fail.
- Cloud Chrome width matrix: 320, 360, 393, 411, 427, and 480 px; no app-level horizontal overflow or price/cart overlap.
- Product-card confirmation: navy orb stays `rgb(6, 30, 69)`; only the check is green `rgb(53, 210, 117)`; no white halo.
- Product detail, address book, and notification center: edge-checked at 320 and 480 px with no horizontal overflow.
- Fixed headers: live scroll checks show `0 px` Y drift across the tested roots and subviews; the automated suite covers all twelve CAL roots and eleven subviews.
- Application-origin browser console errors: 0. Browser-extension metadata errors are external to the prototype and excluded.

## Backend boundary

Favorite, cart, review, question, address, notification, search-history, and checkout behavior is local prototype state. Account/database persistence, review eligibility services, seller/admin APIs, fulfillment-policy calculation, and production payment behavior remain later backend/integration work.

## Human gate

Internal design QA is recorded in `design-qa.md`, but acceptance remains `HUMAN_APPROVAL_PENDING`. Browser checks, screenshots, and geometry receipts do not self-approve the design.
