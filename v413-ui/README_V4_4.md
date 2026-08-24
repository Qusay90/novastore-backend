# NovaStore Android Customer Visual Calibration V4.4

This is the current owner-feedback revision in the editable V4.1 recovery workspace. Its acceptance state remains `HUMAN_APPROVAL_PENDING`.

## Run

```bash
npm ci
npm run dev
```

Open `?cal=CAL-01` through `?cal=CAL-12`. Capture mode keeps the established phone/tablet query contract and supports fluid 320–480 px phone widths.

## Verify

```bash
npm run check:runtime
npm run build
npm run test:sites
npm run test:v4
```

`npm run test:v4` now covers both focused prototype suites, including the product-card cart/favorite behavior. In this container, Playwright test discovery succeeds but browser execution is infrastructure-blocked because the Chromium executable is absent. Runtime integrity, TypeScript, production build, Sites worker tests, and equivalent cloud-Chrome visual/interaction checks pass; exact evidence and limitations are in `design-qa.md`.

## Review before integration

- Read `V4_4_STATUS.md` for the acceptance and backend boundaries.
- Read `design-qa.md` for the source-to-render comparison and interaction record.
- Open `qa_v4_4/comparisons/source-vs-v44-final-card.png`.
- Inspect the open cloud-browser preview before approving.

Android/Compose integration and the 112-screen expansion remain blocked until the owner explicitly approves the V4.4 browser render.
