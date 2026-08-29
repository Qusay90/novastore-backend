# Customer Android R10 — PC1 Customer Refresh Handoff

## Status and authority

- `R10_HANDOFF: READY`
- PC1 branch: `codex/pc1-auth-r1-customer-refresh`
- Refresh implementation commit: `232dae1b88c44776c3c5c64b446da7a841de0c2e`
- Refresh implementation tree: `61633b882e44e825fc301dd52f527670ebdf8ce4`
- Migration: `20260829_01_customer_refresh_rotation`
- Migration SHA-256: `67977980f37ea2fa37de3ae84334c6f4a18ebc28892cf233f0715e9768aa94c3`
- Intended Customer Android R10 consumer HEAD: `3a0ab812b0b82f6b9a0e1e6fbacb12137a3108e7`
- Intended Customer Android R10 consumer tree: `bfa05a06fe30b72115fb52386b7188e0bc13b2bc`

The existing `auth_sessions` row remains the session authority. `auth_refresh_tokens` is its hashed, Customer-only rotation registry; it is not a second identity store or an Android-only authority. Profile truth remains `GET /api/users/me`.

## Login response delta

The existing `POST /api/users/login` response remains backward compatible: the access credential is still returned as `token`. It now also returns:

- `refreshToken`: opaque Customer refresh credential;
- `accessExpiresAt`: ISO-8601 timestamp;
- `refreshExpiresAt`: ISO-8601 timestamp;
- `sessionId`: positive integer.

The login response continues to contain `user`, but the client must still verify authenticated private state with `GET /api/users/me`.

## Refresh endpoint

- Method and route: `POST /api/users/refresh`
- Transport: HTTPS JSON outside local development, `Content-Type: application/json`
- Access-token header: not required for this endpoint
- Request body allowlist: exactly `refreshToken` and `sessionId`; never send `userId`, profile, role, or another identity selector
- Current route throttle: 30 requests per minute per process/IP/path

Request:

```json
{
  "refreshToken": "<opaque refresh credential>",
  "sessionId": 123
}
```

Successful `200` response:

```json
{
  "accessToken": "<new bearer access token>",
  "refreshToken": "<new opaque refresh credential>",
  "tokenType": "Bearer",
  "accessExpiresAt": "<ISO-8601 timestamp>",
  "refreshExpiresAt": "<ISO-8601 timestamp>",
  "sessionId": 123
}
```

The refresh response deliberately contains no `user` object. Note the naming difference: login returns the access credential as `token`; refresh returns it as `accessToken`.

## Lifetime, identity, and rotation

- Customer access lifetime is currently 30 days.
- Refresh lifetime is an absolute 90 days from login; rotation does not extend that deadline.
- A renewed access lifetime is capped by the remaining refresh lifetime.
- Refresh works after the old access token expires, provided the refresh credential is still active and unexpired.
- The same Customer ID and the same `auth_sessions.id` are retained.
- A successful refresh replaces the session JTI, so the previous access token immediately stops working.
- The presented refresh token becomes `rotated`; its replacement is the only active generation.
- Reusing a rotated token is treated as replay and revokes the session plus its active replacement.
- Customer A can never become Customer B. Seller and Admin credentials cannot become Customer credentials.

## Mandatory Android replacement rule

Implement refresh as a single-flight operation guarded by the client session generation:

1. Allow only one refresh request for the current session at a time.
2. On `200`, atomically replace the access token, refresh token, both expiry values, and session ID before releasing waiting requests.
3. Never retry or reuse the old refresh token after a successful response.
4. Never allow a late `401` from an older duplicate request to clear a newer successful session generation.
5. Never log, print, crash-report, or analytics-report either credential.

These are correctness requirements, not optional hardening: duplicate reuse intentionally revokes the refresh family.

## Bootstrap sequence

After login or successful refresh:

1. Persist the complete credential set atomically in Android secure local storage.
2. Call `GET /api/users/me` with `Authorization: Bearer <new accessToken>`.
3. Accept authenticated private state only after `/api/users/me` returns `200` for a Customer.
4. Use `/api/users/me` as the profile/identity source; never infer identity from refresh input or response.

## Failure behavior

| HTTP | Public code | Meaning and client action |
|---|---|---|
| `400` | `AUTH_REFRESH_REQUEST_INVALID` | Invalid JSON envelope or unknown/extra field. Do not retry unchanged input. |
| `401` | `AUTH_REFRESH_REJECTED` | Missing, malformed, wrong-session, expired, revoked, replayed, or otherwise invalid credential. Clear the matching session generation and require normal login. |
| `403` | `AUTH_CUSTOMER_ACCOUNT_INACTIVE` | The Customer account/role is no longer active. Clear the matching session generation and require normal login. |
| `503` | `AUTH_SESSION_STATE_UNAVAILABLE` | Temporary PC1 session-state failure. Do not invent identity or fall back to cached private state; preserve the current generation for a bounded later retry. |

Credential-related `401` responses use the generic message `Invalid or expired token.` and never echo the supplied credential.

## Logout, account changes, and notification devices

- `POST /api/users/logout` revokes the current `auth_sessions` row and its active Customer refresh token.
- `POST /api/users/logout-all` also revokes access-expired sessions that still have live refresh credentials.
- Password change, role change, account disable, explicit session revocation, refresh expiry, and replay revoke the linked refresh authority.
- PC1 session revocation also revokes linked Android push endpoints; valid rotation keeps the same session/device binding.
- Preserve the accepted R9 device-logout sequence. Backend revocation remains a fail-safe even when the client already unregisters its current device endpoint.
- Any refresh attempt after logout/revocation is rejected.

## R10 receiver checklist

- Add exactly `POST /api/users/refresh` to the Android bridge/network allowlist.
- Parse the login additions and the exact refresh response names above.
- Use single-flight refresh plus atomic, generation-guarded credential replacement.
- Bootstrap identity through `/api/users/me` after renewal.
- Preserve R9 notification endpoint revocation and logout behavior.
- Add no Android-selected user ID, parallel identity cache, fallback profile authority, or credential logging.

## Verification evidence and scope boundary

- `tests/customerRefreshContractSmoke.js`: route/body/response contract, hash-domain separation, rotation, safe failures, and no raw refresh token in SQL parameters.
- `tests/customerRefreshPostgresSmoke.js`: login and `/me`, access-expiry renewal, absolute refresh expiry, logout/logout-all, single-use rotation/replay, Customer A/B isolation, Admin/Seller rejection, runtime log redaction, and Android endpoint linkage/revocation.
- `tests/authSessionMigrationSmoke.js`: schema, constraints, indexes, triggers, idempotent application, and Customer-only binding.
- `tests/webCustomerLogoutSmoke.mjs` and `tests/legacyLogoutRevocationSmoke.js`: existing Customer Web compatibility.
- `tests/notificationCorePostgresSmoke.js` and `tests/androidFcmProviderUnitSmoke.js`: Android notification/device logout regression.

This PC1 lane does not modify Customer Android, start FCM UAT, push, create/update a PR, merge, or deploy.

`R10_HANDOFF: READY`
