# Customer Web R24 accepted authority convergence

R24 starts on a new worktree and branch from accepted R20
`7a9f218e2d2e329cb39548ec979321e83d0502f6`, tree
`a9d55058cbf33d5a1ab8252be050b048ad770df2`. The initial index and worktree
were clean. R20 is the direct child of the binding R13 return authority
`ce76b3ed45576d721fc250cad989f00c27d31690`, tree
`6af785c48e3fb961e6bef127c6cbfe35029f1ab2`.

## Accepted Web authorities

| Authority | Commit | Reconciliation |
| --- | --- | --- |
| Account and global NovaBot | `36923e6ea5c927811c002612c02ae869218722d4` | Ancestor |
| Checkout legal consent | `8c78f785a6e4080643cdc63b7254ab38b9a4c838` | Ancestor |
| NovaBot server modes | `692c9d1b5a205868e72ee7eca0e897cbdf01d293` | Ancestor |
| Seller recruitment and profile | `86e120cfddaa533be642e9ff5f3a3c73e8da3fec` | Ancestor |
| NovaBot mode interaction | `b4f4e2cc079d60f6ae46bd3076673d9d8ab3261e` | Ancestor |
| Profile runtime | `aceb4e25499e44fa9ff19e4f654e7bc8097025e0` | Ancestor |
| R8 responsive surfaces | `858d699c39959fe6090d8a62fa4489aa3b2ce454` | Ancestor |
| R8 favorites and mobile authentication | `a8f5b7b014b5bd9a3bd7935db99d4871d599198a` | Ancestor |
| R8 mobile comparison | `a6813a179625f62cc1ada2220a00f99bd8e23347` | Ancestor |
| R8 horizontal overflow | `784cbc7d71cb2f556f9dc9df27bdb91f538f7118` | Ancestor |
| R13 return tracking | `ce76b3ed45576d721fc250cad989f00c27d31690` | R20 direct parent |
| R15 parser and origin hygiene | `af8c808995c2bca6f36a11236f96fcaa213b630f` | Scoped Web hunks already present in R20 |
| R20 canonical variants | `7a9f218e2d2e329cb39548ec979321e83d0502f6` | R24 starting commit |

The all-ref audit of later commits touching Customer Web paths found R15,
R17 `fce4388bc089a02708138e6ff11f0993280c6090` (Admin artifact digest only),
and R20. R15 is the only separate
accepted later authority with Customer-Web-specific hunks absent from R13.
No authority ambiguity was found, so no replay or merge commit is necessary.

## R15 hunk identity

R15 tree is `ca1b97ad24b333302230361b9b8085274e4366f7`. Its branch lacks R13
returns. The accepted R20 base already preserves these exact R15 blobs:

| File (under storefront-commerce-pro unless marked root) | Git blob |
| --- | --- |
| `scripts/finalize-cutover.mjs` | `527e451d5bb3e8a86abfcf50f13f4de937412924` |
| `scripts/production-navigation-contract.cjs` | `64aa0d7536642db86fe09f566ab67d99019fa78a` |
| `tests/customer-web-r6.test.mjs` | `f186b70133c1d62fa0d85e7c9ae90c52d43ad526` |
| Root `tests/commerceProCutoverArtifactSmoke.js` | `656e2c3c15519c0a848a232f26fd24dae1f032a0` |
| Root `tests/commerceProNavigationOriginSmoke.js` | `ec64f5b3d11a5fb4b479ca8666a50a3bb4953e32` |

The `customerAuthUx.js` parser retains R15's non-network `customer-return:/`
protocol and empty-host validation together with R13's return routes. The
official runtime test retains R15's comparison clear-selection and clear-surface
assertions alongside the later variant cart assertions.

R15 backend/Admin changes, Admin digest changes and historical generated HTML
are excluded. The Customer production HTML is regenerated from the reconciled
source. Canonical App, catalog, CSS and image authorities remain locked.

## Backend authority and evidence boundary

R19 is contract authority, not the Web branch base:

- HEAD `d3e5fdadf961429c6860f18bd1706fac23add9e7`
- TREE `b4004e0856ac0902374d8c04026a05bc9bb3c4dc`
- Handoff: `docs/seller/PC1-A14-CUSTOMER-WEB-VARIANT-CONSUMER-HANDOFF.md`

Its detail rows provide `id`, `sku`, selections, canonical major-unit `price`,
`availableStock`, `purchasable` and `commerce_revision`, with the explicit
`variant_selection_required` signal. Purchase lines use
`{product_id, variant_id, quantity}`; simple lines omit `variant_id`.

Variant cart identity and persistence are inherited from R20: distinct variants
remain separate, and only IDs and quantity are persisted in the variant sidecar.
The accepted shared-state v1 server cart continues to receive simple lines only.
Cross-device variant synchronization is not introduced.

Fixture browser evidence and disposable real R19 backend evidence are recorded
separately. Neither authorizes production DB writes, real provider calls or
publication. R19 and all unrelated worktrees remain unchanged.
