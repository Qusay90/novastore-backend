# NovaStore Roadmap

This roadmap describes the project's public engineering direction. It is intentionally outcome-focused rather than a guarantee of exact delivery dates. Priorities may change when security, production reliability, or contributor feedback requires it.

## Current state

NovaStore already includes a Node.js commerce API, a customer storefront, a React-based administration foundation, a native Android application, PostgreSQL-compatible migrations, and production rollout documentation.

The current focus is turning these connected product surfaces into a reproducible, contributor-friendly open-source platform without weakening the repository's production-safety controls.

## H2 2026 priorities

### 1. Open-source baseline and reproducibility

- [x] Publish a repository overview and local setup guide.
- [x] Publish contribution and security-reporting guidance.
- [x] Add pull-request CI for backend/storefront smokes, admin checks, and Android unit tests.
- [ ] Add issue and pull-request templates.
- [ ] Add deterministic local development database provisioning.
- [ ] Document supported Node.js, PostgreSQL, JDK, and Android SDK versions through a version policy.
- [ ] Produce a clean-room installation verification from a fresh clone.

### 2. Storefront integration and customer experience

- [ ] Complete the canonical Commerce Pro storefront integration.
- [ ] Remove the legacy storefront after feature-parity and rollback gates pass.
- [ ] Preserve canonical category, product, favorites, cart, and checkout behavior during the transition.
- [ ] Add accessible loading, empty, error, and offline-degraded states.
- [ ] Expand responsive browser testing across desktop and mobile viewports.
- [ ] Publish maintained storefront screenshots after the canonical integration is released.

### 3. Modular administration and multi-vendor foundation

- [ ] Complete the modular Commerce Pro administration integration.
- [ ] Separate platform-owned catalog operations from seller-owned operations.
- [ ] Define seller, store, offer, commission, payout, and audit contracts.
- [ ] Replace universal product-approval assumptions with configurable policy gates.
- [ ] Make risk indicators explainable, evidence-based, and reviewable.
- [ ] Add role and permission tests for platform administrators and future seller users.

### 4. Testing and release engineering

- [ ] Expand the curated smoke suite into grouped unit, contract, integration, and end-to-end suites.
- [ ] Add disposable PostgreSQL integration tests in CI.
- [ ] Add migration forward/rollback verification for supported migration classes.
- [ ] Add browser-based storefront and administration acceptance tests.
- [ ] Publish versioned changelogs and signed release notes.
- [ ] Produce stable tagged releases with reproducible build instructions.

### 5. Security and operational reliability

- [ ] Establish a recurring dependency and secret-scanning workflow.
- [ ] Add a documented threat model for authentication, payments, administration, messaging, and seller boundaries.
- [ ] Expand authorization tests for every sensitive resource mutation.
- [ ] Add structured application logging and request correlation identifiers.
- [ ] Define service-level indicators for API availability, checkout failures, and background operations.
- [ ] Exercise database and media restore procedures on a documented schedule.

### 6. Contributor and ecosystem growth

- [ ] Label beginner-friendly and help-wanted issues.
- [ ] Publish architecture decision records for major design choices.
- [ ] Create sample data that contains no production or personal information.
- [ ] Add extension guidance for payment, shipping, storage, and AI providers.
- [ ] Document self-hosting boundaries and production-hardening responsibilities.
- [ ] Recognize external contributors in release notes and project documentation.

## Long-term direction

NovaStore aims to become a modular, auditable, self-hostable commerce foundation suitable for developers and small businesses that need more than a demonstration application but still want understandable architecture and explicit operational safety.

Long-term themes include:

- First-party and multi-vendor commerce in one configurable platform.
- Clear separation between catalog products, seller offers, inventory, orders, and payouts.
- Replaceable provider interfaces for payments, shipping, email, media, and AI assistance.
- Shared customer state across web and native clients.
- Production-safe migrations, backups, recovery, and observability.
- Accessible interfaces and strong Turkish localization with room for additional locales.

## How to influence the roadmap

Open a GitHub issue describing the user problem, expected outcome, affected project surface, and any compatibility or security constraints. Large implementation proposals should be discussed before a pull request is opened.
