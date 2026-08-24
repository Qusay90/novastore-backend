# NovaStore Android Customer Visual Calibration V4.8

Status: `HUMAN_APPROVAL_PENDING`

All accumulated owner requests in this iteration are implemented and machine/browser verified. This status is not owner approval and does not authorize Android/Compose integration, commit, push, share, or deploy.

## Completed scope

- Product-card proportions, media scale, typography, discount/favorite sizing, cart-plus weight, and recess clearance aligned more closely to the supplied reference.
- Recess shadow limited to the underside of the short slanted white edge left of the cart.
- Three-image in-card swipe/selector interaction added.
- Favorite add/remove feedback and visible cart-to-check morph added.
- Route, subview, same-route, and popstate scroll reset added; stale momentum cannot carry into the destination.
- Active root-tab reselect refreshes at the top without duplicating browser history.
- Thresholded pull-to-refresh added for scrollable and short content, including cancel/disarm, completion, live status, pointer safety, and reduced-motion behavior.

## Verification state

- Full Playwright suite: PASS, 43/43.
- Product-card geometry contracts: PASS, 8/8.
- Sites worker packaging tests: PASS, 4/4.
- Protected mobile runtime: PASS, 28 files.
- TypeScript and production build: PASS.
- Deterministic CAL-04 capture, normalized visual comparison, and cloud-browser live render: PASS.

## Publication state

- Commit: not created; this workspace has no Git metadata.
- Push/deploy/share: not performed.
- Android/Compose integration: not performed.
- Production or remote database: not used.
- Remote API mutation: not performed.
- Real payment: not performed.

The refresh callback is intentionally local and simulated in this visual prototype. Human visual approval is still required.
