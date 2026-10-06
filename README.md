# NovaStore

[![CI](https://github.com/Qusay90/novastore-backend/actions/workflows/ci.yml/badge.svg)](https://github.com/Qusay90/novastore-backend/actions/workflows/ci.yml)
[![Live storefront](https://img.shields.io/badge/live-novastore.tr-0f2a43)](https://novastore.tr)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

NovaStore is an open-source, multi-surface commerce platform in one repository. It contains a Node.js API, a customer web storefront, a React administration foundation, a native Android application, and a PostgreSQL-compatible data layer. The repository is licensed under MIT.

The codebase covers catalog and category management, customer accounts, favorites and cart synchronization, orders, payment-provider boundaries, operational administration, and database migration safety. NovaStore is pre-release software: its public history has no versioned release yet, and several marketplace and theme capabilities remain planned.

> **Project status:** pre-release and maintainer-led. Repository capabilities below describe code in this project, not a promise that every feature is deployed or production-ready.

## Live demo

The public storefront is available at **[novastore.tr](https://novastore.tr)**.

The demo shows the customer-facing storefront and catalog experience. Administrative, payment-provider, migration, and production-operation features require an appropriately configured environment and must not be tested against production without explicit authorization.

## Project surfaces

| Surface | Technology | Purpose |
| --- | --- | --- |
| Backend API | Node.js, Express, Socket.IO | Authentication, catalog, orders, payments, notifications, messaging, analytics, and administration APIs |
| Web storefront | HTML, CSS, JavaScript | Product discovery, canonical category pages, product detail, favorites, cart, checkout, and account flows |
| Commerce admin | React, Vite | Modular operational interface for catalog, orders, customers, reports, settings, and future seller operations |
| Android app | Kotlin, Jetpack Compose | Native discovery, product detail, favorites, cart, checkout transition, and notifications |
| Data layer | PostgreSQL / Supabase-compatible | Commerce data, migrations, catalog hierarchy, shared customer state, and operational records |

## Highlights

- Canonical hierarchical categories and recursive storefront navigation.
- Product catalog, favorites, cart, shared state, orders, shipping, returns, campaigns, and reviews.
- Provider-aware payment architecture with guarded callback and configuration policies.
- Modular Commerce Pro administration foundation.
- Native Android application using Compose, MVVM, Hilt, Retrofit, Room, and Coroutines.
- Fail-closed database startup guards, additive migrations, and production rollout runbooks.
- Security hardening including request sanitization, rate limiting, authenticated Socket.IO rooms, and anti-clickjacking headers on sensitive admin pages.
- Focused smoke tests for backend contracts, storefront behavior, administration models, and Android unit behavior.

## Feature status

| Area | Status | Current scope |
| --- | --- | --- |
| Commerce API | Available | Node.js and Express APIs for commerce flows, with configuration-dependent provider integrations. |
| Web storefront | Available | Customer catalog and account surfaces, including category navigation, product pages, favorites, cart, and checkout transitions. |
| Commerce admin | Partial | React/Vite operational foundation; not every module or workflow is fully integrated. |
| Android | Partial | Native Kotlin/Compose customer app. Checkout transitions exist, but this repository does not claim a complete payment flow for public release. |
| Seller and multi-vendor operations | Planned | Seller-scoped backend capabilities and a seller portal are not implemented as a complete workflow. |
| Theme authoring platform | Planned | The repository has application styling, but no reusable theme-authoring platform is verified on the current default branch. |
| Data and security boundaries | Partial | PostgreSQL migrations, startup guards, and public-table access hardening exist; this does not establish complete seller tenant isolation or production rollout. |
| Tests and CI | Available | GitHub Actions covers backend/storefront smoke checks, admin build/model/preview/mutation checks, and Android unit tests. The suites are curated, not exhaustive. |

## Architecture

The current repository is organized around three clients using the commerce API and its data layer. Optional provider integrations depend on deployment configuration. Seller portal and theme-authoring work are roadmap items, not shipped components.

```mermaid
flowchart TD
  Storefront[Customer web storefront] --> API[Node.js / Express commerce API]
  Admin[React / Vite commerce admin] --> API
  Android[Native Android app] --> API
  API --> Data[(PostgreSQL-compatible data layer)]
  API -. configured provider adapters .-> Providers[Payment, shipping, messaging, media, and AI services]
  Seller[Seller portal and seller-scoped operations - planned] -. not shipped .-> API
  Themes[Reusable theme authoring - planned] -. not shipped .-> Storefront
```

## Why NovaStore matters

NovaStore puts a web storefront, commerce API, administration foundation, Android client, and database migration work in one inspectable codebase. That gives developers a place to study how commerce flows cross application surfaces, how provider integrations are bounded, and how schema changes can be handled with explicit safety checks. The repository is still pre-release, and public usage beyond the repository itself has not been established.

## Why open source

MIT licensing lets developers inspect, adapt, experiment with, and contribute to the commerce code they choose to use. Public source also makes API boundaries, migration behavior, security decisions, and incomplete areas easier to review. Developers control their deployment choices and take responsibility for setup and production hardening. NovaStore is maintainer-led today; this README does not claim an established contributor community or customer adoption.

## Repository layout

```text
.
├── app/                    # Native Android application
├── admin-commerce-pro/     # React/Vite administration application
├── config/                 # Runtime, database, payment, and startup-safety configuration
├── controllers/            # API request handlers
├── docs/                   # Architecture, rollout, backup, and operational documentation
├── frontend/               # Customer storefront and integrated web assets
├── migrations/             # Additive and production-oriented SQL migrations
├── models/                 # Schema initialization and persistence helpers
├── routes/                 # Express routes
├── scripts/                # Maintenance, migration, verification, and CI helpers
├── services/               # Business logic and integrations
├── tests/                  # Node-based contract and smoke tests
├── LICENSE                 # MIT license
├── ROADMAP.md              # Public development direction
└── CONTRIBUTING.md         # Contributor workflow
```

## Prerequisites

For backend and web development:

- Git
- Node.js 24, the version currently used by CI
- npm
- A local PostgreSQL database for DB-backed API development

For Android development:

- JDK 21
- Android SDK with API 36 available
- Android Studio is recommended

The repository does not yet publish a broader supported-runtime compatibility matrix.

## Getting started

### 1. Clone and install backend dependencies

```bash
git clone https://github.com/Qusay90/novastore-backend.git
cd novastore-backend
npm ci
```

### 2. Configure a local environment

Copy the example environment file:

```bash
cp .env.example .env
```

On Windows PowerShell:

```powershell
Copy-Item .env.example .env
```

Create a disposable local database such as `novastore_dev`, then update at least these values in `.env`:

```dotenv
NODE_ENV=development
DATABASE_URL=postgresql://postgres:your_password@127.0.0.1:5432/novastore_dev
DB_SSL=false
NOVASTORE_SAFE_LOCAL_BACKEND=true
SKIP_SCHEMA_INIT=false
NOVASTORE_ALLOW_SCHEMA_INIT=true
CLIENT_ORIGIN=http://localhost:5000
APP_BASE_URL=http://localhost:5000
```

Set JWT_SECRET in .env to a long, randomly generated local value, and do not commit it. The startup guard intentionally blocks unsafe remote-database and production schema operations. Use only a disposable local database when initializing the schema.

### 3. Initialize and start locally

For the first local run:

```bash
npm start
```

After the local schema has been prepared, change the following values for normal development runs:

```dotenv
SKIP_SCHEMA_INIT=true
NOVASTORE_ALLOW_SCHEMA_INIT=false
```

Then start the server again:

```bash
npm run dev
```

The API listens on `http://localhost:5000` by default. Customer-facing assets are served from the same application.

## Commerce admin development

```bash
cd admin-commerce-pro
npm ci
npm run dev
```

Useful commands:

```bash
npm run build
npm test
npm run verify
```

Integrated admin artifacts are generated only through the repository's explicit build scripts. Do not hand-edit generated standalone HTML outputs.

## Android development

From the repository root, run on macOS/Linux:

```bash
./gradlew :app:testDebugUnitTest
./gradlew :app:assembleDebug
```

On Windows:

```powershell
.\gradlew.bat :app:testDebugUnitTest
.\gradlew.bat :app:assembleDebug
```

The debug APK is generated under:

```text
app/build/outputs/apk/debug/app-debug.apk
```

Release builds require signing values supplied through ignored local properties or `NOVASTORE_RELEASE_*` environment variables. Never commit keystores or signing secrets.

## Testing

Run the repository's dependency-free backend and storefront CI smoke suite:

```bash
npm test
```

Run the Commerce Pro test suite:

```bash
npm --prefix admin-commerce-pro ci
npm --prefix admin-commerce-pro test
```

Run Android unit tests:

```bash
./gradlew :app:testDebugUnitTest
```

GitHub Actions runs backend/storefront smoke tests, admin build and model tests, and Android unit tests for pull requests and pushes to `main`.

## Safe development rules

- Never point local schema-initialization commands at production or an uncontrolled remote database.
- Never commit `.env`, API keys, database credentials, payment secrets, or Android signing material.
- Treat payment callbacks, migrations, and production content changes as reviewed release operations.
- Keep generated preview artifacts and canonical source files synchronized through the provided scripts.
- Add or update tests for behavior changes before requesting review.

## Roadmap

The public development direction and its completed, in-progress, and planned work are tracked in [ROADMAP.md](ROADMAP.md).

## Release status

NovaStore has no published versioned release. A v0.1.0 release-note draft is available at [docs/release-notes-v0.1.0-draft.md](docs/release-notes-v0.1.0-draft.md); it is preparation material, not a release announcement.

## Contributing

Contributions are welcome. Start with [CONTRIBUTING.md](CONTRIBUTING.md), open an issue for substantial changes, and keep pull requests narrow, testable, and documented.

## Security

Please do not publish exploitable vulnerability details in a public issue. Follow [SECURITY.md](SECURITY.md) for responsible reporting guidance.

## Governance and project evidence

- [Code of Conduct](CODE_OF_CONDUCT.md)
- [Changelog](CHANGELOG.md)
- [Open-source program readiness evidence](docs/open-source-program-readiness.md)
- [Codex for Open Source application draft](docs/open-source-application-draft.md)

## License

NovaStore is licensed under the [MIT License](LICENSE).

## Maintainer

NovaStore is currently maintained primarily by [@Qusay90](https://github.com/Qusay90).
