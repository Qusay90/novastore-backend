# NovaStore V4.11 Review Package

This package contains the approved owner-feedback implementation for the Android customer prototype: the canonical Favorites-based ProductCard, stable paged galleries and image viewer, redesigned review/Q&A states, filters and sorting, global notifications, sticky search overlay, safe saved-card UI, address CRUD, and terminal-spacing corrections.

## Review entry points

- `V4_11_STATUS.md` — implementation and publication boundary.
- `design-qa.md` — source-to-cloud-browser QA history and measurements.
- `qa_v4_11/comparisons/reference-vs-v411-canonical-card.png` — combined owner-reference/product-card comparison.
- `src/Prototype.tsx` and `src/prototype.css` — editable app-owned behavior and styling.
- `src/mobile/Carousel.tsx` — opt-in paged mode; default free mode remains unchanged.
- `tests/account-commerce-v4_11.spec.ts`, `tests/calibration-v3.spec.ts`, `tests/calibration-v4.spec.ts`, and `tests/mobile-runtime.spec.ts` — V4.11 acceptance contracts.
- `dist/` — verified production/Sites-ready build output.

## Local commands

```sh
npm install
npm run check:runtime
npm run test:card-geometry
node --test tests/carousel-paging.test.mjs
npm run build
npm run test:sites
```

The prototype uses realistic local mock state. It does not connect to production authentication, card vaults, databases, review/Q&A moderation services, or remote mutation APIs.
