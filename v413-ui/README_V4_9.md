# NovaStore V4.9 Review Package

This package contains the final local Android customer visual-calibration prototype, source assets, protected mobile runtime, production build output, regression contracts, and QA handoff notes.

## Review entry points

- `V4_9_STATUS.md` — completion and publication boundary.
- `design-qa.md` — implemented owner feedback and verification evidence.
- `src/Prototype.tsx` and `src/prototype.css` — editable prototype behavior and styling.
- `tests/product-card-geometry.test.mjs` — cart-fold, shadow, badge, and gallery static contracts.
- `dist/` — verified production/Sites-ready build output.

## Local commands

```sh
npm install
npm run build
npm run test:card-geometry
npm run test:sites
```

The prototype uses realistic local mock state only. It does not connect to production authentication, payments, databases, or remote mutation APIs.
