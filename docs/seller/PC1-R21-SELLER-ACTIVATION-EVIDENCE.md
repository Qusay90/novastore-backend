# PC1 R21 Seller V1 activation policy evidence

Status: local implementation evidence; no production activation or deployment.

## Source identity and boundaries

- Initial HEAD: `d3e5fdadf961429c6860f18bd1706fac23add9e7`
- Initial tree: `b4004e0856ac0902374d8c04026a05bc9bb3c4dc`
- Worktree: `pc1-r21-stocky-system-commerce`
- Production/provider/deploy/push/PR operations: `0`
- The interrupted Stocky-to-PC1 human Seller identity/session worktree was not read, copied or changed.

## Static and focused checks

The following commands passed from the worktree root:

```text
node tests/sellerApiActivationPolicySmoke.js
node tests/sellerF1NoRegressionSmoke.js
node tests/main6tCombinedIntegrationSmoke.js
node tests/startupSafetySmoke.js
node tests/productionAppConfigSmoke.js
node tests/sellerWave4AuthHttpSmoke.js
node tests/sellerF1AudienceIsolationSmoke.js
node tests/sellerF1SessionRevisionSmoke.js
node --check server.js
node --check config/sellerApiActivationPolicy.js
node --check services/runtimeDatabaseIdentityService.js
node --check middlewares/sellerTransportSecurity.js
git diff --check
```

The focused activation test covers disabled-by-default behavior, malformed and
missing configuration, local and UAT separation, production environment identity,
independent security secrets, remote database attestation/TLS, connected database
name and port mismatch, frozen runtime metadata, Supabase pooler port mapping,
unsafe broad ingress CIDRs, and HTTP rejection of a forged forwarded-HTTPS header
from an untrusted socket peer. It does not contact a remote database or public
network service.

## Disposable PostgreSQL and full-server HTTP evidence

Runtime identity: `postgres:16-bookworm`, exact disposable database
`novastore_r21_r01_test`, host-published on loopback only. The test initialized the
accepted schema/migration chain, restarted the real `server.js` with schema init
disabled, and supplied the existing local Seller flags with a named loopback target,
`NOVASTORE_SAFE_LOCAL_BACKEND=true`, remote DB capability disabled and bind host
`127.0.0.1`. Secret values were synthetic, process-local and omitted from evidence.

Observed assertions:

```text
R01_DISPOSABLE_HTTP: PASS ready=200:ready seller_unauthenticated=401:AUTH_REQUIRED
```

Listening occurred only after the Seller activation path validated the active
pool metadata and connected `current_database()`. The host-published Docker port is
expected to differ from PostgreSQL's in-container server port; local activation
therefore pins the configured pool metadata and connected database name. Remote
UAT/production additionally require the connected server port to match the attested
target, with the existing Supabase transaction-pooler `6543 -> 5432` exception.
The server process was stopped and the `--rm` disposable container was removed.

## Environment-dependent checks

`node tests/runtimeIdentitySmoke.js` produced `68 PASS / 2 FAIL`; both failures were
the harness's mandatory real-DB checks because `P4B1_DATABASE_URL` was absent from
that invocation. `node tests/authSessionRevocationSmoke.js` stopped before work
because its mandatory `P4B_AUTH_DATABASE_URL` was absent. These are external test
environment gates, not waived passes. The R01 disposable full-server check above
used its own isolated database and did not claim those unrelated harnesses passed.

## Result

- `ACCIDENTAL_PRODUCTION_MOUNT: 0` in the focused policy/HTTP matrix.
- `LOCAL_ONLY_GUARD_BLINDLY_REMOVED: 0`; legacy local activation is retained only
  for the exact existing local flag combination and stricter runtime identity check.
- `R01_PRODUCTION_POLICY: PASS` for implementation and local evidence.
- `PRODUCTION_ACTIVATION: NOT_DONE`.
