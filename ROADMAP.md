# NovaStore Roadmap

This roadmap describes engineering direction, not promised delivery dates. Status is based on the public repository and this preparation branch as reviewed on 2026-10-06. Priorities may change when security, production reliability, or contributor feedback requires it.

## Completed

- Published the project overview, local setup, contribution guide, security policy, and pull-request CI baseline in [PR #23](https://github.com/Qusay90/novastore-backend/pull/23).
- Added curated CI coverage for backend/storefront smoke checks, Commerce Pro admin checks, and Android unit tests.
- Merged the Commerce Pro integration foundation in [PR #24](https://github.com/Qusay90/novastore-backend/pull/24).
- Added release-provenance and runtime database-safety hardening in [PR #25](https://github.com/Qusay90/novastore-backend/pull/25).
- Added a fail-closed public-table access-hardening migration in [PR #26](https://github.com/Qusay90/novastore-backend/pull/26). This records repository work; it does not claim the migration was applied to production.
- Added open-source governance, contribution templates, a changelog, and application-readiness drafts on this preparation branch. These changes are not yet merged to main.

## In progress

- Prepare the first public versioned release. This branch contains a v0.1.0 release-note draft, but no versioned Git tag or GitHub release has been published.
- Make the project easier to evaluate and contribute to without implying that planned seller or theme systems are already shipped.

## Planned

### Reproducible development and releases

- Add deterministic local development database provisioning.
- Document supported Node.js, PostgreSQL, JDK, and Android SDK versions as an explicit compatibility policy.
- Verify setup from a clean clone using disposable local data.
- Publish the first tagged release only after maintainer review, clean-room setup, and release checks pass.

### Storefront and customer experience

- Complete the canonical Commerce Pro storefront integration.
- Retire legacy storefront paths only after feature-parity and rollback gates pass.
- Preserve catalog, category, product, favorites, cart, and checkout behavior through the transition.
- Expand accessible loading, empty, error, offline-degraded, and responsive browser coverage.

### Administration, sellers, and themes

- Complete the modular Commerce Pro administration integration.
- Define and implement seller, store, offer, commission, payout, audit, and permission contracts before presenting seller operations as available.
- Separate platform-owned catalog actions from seller-owned actions and enforce ownership on the server.
- Build a reusable theme authoring and delivery workflow only after its ownership, preview, publish, and rollback boundaries are defined.

### Testing and security

- Expand curated smoke checks into grouped unit, contract, integration, and end-to-end suites.
- Add disposable PostgreSQL integration and migration forward/recovery verification to CI.
- Add browser acceptance coverage for the storefront and administration app.
- Document threat boundaries for authentication, payments, administration, messaging, and future seller access.
- Expand authorization checks for sensitive mutations and schedule restore rehearsals.

### Operations and contributors

- Add structured logs and request correlation identifiers, plus operational indicators for API and checkout behavior.
- Publish architecture decision records for important design choices.
- Add synthetic sample data and provider-extension guidance for payment, shipping, storage, and AI integrations.
- Label beginner-friendly and help-wanted issues when maintainers have concrete, reviewable work ready for contributors.

## Long-term direction

NovaStore aims to become a modular, auditable, self-hostable commerce foundation for developers and small businesses that want understandable architecture and explicit operational safety.

Long-term themes include:

- First-party and multi-vendor commerce with clear ownership boundaries.
- Separate catalog products, seller offers, inventory, orders, and payouts.
- Replaceable payment, shipping, email, media, and AI provider interfaces.
- Shared customer state across web and native clients.
- Production-safe migrations, backups, recovery, and observability.
- Accessible interfaces and strong Turkish localization, with room for additional locales.

## How to influence the roadmap

Open a GitHub issue describing the user problem, expected outcome, affected project surface, and compatibility or security constraints. Discuss large implementation proposals before opening a pull request.
