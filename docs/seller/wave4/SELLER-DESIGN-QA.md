# Seller Main-6S R2 owner-authority visual QA

## Current authority

- Owner decision: the current owner-approved NovaStore Seller design system
  supersedes conflicting visual details in the older 001 and 055 rasters.
- The older 001 and 055 references remain authoritative for screen purpose,
  major regions, information hierarchy, basic layout, component classes and
  overall character. Their obsolete font, icon, portrait, illustration, input
  contour, CTA contour, bottom-bar treatment and decorative details are not
  acceptance targets when they conflict with the current system.
- Reference 282 retains its existing full-screen SVG/PNG golden contract and
  unchanged `<=5%` full-frame plus geometry gates.
- No reference image is embedded as a runtime screen and no missing portrait,
  icon or font asset was fabricated.

## Runtime evidence

- Runtime: native Android Compose on AVD `novastore-seller-wave4-uat`.
- Installed debug APK SHA-256:
  `5efdba9e3e26530539fb80bb8890924a6fc6d3887638a91f4fd00c1ada8b2a44`.
- Exact targeted states:
  - 001 `login` on `seller://auth/login`;
  - 055 `ref_055` on `seller://dashboard`;
  - 282 `ref_282` on `seller://team`.
- All three capture receipts report `capture_valid=YES`, `frame_stable=YES`,
  `ui_idle=YES`, `wrong_context=NO`, the expected route and the same APK hash.
- Durable same-APK receipts, runtime captures, the 282 comparator and their
  hash manifest are committed under
  `docs/seller/wave4/evidence/representative/r2-owner-authority/`.
- Runtime SHA-256 values are:
  - 001: `db9010f9b2546ced3a2979cc3cad7a7d335cd239253105a6c39991bb907b473c`;
  - 055: `d9878bcd12cd5e6c85027fd9b3ec5f3cb717f656c3e27275169cd5c2e1fd22af`;
  - 282: `2e2643be26106a3e8e67acc42e96dd4c9cd09179f5af888d2b8137b95b2f8d28`.

## Target results

### 001 login — PASS

- Purpose, header, brand region, hero hierarchy, form region, primary action
  and safety/support hierarchy remain faithful to the structural reference.
- Identifier and password fields now share the current Seller 52 dp / 14 dp
  field geometry, light outline, balanced internal padding and calm text weight.
- The primary action uses the shared Seller gradient, radius and shadow system.
- Empty-submit validation expands the card without clipping and exposes both
  field errors through accessibility semantics.
- The final runtime frame has no clipping, overlap, stale placeholder asset,
  fake enabled action or unreadable Turkish copy.

### 055 dashboard — PASS

- Brand header, greeting, sales summary, task cards, balance, recent orders,
  primary action and five-tab navigation retain the required hierarchy.
- The sales hero, white cards, outline/elevation system and typography now use
  one current Seller visual language instead of reference-specific font/scale
  hacks.
- Missing historical portrait and bespoke icon assets were not imitated. The
  supplied owner brand mark and the shared Material icon family are used.
- The customer-question tile remains visibly and semantically disabled with
  `Kapalı`; no reputation/customer-question capability is invented.
- The common bottom navigation uses one selected orange bubble, white icon,
  rim, shine, shadow and motion treatment.
- Enabled task actions expose at least a 48 dp touch target while preserving
  their compact visual treatment.

### 282 team — PASS, regression frozen

- The 282-specific changes already present in the preserved, accepted R2
  starting WIP were not changed further by the owner-authority rebind step.
- Fresh same-APK runtime comparison against the unchanged binding 282 source:
  `4.8425%` at a `5%` threshold, full-frame `PASS`, geometry `PASS`, all nine
  critical-region geometry checks passed and zero failed geometry IDs.
- Exact comparator evidence:
  `docs/seller/wave4/evidence/representative/r2-owner-authority/282-diff.json`,
  SHA-256
  `accbcf36b4cfb20b804a50800d21defa3dba355f6ca628a69ecb66afda26836a`.
- Exact route, fixture, markers, UI-idle, frame stability and installed-APK
  identity all passed.

## Shared component regression

- Top surfaces use the same navy hierarchy, white surface, outline and shadow
  language while retaining family-appropriate dashboard branding.
- Inputs, primary CTAs, task CTAs and disabled actions use consistent radii,
  spacing, weight and state treatment.
- Generic launch tabs share the current orange bubble/shine behavior. The
  source-bound 282 navigation remains its frozen specialized implementation.
- Role/disabled semantics, minimum interactive sizing, Turkish characters and
  fail-closed capability boundaries are preserved.

## Findings

- P0: none.
- P1: none.
- P2: none.
- Historical 001/055 pixel deltas against superseded visual details remain
  diagnostic only and are not current acceptance failures.

## Gate summary

- 001 owner-authority visual UAT: `PASS`.
- 055 owner-authority visual UAT: `PASS`.
- 282 unchanged binding golden gate: `PASS` (`4.8425%`, geometry `PASS`).
- Current three-screen pass count: `3/3`.

final result: passed
