# NovaStore V4.13 Owner-Feedback Design QA

## Comparison target and evidence

- Owner references inspected at original pixels: `../upload/f8e64172-2e92-47a6-b529-5e3ba69f26f7.png` (store focus/hero/tools), `../upload/9bad6278-bc83-4349-8421-fbe687491ee1.png` (viewer last-slide drift), and `../upload/d04e28ab-e70f-42c5-bf31-c05f17151730.png` (PDP white wave).
- The implementation was inspected in the connected cloud browser on the app-owned `411.428571 × 914.285714` Pixel 10 canvas.
- Each owner reference and its current browser screenshot were emitted together in the same comparison input before judging fidelity.
- Focused crops were used to inspect the PDP wave’s right trough/return without changing the source viewport.
- The cloud browser’s shared screenshot directory was read-only in this run, so browser images were inspected inline rather than attached as durable files. The reproducible routes and computed measurements below are the durable evidence.

## Resolved findings

- [Resolved P1] The store search input inherited the global hard navy rectangular `:focus-visible` ring. The raw input now has no outline/shadow; focusing hides the placeholder, preserves the navy caret, and changes only the rounded shell surface/border.
- [Resolved P1] The store’s full-width 46 px text controls dominated the list header. Filter and sort are now two compact `42 × 42 CSS px` icon controls aligned to the results heading, with exact accessible names and unchanged sheets.
- [Resolved P2] The store cover wave ended above the logo center and could visually cross the identity row. Its boundary was lowered `7 px`; the identity row owns an isolated foreground layer and the full `Nova Audio Mağazası` name remains intact.
- [Resolved P1] A 1× image could retain a translated position after vertical viewer drag. `centerZoomedOut`, bounded transform behavior, zero velocity, release reset, and per-page transform remount now restore the exact centered baseline.
- [Resolved P1] Opening the viewer while the simulated keyboard was active could shift/crop the modal. Viewer entry now hides the keyboard before the dialog opens.
- [Resolved P2] The PDP white cap used a 13-point polygon that created a flat right ledge and kink. It now uses two tangent-smooth responsive cubic curves: gentle left lift, deeper rightward trough, and one smooth far-right return.

## Measured acceptance evidence

- Store input focus: `outline-style: none`; `box-shadow: none`; placeholder `rgba(0, 0, 0, 0)`; caret `rgb(6, 30, 69)`; rounded shell surface changes subtly.
- Store tools: both visible boxes are `42 × 42 CSS px`; names are exactly `Filtrele` and `Sırala`; both local BottomSheets still open.
- Store hero: cover bottom and logo vertical center differ by no more than `1.5 CSS px`; the wave pseudo bottom is `-7px`.
- PDP media/detail: identical x and width; measured overlap/seam approximately `-0.8 CSS px`; horizontal overflow `0`.
- PDP cap: computed `clip-path` contains `shape(...)` and no `polygon(...)`.
- Viewer third slide baseline: `translate(0px, 302.5px) scale(1)`. Upward and downward 1× drag-release return to the same transform after settle.
- Viewer zoom: zoom-in produced scale greater than `1`; horizontal pan changed position within bounds; reset returned to the 1× baseline.

## Current-run flow audit

- All 37 meaningful CAL/tab/view states were opened in the cloud browser.
- DOM inventory found 715 visible control instances and 233 unique control names, including repeated bottom-nav and shared ProductCard controls.
- Shared component behaviors were tested once per behavior class; key auth, search, store, filter, PDP/viewer, cart/checkout, account, notification, order, support and NovaBot outcomes were reconciled with source/tests.
- Destructive final confirmations and production/remote effects were not executed. They are classified in `NOVASTORE_A_Z_AUDIT_V4_13.md`.

## Build and regression gates

- Protected mobile runtime: PASS, `28/28` files.
- TypeScript: PASS.
- Production/Sites-ready build: PASS.
- Product-card geometry: PASS, `9/9`.
- Carousel paging units: PASS, `3/3`.
- Sites worker: PASS, `4/4`.
- V4.13 Playwright static discovery/type contract: PASS, `2` focused tests.
- Local CLI Playwright execution: BLOCKED before test bodies because the workspace has no Playwright Chromium binary. Changed surfaces were exercised in the connected cloud browser.
- Application console: no app-origin error observed on the changed routes.

## Product boundary

The visual/local-interaction result passes V4.13. The prototype is not production-integrated: real auth, seller catalogs, search, persistence, price/stock authority, PSP tokenization/payment, orders, verified reviews, pending-question privacy, notification delivery and support services remain Codex integration work. The full evidence-backed backlog and security contracts are in `NOVASTORE_A_Z_AUDIT_V4_13.md`.

final result: passed
