# Staging release readiness

This runbook is a names-only and command-shape contract. It does not authorize a
deployment, migration, bootstrap, remote request, credential change, or rollback.
Each state-changing phase needs its own recorded approval.

## Runtime entrypoints

- Application: `npm start` -> `node server.js`
- Offline release attestation: `npm run staging:release:plan -- <expected arguments>`
- Migration plan: `npm run staging:migrate:plan`
- Migration status: `npm run staging:migrate:status`
- Migration apply: `npm run staging:migrate`
- Optional synthetic bootstrap: `npm run staging:bootstrap`
- Post-deploy read-only verification: `npm run staging:verify`

`npm start` does not run a migration or bootstrap command. The migration apply,
bootstrap, app deployment, remote verification, and rollback gates remain separate.

## Names-only environment contract

Runtime identity alternatives (exactly one):

- `RENDER_GIT_COMMIT`
- `RAILWAY_GIT_COMMIT_SHA`

Database and migration attestation names:

- `DATABASE_URL`
- `NOVASTORE_EXPECTED_DATABASE_HOST`
- `NOVASTORE_EXPECTED_DATABASE_NAME`
- `NOVASTORE_DEPLOY_ENV`
- `NOVASTORE_STAGING_MIGRATIONS_ENABLED`
- `NOVASTORE_ALLOW_REMOTE_DB`

Access and application-secret names:

- `JWT_SECRET`
- `NOVASTORE_STAGING_ACCESS_GATE_ENABLED`
- `NOVASTORE_STAGING_ACCESS_USERNAME`
- `NOVASTORE_STAGING_ACCESS_PASSWORD_HASH`
- `NOVASTORE_STAGING_ACCESS_SESSION_SECRET`

Runtime safety names:

- `NOVASTORE_STAGING_EXTERNAL_SIDE_EFFECTS_DISABLED`
- `AI_PROVIDER`
- `AI_PROVIDER_FALLBACK_ENABLED`
- `NOVASTORE_ADMIN_CATALOG_PRODUCT_WRITE_ENABLED`
- `NOVASTORE_ADMIN_CATALOG_STRUCTURE_WRITE_ENABLED`
- `NOVASTORE_ADMIN_CANCEL_WRITE_ENABLED`
- `NOVASTORE_MANUAL_FULFILLMENT_WRITE_ENABLED`
- `SKIP_SCHEMA_INIT`
- `NOVASTORE_ALLOW_SCHEMA_INIT`

Separately authorized capability names:

- `NOVASTORE_STAGING_BOOTSTRAP_ENABLED`
- `NOVASTORE_STAGING_LOCAL_TEST_ENABLED` (local disposable tests only; forbidden in a remote release)

Post-deploy verification operator names:

- `NOVASTORE_STAGING_VERIFY_TARGET`
- `NOVASTORE_STAGING_VERIFY_REMOTE_ENABLED`
- `NOVASTORE_STAGING_VERIFY_EXPECTED_HOST`
- `NOVASTORE_STAGING_VERIFY_EXPECTED_REVISION`
- `NOVASTORE_STAGING_VERIFY_USERNAME`
- `NOVASTORE_STAGING_VERIFY_PASSWORD`

The contract reports names only. It must never print values, lengths, prefixes,
fingerprints, cookies, authorization headers, or database connection strings.
For remote migration status/apply/bootstrap, the attested `DATABASE_URL` must
use `sslmode=verify-full` as its sole query option. Loopback disposable tests
retain their explicit no-TLS exception.

## Forbidden initial-staging provider credentials

- `PAYTR_MERCHANT_ID`
- `PAYTR_MERCHANT_KEY`
- `PAYTR_MERCHANT_SALT`
- `IYZICO_WEBHOOK_SECRET`
- `RESEND_API_KEY`
- `CLOUDINARY_CLOUD_NAME`
- `CLOUDINARY_API_KEY`
- `CLOUDINARY_API_SECRET`
- `GEMINI_API_KEY`
- `OPENAI_API_KEY`

Presence is a fail-closed condition, including an empty value. `DATABASE_URL`,
`JWT_SECRET`, and staging access secrets are not provider credentials.

## Release order

1. Attest the separately authorized full commit, tree, parent, subject, and clean
   checkout with the offline release plan.
2. Reconcile the primary repository, reference clone, and remote candidate without
   changing them.
3. Validate the names-only staging contract. Do not dump the environment.
4. Reject any forbidden provider credential name.
5. Confirm the access gate and external-side-effect kill switch are enabled; confirm
   all four admin write capabilities are false and legacy schema init is disabled.
6. Run the offline guarded migration plan.
7. With read-only database authorization, run guarded migration status.
8. Only with a separate database mutation approval, run guarded migration apply.
9. Only with a separate bootstrap approval, run the optional idempotent synthetic
   bootstrap.
10. Only with a separate deployment approval, release the attested app commit.
11. Only with a separate remote-UAT approval, verify live/readiness, access gate, and
    exact runtime revision.
12. Verify read-only storefront and admin documents plus unauthenticated Socket.IO
    rejection. Do not call functional mutation endpoints.
13. Complete the authorized observation window.
14. Record exactly one decision: `GO`, `HOLD`, or `ROLLBACK`.

The offline command shape is:

```text
node scripts/stagingReleasePlanCli.js --expected-head <FULL_COMMIT_SHA> --expected-tree <FULL_TREE_SHA> --expected-parent <FULL_PARENT_SHA> --expected-subject <EXACT_SUBJECT_AS_ONE_ARGUMENT>
```

Use an argument-array launcher. Do not interpolate these fields into a shell command.
The plan writes no file by default.

## Verification target guard

HTTP is permitted only for exact loopback targets. Remote verification defaults to
off and requires explicit capability, exact expected hostname, HTTPS, and public DNS
attestation. URL credentials, query strings, fragments, IP literals, cross-origin
redirects, private or loopback DNS results, and these production hosts are rejected:

- `novastore.tr`
- `www.novastore.tr`
- `novastore-backend.onrender.com`

The harness is bounded and read-only. It may exercise health, readiness, access,
version, storefront/admin documents, logout, and unauthenticated Socket.IO rejection.
It must not call payment, order, admin mutation, upload, message, notification,
webhook, Cloudinary, or AI endpoints.

## Rollback readiness

App rollback and database behavior are separate decisions.

App rollback rules:

- Roll back only to a previously verified full commit and tree.
- Keep the staging access gate enabled.
- Keep the external-side-effect kill switch enabled.
- Keep all four admin write capabilities false.
- Keep legacy schema init disabled.
- Never redirect to production and never reuse production credentials.

Database rules:

- Do not automatically reverse or drop additive migrations.
- Leave additive schema in place by default during an app rollback.
- Stop on an unknown migration ledger row, path mismatch, or checksum mismatch.
- Do not run destructive rollback SQL from this runbook.
- Keep optional synthetic bootstrap data idempotent; do not treat bootstrap as schema
  rollback.

Rollback triggers:

- live or readiness failure after the observation allowance
- runtime revision mismatch or unavailable runtime identity
- access gate bypass, missing protection, or insecure session-cookie attributes
- external-side-effect kill switch not exact enabled
- any admin write capability not exact false
- unsafe schema-init policy
- forbidden provider credential presence
- migration ledger, path, or checksum mismatch
- cross-origin redirect, unsafe DNS result, or unexpected remote target
- any functional mutation or external provider call during verification
- secret, cookie, authorization, or database-string leakage in audit output

Stop conditions:

- target commit/tree cannot be attested
- target host or database cannot be exactly attested
- migration state is unknown
- required authorization for the next phase is absent
- rollback target was not previously verified
- verification cannot distinguish staging from production

After an authorized app rollback, rerun health GET/HEAD, readiness GET/HEAD,
access-gate protection, authenticated exact revision, read-only document checks,
logout/post-logout protection, and unauthenticated Socket.IO rejection. Record a
generic PASS/FAIL audit with no response body or secret material.
