# Guarded staging migration foundation

This runner is separate from application startup and never imports or executes
`models/initDb.js`. Migration planning is offline. Status is read-only and does
not create the ledger when it is absent. Apply and synthetic bootstrap are
explicit operator commands.

## Commands

- `npm run staging:migrate:plan`
- `npm run staging:migrate:status`
- `npm run staging:migrate`
- `npm run staging:bootstrap`

## Required target attestations

Migration status/apply requires these environment key names:

- `NOVASTORE_DEPLOY_ENV`
- `NOVASTORE_STAGING_MIGRATIONS_ENABLED`
- `NOVASTORE_EXPECTED_DATABASE_HOST`
- `NOVASTORE_EXPECTED_DATABASE_NAME`
- `NOVASTORE_ALLOW_REMOTE_DB`
- `DATABASE_URL`

Bootstrap additionally requires `NOVASTORE_STAGING_BOOTSTRAP_ENABLED`.

The staging contract requires exact values for the deployment environment,
capability flags, expected host, and expected database. A remote target must be
the exact `novastore_staging` database. A local integration target is accepted
only when `NODE_ENV=test`, the host is loopback, the database has a unique
`_test` suffix, and `NOVASTORE_STAGING_LOCAL_TEST_ENABLED=true` is present.
There is no `.env`, discrete DB-variable, or remote fallback path.

## Ledger and execution model

The ordered manifest pins every raw SQL file to canonical LF bytes and an exact
SHA-256. Unknown ledger rows, path drift, and checksum drift fail closed. The
apply path holds a namespaced PostgreSQL session advisory lock. Every current
migration is classified as transactional. Files that contain their own outer
`BEGIN`/`COMMIT` wrapper are explicitly marked in the manifest; only that exact
outer wrapper is removed so the raw migration and ledger insert share one
runner-owned transaction. SQL is never split on semicolons.

There are no transaction-excluded statements in the current manifest. Any
future non-transactional migration is unsupported until a separate recovery
contract and tests are added. A non-empty schema without this ledger is never
adopted automatically. For this guard, non-empty includes public relations,
functions, and user-defined types such as enums, domains, standalone composite
types, ranges, multiranges, and base types. PostgreSQL-generated array and table
row types are not treated as independent unmanaged objects.

## Schema baseline and synthetic data

`20260628_staging_schema_baseline.sql` is immutable, schema-only, and contains
no user, credential, order, payment, notification, webhook, or provider data.
The existing ordered migrations complete the candidate schema.

Bootstrap is a separate, idempotent catalog-only operation. It creates one
deterministically identified synthetic category/product relationship and uses
an `.invalid` asset hostname. It creates no user or credential and does not
touch orders, payments, notifications, webhooks, email, Cloudinary, AI, or any
external network. It does not assume that the P4D-1B access gate or side-effect
kill switch is ready.

## Failure handling

Target guards run before the client factory is called. Connected database
identity is then checked before any schema mutation. Lock release and client
close run on success and failure. A failed transactional migration rolls back
both its schema changes and ledger insert, exits non-zero, and stops the chain.
Logs redact PostgreSQL URLs, credentials, query strings, and common secret
assignments.
