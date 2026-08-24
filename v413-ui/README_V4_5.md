# NovaStore Android Customer Visual Calibration V4.5

V4.5 is the focused owner-feedback successor to V4.4. It changes only the compact product-card media wave, cart recess, visible cart placement, and compound cart-plus treatment while preserving the existing mobile runtime and all other prototype flows.

## Visible changes

- The large V4.4 recess was replaced with a close-fitting upper-left cradle whose top and left clearance are equal by construction.
- The visible navy cart control moved several pixels closer to the bottom-right corner while its 48 px touch target remained unchanged.
- The resting icon now follows the source: white cart plus a small white circular badge with a navy `+`.
- The media seam follows the measured two-cubic source curve with a `65.4%` trough, small early left lift, and delayed elastic rise on the right.
- Confirmation remains icon-only: the navy control stays navy, the compound glyph becomes one green check briefly, then returns.

## Verification

- `npm run test:card-geometry` — PASS, 3/3.
- `npm run check:runtime` — PASS, 28 protected files.
- `npx tsc --noEmit` — PASS.
- `npm run build` — PASS.
- `npm run test:sites` — PASS, 4/4.
- Cloud browser — PASS for the live component, confirmation interaction, application console, and widths `320–480 px`.

See `design-qa.md` and `qa_v4_5/comparisons/` for the same-input source comparisons. Human approval is still required before Android/Compose integration, sharing, commit, push, or deploy.
