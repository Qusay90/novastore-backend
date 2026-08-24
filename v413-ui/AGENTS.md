# Mobile Prototype Agent Guide

## Prototype Instructions

In ChatGPT Work Mode, run `sites-preview start "$PWD"`, open `http://terminal.local:4173/` in the cloud browser, and verify the rendered app and its primary interactions. Keep that preview open and tell the user to inspect it in the cloud browser; do not present the local URL as a user-facing chat link. In Codex Desktop, run the local server yourself, open the preview in the in-app browser, and provide the clickable local URL. Do not deploy to Sites unless the user explicitly asks to share, publish, or deploy. Do not give the user server-start instructions when you can run it.

Before planning or implementing any mobile-app change, read this `AGENTS.md` in full. It is the source of truth for the template's runtime and component guidance.

Before making substantial visual changes, use the Product Design plugin's `get-context` skill when the visual source is unclear or no longer matches the current goal. When the user gives durable prototype-specific design feedback, preferences, or decisions, record them in `AGENTS.md`.

When implementing from a selected generated mock, treat that image as the source of truth for layout, component anatomy, density, spacing, color, typography, visible content, and hierarchy.

## Editing Boundary

- Build app-specific UI in `src/Prototype.tsx` and `src/prototype.css`.
- Treat `src/App.tsx`, `src/main.tsx`, `src/styles.css`, `src/mobile/`, `public/assets/iphone/`, `public/assets/android/`, `public/assets/status/`, `vite.config.ts`, `worker/index.js`, and `scripts/prepare-sites-build.mjs` as protected runtime files. Do not edit, replace, remove, or recreate them unless the user explicitly asks to change the mobile runtime itself. For an explicit runtime change, update the affected lock hashes only after verifying the new runtime behavior.
- Run `npm run check:runtime` before preview or handoff. If it fails, restore the protected runtime instead of weakening or bypassing the check.
- `npm run build` preserves the mobile runtime and prepares the static Cloudflare Worker output required by Sites. Before a Sites handoff, confirm `dist/client/index.html`, `dist/server/index.js`, `dist/.openai/hosting.json`, and source `.openai/hosting.json` exist, then run `npm run test:sites`. Do not replace this project with a Vinext starter.

## Runtime Contract

- Preserve the mobile device runtime unless the user's task explicitly asks otherwise. Do not replace it with a standalone page. Visual fidelity applies to app-owned content inside the device screen, not to template-owned device chrome.
- Keep `App` composed around `PhoneFrame` -> `KeyboardProvider`, with `StatusBar`, app content, `HomeIndicator`, and `KeyboardDock` mounted inside the phone frame. `StatusBar` and the iOS home indicator are overlaid device chrome. When the Android keyboard is closed, the app viewport reserves the protected navigation-bar region instead of painting behind it. When the Android keyboard is open, preserve the current full-screen keyboard layout: its asset includes the IME navigation strip and the separate black navigation bar is hidden. iOS screens continue to paint behind the home-indicator area and own their safe-area content padding.
- Preserve the `iPhone` / `Pixel 10` device picker and both calibrated device presets. The Pixel screen is `427 x 952`; its `32 x 32` camera circle and `public/assets/android/navigation-bar.svg` bottom navigation bar are protected device chrome, not app content.
- Preserve the device picker's intentionally lightweight Codex styling in the top-right corner: its trigger wrapper is borderless and transparent, its trigger sizes to content, and its right-aligned menu uses the compact 3px inset plus the specified hairline and elevation shadow layers. Keep the prototype root and default app screen white.
- Preserve `StatusBar` as live device chrome, including its platform-specific typography, source status-icon assets, and spacing. Pixel 10 uses Roboto, Android indicators, and 32px top, left, and right padding. iPhone uses its iOS indicators, system typography, and calibrated spacing. Do not hardcode screenshot times like `9:41` into the status bar, replace its real-time clock, or move status bar content into app markup unless the user explicitly asks for a fixed/mock device time.
- `PhoneFrame` owns the calibrated device frame, screen portal, device picker, camera cutout, and custom cursor. Keep device assets in `public/assets/iphone/` and `public/assets/android/`; if an asset fails to load, repair the asset path or restore the asset instead of removing the frame, keyboard, or image render.
- Use `MobileScroll` directly for simple single-screen prototypes. Use `FlowStack` for conventional multi-screen flows whose routes can own their fixed header and footer; when using it, define each route as a `FlowScreen`: `{ id, header?, headerHeight?, footer?, footerHeight?, render }`, and use `flow.push(screen)`, `flow.pop()`, and `flow.replace(screen)` from `FlowStack` render callbacks or `useFlow()` instead of introducing another router.
- Use `Carousel` for a carousel, horizontal rail, swipeable cards, image or media strip, horizontally scrollable cards, chip rail, or other horizontal collection.
- For a layered app shell—such as a persistent composer, independently presented sheet, pushed/peek sidebar, or app-wide transition—compose directly in `Prototype.tsx` rather than forcing it through `FlowStack`. Keep app-owned fixed chrome as sibling layers outside `MobileScroll`.
- When using `FlowScreen`, put route-owned fixed headers or footers in `FlowScreen.header` or `FlowScreen.footer`. Set `headerHeight` to the visible app-toolbar height; `FlowStack` adds the device's top safe-area/status-bar inset automatically. Do not include `StatusBar` or its height in the header. Set `footerHeight` to the full app-footer height. `FlowScreen.footer` is an overlay, not reserved layout space; screens using it must add their own bottom content padding such as `padding-bottom: calc(var(--flow-footer-height) + var(--mobile-safe-area-height) + 24px)` so final content can scroll above the footer while still painting behind it.
- Render only scrollable content inside `MobileScroll`; it is for content that should move with scroll and rubber-band overscroll. Keep app-owned headers, nav bars, tabs, composers, and overlays outside it. This keeps scroll physics, safe areas, keyboard insets, scrollbars, and drag click suppression active without letting content paint under fixed chrome.
- Buttons, links, cards, and images inside `MobileScroll` should still allow drag scrolling when the pointer moves beyond tap slop. Use `data-scroll-drag="ignore"` only for rare controls that must own the drag gesture themselves.
- Do not add `var(--keyboard-height)` to ordinary screen/content padding inside `MobileScroll`; the scroll viewport already shrinks above the simulated keyboard. For custom fixed composers, search bars, or toast chrome, use `useKeyboardInsets().bottomInset`. It is relative to the app viewport: Android returns `0` while the closed-keyboard viewport already reserves navigation, then returns the keyboard height while open; iOS continues to clear the home indicator while closed and ride directly above the keyboard while open. Do not pin custom bottom chrome to `bottom: 0` or only `keyboardHeight`.
- Use `KeyboardInput`, `KeyboardTextarea`, or `MobileTextField` for every text-entry control. A raw `input` or `textarea` disconnects focus, keyboard animation, safe-area insets, and attached surfaces.
- Use `BottomSheet` for phone-scoped sheets. Its props are `open`, `onOpenChange`, `title`, optional `description`, optional `snap`, and `children`; it renders through the phone screen portal and dismisses the keyboard before opening.

## Horizontal Carousels

- Use `Carousel` for horizontally draggable cards, images, media, chips, or other horizontal collections. Do not recreate these with `overflow-x`, custom pointer handlers, or a generic div.
- `Carousel` can be nested directly inside `MobileScroll`. It owns horizontal gestures and automatically yields vertical gestures to the parent.
- Never put `data-scroll-drag="ignore"` on or around a `Carousel`; doing so prevents vertical parent scrolling when a gesture begins inside it.
- Do not add CSS scroll snapping to `Carousel`; its runtime owns momentum and release motion.
- Use `data-scroll-drag="ignore"` only when a control must prevent parent scrolling in every drag direction.

See `src/mobile/COMPONENTS.md` for the full component and gesture contract.

## V4 Owner-Rejection Contract

- V2 and V3 are human-rejected visual baselines. V4 remains human-pending until the owner reviews the final V4 package.
- Keep one 411.428571 × 914.285714 app-owned logical canvas for framed phone preview and capture. Device bezels, status UI, and review controls are decorative layers and must not alter that canvas.
- Keep the calibration switcher outside the app viewport and hide it in capture evidence.
- The customer bottom navigation is one smooth-union SVG surface. Do not reintroduce a clipped HTML/backdrop-filter rectangle behind it.
- CAL-06 uses SRC-13 geometry and information architecture with the NovaStore navy/orange/warm-neutral palette, one quantity control, `Sepete Ekle` plus `Hemen Al`, and no bottom navigation.
- Product-card authority is SRC-09 for detailed hierarchy plus SRC-12 for compact list proportions. Do not use either source as PDP authority.
- Tablet screens must be task-adaptive compositions, not a small phone column surrounded by empty canvas.
- Do not mark a visual difference closed merely because a build, screenshot, or containment test passes. Closure requires the visible difference to be absent in the same-state comparison.

## V4.1 Human-Recovery Contract

- V4 and V4.2 were human-rejected. Preserve them as evidence; the V4.1 package directory is the editable successor, and V4.4 is its current owner-feedback revision.
- Tablet acceptance is content-driven: do not fill the canvas by stretching cards, CTA surfaces, summaries, or empty grid rows.
- CAL-04 must retain the compact SRC-12 proportions while carrying the SRC-09 information hierarchy; a loose outer bbox score is not visual parity.
- CAL-06 may start with details expanded on tablet to make the two-column task usable, but phone keeps the SRC-13 collapsed-row composition.
- Machine receipts may describe executed checks only. They must never hard-code visible-defect counts or a human visual PASS.

## V4.3 Owner-Feedback Contract

The owner's August 11, 2026 feedback supersedes conflicting V4/V4.1 bullets for the editable successor:

- Keep the 411.428571 px capture as a comparison reference, but make app-owned content fluid across 320–480 px phone widths. Cards, type, headers, navigation, search, and sticky actions must reflow without horizontal overflow, clipping, or off-center controls.
- Home and product-detail headers are fixed app chrome outside `MobileScroll`; their app-relative Y position may not move when content scrolls.
- Use a real map-pin icon for location and address semantics. Do not use a sewing-pin glyph. Category icons must match their meaning and the source family.
- Compute the selected bottom-navigation bubble from the selected button's exact equal-column center. Do not add endpoint optical offsets or widen the selected column.
- Favorite state is shared across prototype routes and uses a visibly filled heart. Frontend session persistence is required; backend/account persistence is deferred.
- Add-to-cart confirmation is transient (about 900 ms) and returns to the resting navy control. The visible control stays navy throughout; only the compound cart/plus glyph is replaced by one centered green check. Do not add a white halo, white badge disc, visible toast, or “Sepete eklendi” label. The cart count remains incremented.
- Product photographs are independent raw image assets. Wave masks, badges, favorite controls, cart controls, and the white cart cradle/skirt are rendered by components and CSS, never pasted from a source-screen crop.
- Product-card media uses one shallow, smooth downward arc with no repeated peaks. The lower white information surface makes the large curved cart cutout; the compact cart control and its white cradle may not cover the current or old price.
- The product-detail gallery uses real product photos, renders populated seller/admin fields from optional data, omits uncalculated dispatch/free-delivery claims, includes recommendations, and exposes both `Sepete Ekle` and `Hemen Al`.
- The home search action opens a distinct search view with an expanding full-width field, recent searches, popular searches, and results. Use the protected keyboard-aware input component.
- Prototype interactions use realistic local mock state only. Do not imply backend persistence or connect to production services during visual calibration.

## V4.4 Owner-Feedback Contract

The owner's later August 11, 2026 decisions supersede conflicting V4.3 card and PDP behavior:

- The product-card media seam is one shallow asymmetric wave whose trough sits right of center, matching the supplied source crop. It must remain visibly curved without becoming a large multi-peak wave.
- The final wave is a continuous responsive Bézier surface, not a symmetric bottom-radius simulation: its trough sits at about 64% and its right endpoint is visibly higher than the left.
- The lower white information body forms a shoulder, wraps down the cart action's left side, and reaches the bottom near 60%; a diagonal rounded corner is not sufficient. It exposes a distinct light gray/lilac recess and the navy cart control has no white ring.
- Product cards, PLP filters, and the PDP render no default shipping/free-shipping promise or generic shipping-information label. Such copy may appear only when a future calculation engine returns a real result.
- Product description and specifications are visible without opening an accordion. Long description copy fades after a short preview and expands through a `Devamını gör` control.
- A review composer is available only to an authenticated mock user with a verified purchase for that product. Product-question submission and recommended-product open/favorite/cart actions must work in local prototype state.
- Home location and notification actions open working address-book and notification views. Added addresses, read state, and notification preferences persist for the current prototype session.
- Every visible route and subview top bar is app-fixed outside `MobileScroll`; scrolling screen content may not change the bar's app-relative Y position.

## V4.5 Owner-Feedback Contract

The owner's annotated August 11, 2026 comparison supersedes the conflicting V4.4 cart-cutout and plus-badge details:

- Treat `../upload/c593ed12-7b65-4eb1-a418-c40176f01239.png` as the focused authority for the compact product-card cart recess. The black-marked left card is the target; the red-marked right card is the rejected V4.4 geometry.
- Keep the cart touch target at 48 px, move the visible navy cart control slightly closer to the bottom-right corner, and keep the price rectangle disjoint.
- The light gray/lilac recess must closely wrap the cart control's upper-left quadrant. Its visible clearance above and left of the navy control is equal by construction; do not start the shoulder high above the control or let the recess consume a broad third of the card.
- The resting cart glyph uses the source-reference compound treatment: a white cart plus a small white circular badge carrying a navy `+` at the cart's upper-right. This latest decision supersedes the earlier prohibition on a separate white plus badge disc. Confirmation still replaces the whole compound glyph with one centered green check while the navy control stays unchanged.
- The media seam remains one asymmetric wave with its trough near 65.4%. Match the measured two-cubic source fit: keep the curve low through most of the right segment before its late rise, and retain the tiny early lift on the left so it reads as elastic rather than angled. Keep the right endpoint raised and avoid multiple peaks.

## V4.6 Owner-Feedback Contract

The owner's subsequent August 11, 2026 review adds these requirements without relaxing the V4.5 cart placement and glyph contract:

- The compact-card information stack follows the focused reference order and rhythm: bestseller, store, product title, rating, divider, and price. It must retain responsive top and side padding; the media wave may never overlap the first label, and text may not sit flush against a card edge.
- Do not use an undefined wave-depth token for copy padding. The first information row starts below the deepest point of the media seam at every 320–480 px phone width.
- The white body must enter the cart recess gradually from the right edge and leave it gradually along the bottom edge. Both joins use tangent-continuous curves rather than a visible corner, diagonal cut, or sudden protrusion.
- Add a soft shadow below the white recess boundary so the surface reads like a lifted or peeled cover over the light gray/lilac recess. Keep the shadow subordinate to the text and navy cart control.
- Preserve the V4.5 compound cart-plus glyph and transient green-check behavior, and do not reintroduce shipping or free-shipping copy.

## V4.7 Owner-Feedback Contract

The owner's latest August 11, 2026 review adds these requirements without relaxing the V4.5/V4.6 wave, recess-join, shipping, or transient-confirmation contracts:

- The white product-information surface must read as physically lifted above the light gray/lilac cart recess. The shadow belongs only below the short slanted white edge that approaches the cart from the left; it must not ring the upper arc, right side, or whole recess. Use a narrow contact line and a short downward falloff, as if the surface were lit from above.
- Increase the visible clearance between the navy cart control and its recess to roughly twice the earlier V4.6 clearance while preserving equal top and left spacing and the cart's bottom-right placement.
- The primary `pulse-anc` product card exposes its three independent product photographs through the protected mobile `Carousel`, allowing horizontal inspection without opening the PDP. Do not add custom pointer gesture code, CSS scroll snapping, or `data-scroll-drag="ignore"`.
- Favorite add/remove keeps the shared local favorite state and gains a short, polished heart animation. The visible favorite control is smaller than V4.6 while retaining its 48 px hit envelope and a reduced-motion fallback.
- Match the reference card's visual density: enlarge the media share of the card, reduce and lighten the bestseller/store/title treatment, reduce the discount badge, and reproduce its subtly clipped lower-left and upper-right silhouette.
- Keep the navy cart surface and 48 px hit target. The resting cart and plus badge must be thinner and smaller than V4.6, with the plus seated at the cart glyph's true upper-right corner. On confirmation, preserve both glyph layers long enough for a visible 620 ms transformation: the cart folds inward, the check is revealed from that collapsing geometry, and only then becomes green. Hold the centered green check within the roughly 950 ms confirmation interval before restoring the cart.

## V4.8 Owner-Feedback Contract

The owner's subsequent August 11, 2026 navigation feedback adds these requirements without relaxing any V4.7 product-card requirement:

- A newly entered route or subview starts at the top on its first painted frame. Scroll position, rubber-band state, keyboard-induced device-shell offset, momentum, and spring state may not leak from the previous screen.
- Selecting a different bottom-navigation destination is normal navigation and starts that destination at the top. Selecting the already-active root tab again does not add a history entry; it runs the same refresh pipeline as pull-to-refresh and returns the current root screen to the top. Selecting the active tab while in one of its subviews returns to the tab root and is not treated as a reselect refresh.
- Pull-to-refresh is eligible only when the gesture begins at the top of the current `MobileScroll`. A determinate orange ring and reload arrow fill as the pull progresses; releasing below the 56 px logical threshold cancels, retracting after arming disarms, and releasing at or above the threshold runs `refreshing → complete → idle` feedback.
- The refresh gesture must work on both long and non-scrollable screens. Short content follows the pull through an app-owned fallback and captures the pointer only after a vertical drag begins, so taps and horizontal carousels remain usable.
- Route/refresh resets may remount the screen scroll surface to cancel protected-runtime momentum, but shared commerce/session state stays above that boundary. Checkout root/address subviews preserve their local in-progress state.
- Removing a product from the Favorites list keeps the card mounted for the 380 ms heart-removal animation, then removes it. Adding remains immediate and uses the existing shared favorite state.
- The V4.7 recess shadow remains confined to the short slanted white edge left of the cart; it must not become a ring around the recess. The three-photo card gallery, larger media share, compact typography, and visible cart-to-check morph all remain acceptance requirements.

## V4.9 Owner-Feedback Contract

The owner's later August 11, 2026 review supersedes conflicting V4.8 refresh and category details without relaxing any accumulated product-card, navigation, or local-state requirement:

- Restore a tangent-smooth, visibly circular wrap around the cart control. The white surface must not develop a flat spot or kink where its upper arc meets the short slanted lower edge.
- The lifted-surface shadow belongs only immediately below that short slanted white edge on the cart's left. It must follow the edge, remain narrow and soft, and must not become a polygonal patch, a ring around the cart recess, or a shadow on the upper/right arc.
- Pull-to-refresh has no separate determinate ring around the reload arrow. The arrow glyph itself travels one full circular revolution from the top as pull progress increases, returns to its starting point at the armed threshold, then spins during refresh. Releasing below threshold still cancels.
- Category selection uses one persistent visible orange indicator on the currently selected category. Focus styling may not suppress it or briefly reveal it on the previous category.
- Every main category owns its corresponding right-side subcategory title, imagery, labels, and actions. Changing the left selection updates the right panel immediately; opening a subcategory carries that category context into the product-list heading.
- Complete visible prototype controls with realistic local mock behavior where feasible. Backend persistence, production APIs, real authentication, payments, and remote mutations remain explicitly out of scope.
- Pointer/touch focus on the rounded product-search, support-search, and NovaBot composer fields must not paint a sharp rectangular outline on the raw input. Keyboard traversal may show focus only on the matching rounded composite shell.
- Treat `../upload/4ce28785-8962-4e1d-b0eb-9e60349909ac.png` as the focused authority for the cart recess's lower exit: keep the circular wrap, but lengthen the short lower skirt so its approach to the card bottom reads more horizontal and less upright.
- A product-card gallery swipe advances at most one adjacent photograph regardless of release velocity while still using the protected `Carousel`; do not add CSS scroll snapping or replace its gesture runtime. The selected media indicator is a compact filled wide dot, not a thin line; inactive indicators remain small and subdued.
- Tiny previous/next media controls may appear only while the gallery is hovered, keyboard-focused, or actively being dragged, and must be omitted if final comparison shows they clutter the product photograph.
- Re-measure the top discount badge against the compact product-card authority: preserve the smaller source density and reproduce its clipped lower-left / swept lower-right flag silhouette and source-aligned top-left placement.
- The owner's final annotated shadow decision supersedes the earlier short-edge-only restriction: follow the complete white S→T→L→B cart-fold boundary with one connected gray-side contact shadow. Keep it narrower and darker than the prior patch, fade its two endpoints, and never create a broad fill, dirty halo, or ring around the navy cart button; if those artifacts cannot be avoided, omit the shadow.
- The final discount badge is a soft rounded rectangle sheared between two opposing corners: its upper-right corner is pulled upward and its lower-left corner is pulled downward. Do not reintroduce the rejected leaf waist, swept lower-right edge, rotation, or mid-side indentation.

## V4.10 Owner-Feedback Contract

The owner's attached August 11, 2026 badge crop and spacing feedback supersede the conflicting V4.9 discount-badge silhouette while preserving every unrelated accumulated interaction and cart-fold requirement:

- Treat `qa_v4_10/sources/discount-badge-reference.png` (the preserved copy of the owner's attached crop) as the focused authority for the compact product-card discount badge. Match its large rounded upper-left entry, tight upper-right corner, broad lower-right sweep, tiny lower-left return, warm `#fe6303` orange, and optically left-shifted white percentage text. Do not approximate it as a rotated or uniformly sheared rounded rectangle.
- Increase the product-card media share only modestly by extending its lower boundary. Reduce the media-to-`Çok Satan` clearance in tandem, but keep at least 7 px at every 320–480 px phone width so the asymmetric wave never overlaps the first information row.
- Preserve the V4.9 cart fold, contact shadow, gallery behavior, refresh treatment, category state, focus treatment, local mock interactions, and production/network exclusions unchanged.

## V4.11 Owner-Feedback Contract

The owner's August 12, 2026 review supersedes only the conflicting V4.9 selected-dot shape and adds the following app-wide calibration requirements:

- Treat the Favorites product card in `../upload/6ebcd93f-fcd5-4dea-b88e-0699aef8df99.png` as the canonical card component for Home, Favorites, category/product lists, search results, and recommended-product surfaces. Route-specific card geometry is forbidden. The navy cart control stays centered in the same recess with the same visible bottom clearance everywhere.
- Product-card and PDP galleries advance at most one adjacent image per gesture and settle once without overshoot, reverse bounce, or layout movement. All indicators are round: the selected navy dot is only 1.25–1.5× the inactive gray dots, and the previous selected dot shrinks as the new one grows.
- The PDP media photograph and its wave are one visual container: top, left, and right edges are straight, while the wave is the container's actual bottom edge with no blank seam. Tapping the media opens a local full-screen viewer with close, previous/next controls, swipe, pinch zoom, and pan; closing preserves the selected image.
- Remove the circular reload glyph from the product-description heading. Review cards use a left avatar, masked dark customer name, neutral review copy, and green only for the verified-purchase label. A verified mock purchaser's submitted review appears immediately without moderation copy. Pending mock questions remain owner-only until answered, then use a public question/answer card. Real eligibility, privacy, publication, and persistence remain Codex integration work.
- Product-list filters use editable minimum and maximum numeric fields with validation and no decorative slider. Sorting opens a dedicated local sheet containing the standard catalog sort choices. The notification bell opens the real Notifications route from every route where it appears.
- Search history/suggestions form an overlay attached under the fixed search bar. It closes on the first meaningful vertical content scroll, leaves no layout gap, reopens from the search field, and lets products scroll beneath the fixed bar.
- Saved-card creation opens a reusable local form and never inserts a dummy card. Saved cards use a real card proportion, chip, detected payment-brand asset including TROY, editable nickname with `Nova Kartım` as the example, and multiple-card support. CVV may appear only as masked transient add-form preview and is never stored or rendered on saved cards; production tokenization remains Codex integration work.
- Address cards support one default selection plus working local add, edit, and confirmed delete actions. Real persistence remains Codex integration work.
- At maximum scroll, PDP recommendations, category product grids, and the Account logout action finish 12–24 px above their sticky control/navigation. Remove arbitrary spacer/min-height slabs while preserving safe-area clearance and preventing overlap.
- All of these behaviors are whole-app component/state rules, not single-screen patches. Preserve the approved V4.10 badge, cart-fold, favorite animation, navigation, refresh, category, focus, and local-only prototype constraints.

## V4.12 Owner-Feedback Contract

The owner's August 13, 2026 references extend V4.11 without weakening any canonical ProductCard, gallery, spacing, privacy, or safe-payment rule:

- General app top bars must not cast a white bloom below their lower edge. Preserve only the restrained Nova navy depth needed to separate fixed chrome from content.
- Public answered product questions use a distinct seller-answer block indented from the customer question. A short navy vertical rule identifies the answer; the answer must never begin on the exact same left axis as the question. Pending-owner privacy remains unchanged.
- The PDP seller area is a compact `Satıcı Bilgisi` card with seller identity, verification, service summary, score, and separate `Mağazaya Git` / `Satıcıya Sor` actions. It must not expand an inline mini-store. `Mağazaya Git` opens a dedicated NovaStore storefront route using the shared ProductCard, scoped search, follow state, tabs, filtering, and standard sorting.
- The PDP gallery indicator row is overlaid inside the media boundary. The media and white detail surface meet without a blank strip; the detail surface owns the white wave cap and its left/right edges align with the media at every 320–480 px phone width.
- Product description and specification copy provides a real reflowing `Yazıları büyüt` control with icon and pressed state. The same control changes to `Yazıları küçült` and restores the original font sizes without zooming the entire interface.
- Checkout offers card payment only. Selected controls use a pale neutral/navy surface rather than an orange focus ring; card-number and payment-method icons depict cards, trailing field actions are vertically centered, and the CVV eye must toggle visibility. Saved-payment entry points use the same card icon language.
- These storefront and accessibility interactions are realistic local prototype state only. Real seller catalogs, follow persistence, payments, tokenization, authorization, and service data remain final repository/backend integration work.

## V4.13 Owner-Feedback Contract

The owner's August 13, 2026 follow-up extends V4.12 without weakening its seller, gallery, accessibility, payment, or shared ProductCard requirements:

- The storefront cover photograph continues behind the profile identity until its lower wave boundary reaches approximately the vertical center of the store logo. That boundary must not draw a stray line through or beside the store name; the complete name and verification mark remain legible on their own foreground layer.
- Pointer/touch focus on the storefront search field never paints a sharp rectangle on the raw input. Focusing hides the placeholder, preserves the blinking Nova navy caret, and communicates selection only through a restrained rounded-shell surface/border change.
- Storefront filter and sort actions are compact icon controls aligned with the results heading. They retain clear accessible names, their sheets, active-filter count, and practical touch targets while no longer occupying two full-width rows.
- At 1× in the full-screen PDP viewer, a vertical image drag settles back to its exact centered baseline after release. Zoomed images continue to pan within bounds; reset and page changes clear stale transform state without breaking swipe navigation or the selected image.
- The white PDP detail cap uses one continuous responsive Bézier wave: the left side rises gently, the deeper trough sits toward the right, and the far-right edge returns with one small smooth lift. Linear ledges, polygon kinks, flat right notches, and skewed protrusions are forbidden.
- The requested A–Z product audit is an evidence/reporting task. It must distinguish working local behavior, demo/status-only behavior, broken or no-op controls, and production/backend integration requirements; it does not authorize production credentials, migrations, payments, deploys, or remote mutations.

## V4.13 R8-R1 Owner Refinement

The owner's August 24, 2026 product-card crop adds one narrow refinement without weakening any existing V4.13 geometry, media, interaction, or accessibility contract:

- Keep the cart recess shape and navy cart control unchanged, but reduce the recess-to-button clearance by only about one CSS pixel at phone card sizes so the gray/white cutout sits a little closer to the cart. Do not close the gap completely or move the button off its canonical center.
- Audit product-card typography against the accepted new-theme screenshots only on the canonical Android review profile (`font_scale=1.0`). Treat a larger emulator font scale as environment drift; preserve the accepted source hierarchy and avoid compensating for that drift with an app-wide or card-local font reduction.
- Keep the product-card price row inside the cart-safe text column. Ordinary prices retain the accepted size; longer current prices step down only as much as needed, while an old struck-through price wraps below when the pair cannot share the row. Do not let either price enter the cart recess, clip a valid catalog value, or shrink unrelated card typography.

## Keyboard Rule

The simulated keyboard is a separate top-layer component. Before presenting anything that behaves like iOS navigation or modal UI, dismiss it first.

Call `keyboard.hide()` before:

- pushing, popping, or replacing FlowStack routes
- opening bottom sheets, action sheets, dialogs, menus, or navigation sheets
- starting transitions where the destination should not inherit text-input focus

`FlowStack` already hides the keyboard for `push`, `pop`, and `replace`. `BottomSheet` already hides it before opening. If you add new modal/sheet/navigation primitives, follow the same rule.

When a composer, search surface, or other keyboard-attached component closes, call `keyboard.hide()` in the same event before changing that component's open state. Position attached surfaces from `useKeyboardInsets()` rather than a separate timer or visibility flag so both dismiss together.

When any text-entry control loses focus, dismiss the simulated keyboard. If the control is custom or does not use the runtime's keyboard-aware fields, handle its blur event and call `keyboard.hide()` explicitly. Keep the keyboard open only when focus is moving directly to another text-entry control that should share the same keyboard session.

## Interaction Rules

- Do not trigger buttons or inputs after a pointer has become a drag. Preserve the drag suppression behavior in `MobileScroll`.
- Do not allow native browser image/file dragging inside the phone frame. Preserve the phone-level `dragstart` suppression and non-draggable image styles so scroll drags that begin on images still scroll the prototype.
- Use `KeyboardInput`, `KeyboardTextarea`, or `MobileTextField` for text entry so the simulated keyboard and safe-area insets stay connected.
- Fixed phone chrome should not animate with pushed screens. Screen content can animate; the status bar, camera cutout, and preview chrome should stay put.
- Keep the keyboard below the home indicator/safe area layer in z-index, and above ordinary app UI while visible.
- Keep the home indicator as the topmost safe-area layer in the z-index above everything else in the prototype.
