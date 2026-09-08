# Customer Web R20 authority and preserved patches

The Customer Web implementation starts from accepted return-tracking commit
`ce76b3ed45576d721fc250cad989f00c27d31690`, tree
`6af785c48e3fb961e6bef127c6cbfe35029f1ab2`.
This retains R13 returns and the accepted R8 responsive, favorites, mobile
navigation and comparison changes, plus checkout legal consent and NovaBot.

R15 commit `af8c808995c2bca6f36a11236f96fcaa213b630f`, tree
`ca1b97ad24b333302230361b9b8085274e4366f7`, is a separate accepted CI authority.
Its merge-base with the Customer Web return authority is
`784cbc7d71cb2f556f9dc9df27bdb91f538f7118`. Its branch does not contain R13 returns;
therefore it must not replace the Customer Web base.

The following Customer Web hunks from R15's parent-to-commit patch are replayed:

- `src/customerAuthUx.js`: parse internal return routes using the non-network
  `customer-return:/` scheme, with protocol and empty-host checks. Retain the R13
  `/hesabim/iadeler` and `/hesabim/iadeler/:id` allowlist entries.
- `scripts/finalize-cutover.mjs` and new
  `scripts/production-navigation-contract.cjs`: prove the fixed Seller recruitment
  URL is used only by the two approved anchor surfaces. Retain all other
  production origin, API, asset and runtime hygiene rejection rules.
- `tests/customer-web-r6.test.mjs`: preserve the normalization and redirect
  rejection regression for the non-network return parser.
- Root `tests/commerceProNavigationOriginSmoke.js` and its integration in
  `tests/commerceProCutoverArtifactSmoke.js`: retain negative probes for alternate
  origins and misuse of the approved Seller URL as a request, auth, payment,
  script or asset destination.
- Root `tests/officialRuntimeVisualContractSmoke.mjs`: preserve R15's stronger
  comparison clear-button and mount assertions, requiring both selection and
  surface visibility to clear. Keep the accepted Customer Web assertions.

The `src`, `scripts` and package `tests` paths above are relative to
`storefront-commerce-pro/` unless marked root.

Excluded from replay: R15 backend/Admin changes, Admin artifact digest,
delivery-migration assertions, and the historical Customer generated artifact
and digest. R20 must rebuild the Customer artifact from the combined accepted
source and validate its resulting bytes. R15 versions of the Customer pages,
runtime, account/HTTP adapters and return files are not used to overwrite R13.

PC1 R19 commit `d3e5fdadf961429c6860f18bd1706fac23add9e7` supplies contract authority
through `pc1-r19-purchasable-variants/docs/seller/PC1-A14-CUSTOMER-WEB-VARIANT-CONSUMER-HANDOFF.md`.
It does not supply this branch's base, and no PC1 backend change is part of R20.
Fixture consumer validation must be reported separately from final converged PC1
end-to-end validation.
