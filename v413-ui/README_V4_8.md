# NovaStore Android Customer Visual Calibration V4.8

V4.8 completes the accumulated owner-feedback pass for the compact product card and adds route-level scroll reset plus a unified refresh interaction. The protected mobile runtime remains unchanged; the new behavior is composed in the application layer.

## Visible changes

- Localized the cart-recess shadow to the short slanted white edge on the cart's left side, with a light downward contact shadow instead of a ring around the full recess.
- Increased the visible clearance between the white recess and the navy cart control.
- Rebalanced the reference-card proportions: broader product media, smaller/lighter store and bestseller copy, compact asymmetric discount and favorite controls, and a thinner cart-plus glyph.
- Added three independent product images to the first card. They can be swiped in place or selected with the accessible position controls without opening the product detail page.
- Added an explicit favorite add/remove motion; removal from the Favorites view waits for the feedback animation before the card leaves.
- Changed add-to-cart feedback from an immediate icon swap to a visible cart-to-check morph.
- Every route, subview, browser-history destination, and same-route navigation starts at the top without inheriting old momentum.
- Reselecting an active root tab refreshes that screen at the top without adding a history entry. Selecting the active tab from one of its subviews returns to the root normally.
- Added pull-to-refresh for long and short screens: progressive ring/arrow, armed threshold, cancel below threshold, retract-to-cancel, refresh hold, completion state, and reduced-motion handling.

## Run locally

```bash
npm ci
npm run dev
```

## Verification

- `NOVASTORE_CHROMIUM_PATH=/tmp/chromium npm run test:all -- --workers=1` — PASS, 43/43.
- `npm run test:card-geometry` — PASS, 8/8.
- `npm run test:sites` — PASS, 4/4.
- `npm run check:runtime` — PASS, 28 protected files.
- `npm run build` — PASS.
- Deterministic CAL-04 capture and normalized source comparison — PASS.
- Cloud-browser CAL-04 live render and accessible interaction surface — PASS.

The refresh operation is a prototype-local simulated update; it does not clear commerce/session state or call a production service. The production build reports only Vite's non-blocking chunk-size warning. See `design-qa.md` for the visual and behavioral QA record.

Human visual approval remains pending. No commit, push, deploy, Android/Compose integration, production database access, remote API mutation, or real payment action was performed.
