# NovaStore V4.10 Review Package

This package contains the V4.10 Android customer visual-calibration prototype, the protected mobile runtime, the verified production build, focused product-card evidence, and regression contracts.

## Review entry points

- `V4_10_STATUS.md` — completion and publication boundary.
- `design-qa.md` — source-to-browser comparison history and verification evidence.
- `qa_v4_10/comparisons/reference-vs-v410-discount-badge.png` — normalized badge comparison.
- `qa_v4_10/focused/V4.10-first-card-phone-6x.png` — actual browser-rendered compact-card crop.
- `src/Prototype.tsx` and `src/prototype.css` — editable prototype behavior and styling.
- `tests/product-card-geometry.test.mjs` — badge, media, cart-fold, shadow, and gallery contracts.
- `dist/` — verified production/Sites-ready build output.

## Local commands

```sh
npm install
npm run test:card-geometry
npm run check:runtime
npm run build
npm run test:sites
```

The prototype uses realistic local mock state only. It does not connect to production authentication, payments, databases, or remote mutation APIs.
