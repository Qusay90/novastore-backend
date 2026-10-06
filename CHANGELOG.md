# Changelog

This file summarizes selected milestones from the public GitHub history. NovaStore has no published versioned release as of 2026-10-06, so these entries are project history, not release claims.

## Pre-release history through 2026-08-20

### Storefront and catalog

- Added the category-v2 catalog and navigation foundation, including backend filtering, storefront category navigation, and Android drill-down in [PR #3](https://github.com/Qusay90/novastore-backend/pull/3).
- Fixed direct category route loading in [PR #4](https://github.com/Qusay90/novastore-backend/pull/4), hardened category schema initialization in [PR #5](https://github.com/Qusay90/novastore-backend/pull/5), added recursive storefront category navigation in [PR #6](https://github.com/Qusay90/novastore-backend/pull/6), and added admin category breadcrumbs in [PR #7](https://github.com/Qusay90/novastore-backend/pull/7).
- Improved storefront collection price formatting in [PR #8](https://github.com/Qusay90/novastore-backend/pull/8) and shared storefront price formatting in [PR #13](https://github.com/Qusay90/novastore-backend/pull/13).
- Added root-absolute product links and preserved exact product-list prices in the web and Android clients in [PRs #21](https://github.com/Qusay90/novastore-backend/pull/21) and [#22](https://github.com/Qusay90/novastore-backend/pull/22).

### Commerce administration

- Added catalog read and guarded mutation foundations for the Commerce Pro admin in [PR #18](https://github.com/Qusay90/novastore-backend/pull/18).
- Added a backward-compatible product commerce contract in [PR #19](https://github.com/Qusay90/novastore-backend/pull/19).
- Reconciled the Commerce Pro v3 integration in [PR #24](https://github.com/Qusay90/novastore-backend/pull/24). Seller-scoped backend workflows remain incomplete.

### Security and database safety

- Added release-provenance and runtime database-target safety checks in [PR #25](https://github.com/Qusay90/novastore-backend/pull/25).
- Added a fail-closed migration for public-table access hardening in [PR #26](https://github.com/Qusay90/novastore-backend/pull/26). Its merge does not mean it was applied to a production database.

### Testing and project governance

- Established the README, MIT license, contribution guide, security policy, roadmap, and GitHub Actions CI baseline in [PR #23](https://github.com/Qusay90/novastore-backend/pull/23).
- The CI workflow covers curated backend/storefront smoke checks, Commerce Pro admin build and tests, and Android unit tests. The last successful run on the default branch observed for this snapshot was on 2026-08-20.

## Unreleased

Open-source presentation, governance, application evidence, and v0.1.0 release-note preparation are being assembled on the dedicated preparation branch. They are not a published release.
