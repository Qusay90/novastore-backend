# NovaStore v0.1.0 — draft release notes

**Status:** preparation draft, reviewed 2026-10-06. No tag or GitHub release has been created. Do not publish this as a release until the checks at the end are complete.

## Overview

NovaStore is an MIT-licensed, pre-release commerce codebase containing a Node.js API, customer web storefront, React/Vite administration foundation, native Android application, and PostgreSQL-compatible data layer.

## Included capabilities

- Commerce API and customer-facing web and Android application code.
- Product catalog and category workflows, customer account state, favorites, cart, and order flows.
- A modular administration foundation for selected operational workflows.
- PostgreSQL migrations, startup safety controls, and repository documentation for cautious local and production operations.
- GitHub Actions coverage for curated backend/storefront smoke checks, admin build and tests, and Android unit tests.

## Selected work in the public history

- Commerce Pro v3 integration foundation: [PR #24](https://github.com/Qusay90/novastore-backend/pull/24).
- Release provenance and runtime database safety: [PR #25](https://github.com/Qusay90/novastore-backend/pull/25).
- Fail-closed public-table access-hardening migration: [PR #26](https://github.com/Qusay90/novastore-backend/pull/26). This migration was not applied to production as part of this work.
- Open-source documentation and CI baseline: [PR #23](https://github.com/Qusay90/novastore-backend/pull/23).

## Security and quality

The default-branch CI run for commit f25385bd, dated 2026-08-20, completed successfully across the repository's configured jobs. This is historical main-branch evidence, not a CI result for this preparation branch or a guarantee that every workflow is exhaustive.

## Known limitations

- This is pre-release software. No versioned release or release download is available.
- Seller-scoped backend operations and a complete seller portal are not shipped.
- A reusable theme-authoring platform is not verified as an implemented capability.
- Admin and Android capabilities are partial; provider behavior depends on local deployment configuration.
- A clean-room install and release-candidate review are still required.
- The current main tree contains tracked Chromium profile files under `artifacts/chrome-profile/`, including cookie, login-data, and history databases. The release tree must exclude them, and any session or personal-state exposure in public history must be assessed.
- Resolve release-version policy: the private root `package.json` and `package-lock.json` report 1.0.0, while the private `admin-commerce-pro/package.json` reports 0.0.0. Decide whether these package versions should track the repository tag or be explicitly treated as private package metadata.
- No public adoption metrics are verified in the repository evidence snapshot.

## Next contributor work

- Reproduce local setup from a clean clone using disposable data.
- Expand integration and browser acceptance checks.
- Complete server-enforced seller ownership before enabling seller workflows.
- Improve provider extension guidance, observability, and recovery exercises.

## Before publishing

- Confirm the exact release commit and supported setup instructions.
- Run CI on the release candidate and review all results.
- Verify installation from a clean clone and inspect the release artifact contents.
- Remove `artifacts/chrome-profile/` from the release tree and assess its public Git history for exposed session, credential, or personal state.
- Decide whether to align the root and admin package versions with the repository release or document that the private package versions are independent of repository tags.
- Recheck the public demo, metadata, limitations, and adoption figures.
- Obtain maintainer sign-off, then create the v0.1.0 tag and GitHub release explicitly.
