# NovaStore Android Customer Visual Calibration V4.6

V4.6 is the focused owner-feedback successor to V4.5. It corrects the compact product card's information spacing, media-wave clearance, and cart recess while preserving the protected mobile runtime and the existing interaction model.

## Visible changes

- Replaced the obsolete `--card-wave-depth` dependency that caused the compact-card padding declaration to collapse at narrow widths.
- Restored reference-like top and side spacing for the bestseller, store, title, rating, divider, and price rows.
- Kept the asymmetric wave intact while placing the information body safely below it at every tested phone width.
- Rebuilt the cart recess with gradual right-edge and bottom-edge entries, vertical and horizontal tangency, and a soft lavender rim plus diffuse peeled-cover shadow.
- Preserved the white cart-plus resting glyph and transient green-check confirmation state.
- Reserved price width from the visible cart geometry, removing the 320 px overflow found during responsive QA.
- Kept `Nova Pulse ANC Kulaklık` on one line at the canonical 411 px width.

## Run locally

```bash
npm ci
npm run dev
```

## Verification

- `npm run test:card-geometry` — PASS, 5/5.
- `npm run check:runtime` — PASS, 28 protected files.
- `npm run build` — PASS.
- `npm run test:sites` — PASS, 4/4.
- Targeted Playwright matrix at `320, 360, 393, 411, 427, 480 px` — PASS, 1/1.
- Deterministic CAL-04 capture — PASS at 1080 × 2400 physical px with zero external requests.
- Cloud-browser live component and cart confirmation interaction — PASS with zero application-origin console errors.

The full Playwright suite was not run in this focused pass because the project-local browser is absent and the default Vite web-server path encounters `uv_interface_addresses`. The targeted width matrix and deterministic capture used temporary Chromium with same-process Vite orchestration; they are not represented as a full-suite pass.

See `design-qa.md` and `qa_v4_6/focused/reference-vs-v46-first-card.png` for the source comparison and final QA record. Human visual approval is still required before Android/Compose integration, sharing, commit, push, or deploy.
