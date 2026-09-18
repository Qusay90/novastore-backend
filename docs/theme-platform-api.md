# Theme Platform Wave 1 API

This document describes the implemented foundation, not a deployment approval. The accepted scope and ownership are in [the frozen contract](theme-platform-wave-1-contract.md). The backend is the source of truth for catalog versions, seller services, assignments, overrides, entitlements, operations, and publication requests. Existing commerce services remain authoritative for product availability, prices, inventory, orders, payments, and shipment state.

## Setup and authority

1. Use the approved Wave 1 checkout and review the additive migration and its registry entry. Route activation never applies migrations. An owner-authorized migration workflow is required for any persistent environment; this document contains no production apply instructions.
2. Keep `NOVASTORE_THEME_PLATFORM_ENABLED=false` until the chosen environment has the reviewed schema and explicit access provisioning. The flag defaults off. Enabled routes still require live authentication and authorization; it does not publish a theme.
3. Reuse an existing Admin session or the existing Seller issuer/audience/session flow. Seller routes additionally depend on existing `SELLER_API_V1_ENABLED` activation policy and transport checks. Do not weaken local/remote database identity or secure-transport gates to enable this module.
4. Provision Theme Platform roles only through an owner-authorized database administration workflow. This wave has no role-management HTTP endpoint and seeds no account as an administrator. `theme_admin_roles.user_id` references an existing user who must still be a current enabled Admin. An existing Admin does not automatically become `super_admin`.
5. Seller services reference existing `seller_organizations.id` and **`seller_stores.id`**, not legacy commerce `stores.id`. The service resolves the organization and optional Stocky connection binding from the selected seller store. Requests cannot provide organization, membership, external binding, role, or permission authority.

Explicit Seller bindings use `(organization_id, membership_id)` in `theme_seller_roles`. A live global system `owner` may fall back to `seller_owner` only when no explicit binding exists. An inactive binding denies this fallback. Membership status, session status/expiry, security stamp, membership revision, organization, and assigned store scopes are rechecked from the database. Stocky tokens, HMAC assertions, and REP credentials are not Seller Theme Platform authentication.

The [authorization adapter](theme-platform-auth.md) documents transaction and role details. Code authority is [the role matrix](../services/themePlatformAuthService.js), [route registration](../routes/themePlatformRoutes.js), [service rules](../services/themePlatformService.js), [validators](../services/themePlatformValidation.js), and [schema](../migrations/20260918_01_theme_platform_foundation.sql). These describe backend controls; frontend role labels are not authorization proof.

## Roles and feature decisions

| Role | Implemented scope |
|---|---|
| `super_admin` | All enumerated Theme Platform permissions. |
| `theme_admin` | Catalog/version creation, assignment management/acceptance, metadata reads, draft/preview reads and preview creation, operation/audit reads. Service and entitlement governance are excluded. HTTP exposure remains limited to the Admin routes below. |
| `support` | Catalog, service metadata, and audit reads; no writes or seller draft access. |
| `seller_owner` | Scoped reads, assignment acceptance, draft editing, asset registration, preview, publication and rollback requests; entitlement read. |
| `seller_admin`, `seller_editor` | Scoped reads, assignment acceptance, editing, asset registration and preview. Publication and rollback require explicit boolean `publish_allowed=true`. |
| `seller_viewer` | Scoped read permissions only. `publish_allowed` cannot grant writes or assignment acceptance. |

Authorization uses explicit action names rather than a wildcard. Permissions alone do not enable a feature: Seller operations also need an active service within its database-time window, the matching store scope, applicable feature grants, and any relevant quota. Admin service/entitlement governance can inspect or change inactive services so they can be administered.

| Feature | Basic default | Pro default | Current use |
|---|---|---|---|
| `theme.editor` | Allow | Allow | Draft access/edit, preview, asset registration, publication requests and artifact reads. |
| `theme.asset_bytes` | 5 MiB | 50 MiB | Asset metadata quota; non-rejected registrations consume capacity. |
| `theme.publish` | Deny | Allow | Publication reads/requests and rollback requests. |
| `theme.mobile_customization` | Deny | Allow | Access/edit/preview/publication of `app` assignment artifacts. |
| `theme.advanced_blocks` | Deny | Allow | Campaign component overrides. |
| `theme.custom_header` | Deny | Allow | Header component overrides. |
| `theme.collaboration` | Deny | Allow | Catalog decision only; no collaboration workflow in this wave. |
| `theme.custom_css`, `theme.ai_builder` | Disabled | Disabled | No custom code or AI builder endpoint. |

Unknown or disabled features deny. An effective explicit `DENY`, including a plan default deny, wins over an allow; a per-service allow cannot override a plan deny ceiling. Entitlement windows use database UTC time. `/capabilities` returns decisions and the caller's current permissions; it is not a token authorizing later actions.

## Common HTTP contract

Admin prefix: `/api/admin/theme-platform`. Seller prefix: `/api/seller/v1/theme-platform`. There are **31 method/path entries: 16 Admin and 15 Seller**.

Use the existing `Authorization: Bearer <CURRENT_ADMIN_OR_SELLER_ACCESS_TOKEN>` header; the placeholder is not a usable token. No new login endpoint is added. JSON mutations require `Content-Type: application/json` and `Idempotency-Key` containing 8–128 characters from letters, digits, `.`, `_`, `:`, or `-`.

Every mutation body requires a nonempty `reason` of at most 240 characters. Keep it a short operational reason, never a password, token, draft body, or customer information. Bodies reject unknown fields; every field listed below is required, including explicit `null` for nullable dates/quotas. Revisions are positive integer JSON numbers. When an endpoint requires `expectedRevision`, optional `If-Match` must be exactly the same quoted integer, for example `"3"`. An `If-Match` header is rejected on mutations without `expectedRevision`.

All routes reject query parameters. Lists are bounded to 200 rows; version summaries to 100. There is no pagination/filter query API in this wave. Responses use `Cache-Control: private, no-store` and `X-Content-Type-Options: nosniff`.

Mutation success is HTTP 200 with `{ "operationId": "<UUID>", "status": "COMPLETED|REQUESTED|BLOCKED", "result": {} }`; inspect the actual `status` and result. Reads return the resource, array, or named capability/entitlement result directly. JSON property values from database rows generally use the schema's snake_case names. Failure is `{ "code": "THEME_..." }` with 400/401/403/404/409/410/413 or sanitized 503. Existing authentication middleware retains its existing error contract. Foreign and nonexistent resource IDs both return `THEME_RESOURCE_NOT_FOUND` from the Theme Platform service.

Same key, actor, scope, and canonical request returns the saved operation when current authorization and resource guards still permit it. Reusing the key with a changed request returns 409. Revoked sessions/roles, withdrawn assignments, expired previews, or revoked feature grants do not become valid because an old request succeeded. A stale write returns 409; fetch current state and deliberately resolve the conflict before creating a new command. Retryable database conflicts roll back the whole transaction.

## Admin routes

Body columns omit the mandatory `reason`. `service fields` means all of `plan`, `status`, `startsAt`, and `expiresAt`. Plans are `basic|pro`; service states are `ACTIVE|SUSPENDED|REVOKED`; dates use UTC ISO 8601 strings, with `expiresAt` nullable.

| Method | Relative path | Permission | Body / result |
|---|---|---|---|
| GET | `/themes` | `catalog.read` | Catalog metadata list. |
| POST | `/themes` | `catalog.write` | `slug`, `name`; creates a catalog theme. |
| GET | `/themes/:themeId` | `catalog.read` | Theme plus version summaries. |
| POST | `/themes/:themeId/versions` | `version.create` | `version`, `document`, `status` (`DRAFT|PUBLISHED`). |
| GET | `/versions/:versionId` | `catalog.read` | Base version document and metadata. |
| POST | `/versions/:versionId/publish` | `version.create` | `expectedRevision`; only a DRAFT base version may transition to PUBLISHED. |
| GET | `/services` | `service.read` | Seller service metadata list. |
| POST | `/services` | `service.manage` | Integer `storeId` plus service fields; resolves server ownership/binding. |
| GET | `/services/:serviceId` | `service.read` | Service metadata. |
| PATCH | `/services/:serviceId` | `service.manage` | `expectedRevision` plus all service fields; this is not a partial-field patch. |
| POST | `/services/:serviceId/assignments` | `assignment.manage` | `themeVersionId`, `channel` (`web|app`); creates assignment, draft, and initial revision. |
| POST | `/assignments/:assignmentId/withdraw` | `assignment.manage` | `expectedRevision`; withdraws the assignment. |
| GET | `/services/:serviceId/entitlements` | `entitlement.read` | `policyRevision` and explicit entitlement `items`. |
| PUT | `/services/:serviceId/entitlements/:featureCode` | `entitlement.manage` | `expectedRevision`, `effect` (`ALLOW|DENY`), `quota`, `startsAt`, `expiresAt`; revision is the service's **policy_revision**. |
| GET | `/operations/:operationId` | `operation.read` + original action | Operation status/result; current original-action authority is rechecked. |
| GET | `/services/:serviceId/audit` | `audit.read` | Bounded append-only audit metadata. |

There is no catalog delete, arbitrary base-document update, role-management, public preview, deployment promotion, or outbox delivery endpoint.

## Seller routes

Paths below are relative to the Seller prefix. All resource access is scoped to the live membership's assigned active stores. A Seller list returns assigned active, unexpired services' non-withdrawn assignments, including `draft_id`.

| Method | Relative path | Permission | Body / additional guard |
|---|---|---|---|
| GET | `/assignments` | `assignment.read` | Scoped assignment list. |
| GET | `/assignments/:assignmentId` | `assignment.read` | Assignment must not be withdrawn. |
| POST | `/assignments/:assignmentId/accept` | `assignment.accept` | `expectedRevision`; viewer is denied. |
| GET | `/services/:serviceId/capabilities` | `assignment.read` | Current role, permissions, policy revision, and feature decisions. |
| GET | `/services/:serviceId/entitlements` | `entitlement.read` | Seller owner only under the current role matrix; explicit entitlement list. |
| GET | `/drafts/:draftId` | `draft.read` | Editor/channel/override/asset grants are rechecked. |
| PUT | `/drafts/:draftId` | `draft.edit` | `expectedRevision`, `overrides`; saves a new immutable revision. |
| POST | `/drafts/:draftId/previews` | `preview.create` | `expectedRevision`; creates authenticated artifact metadata. |
| GET | `/previews/:previewId` | `preview.read` | Current grants, READY state, policy revision, and 15-minute expiry. |
| POST | `/services/:serviceId/assets` | `asset.register` | `bytesBase64`; editor and asset-byte quota checks. |
| GET | `/assets/:assetId` | `asset.read` | Metadata only; current asset-byte grant check. |
| POST | `/drafts/:draftId/publications` | `publication.request` | `expectedRevision`; publish/editor/channel/override/asset guards. |
| GET | `/publications/:publicationId` | `publication.read` | Publication metadata/artifact; current grants checked against the saved draft snapshot. |
| POST | `/publications/:publicationId/rollback` | `rollback.request` | Only `reason`; records a BLOCKED request until a verified deployment exists. |
| GET | `/operations/:operationId` | `operation.read` + original action | Own actor's operation only; current original-action and stored-resource guards apply. |

## JSON command examples

Paths containing `<..._ID>` are placeholders for returned UUIDs. The illustrative store integer `1001` must be replaced with an existing authorized **seller store** ID; no record or role is created by these examples. Each separate mutation needs its own idempotency key, except a deliberate identical retry. Obtain real access tokens through existing login/session flows; do not copy credentials into this document.

Create a base theme with `POST /api/admin/theme-platform/themes`:

```json
{"slug":"example-theme","name":"Example theme","reason":"Create reviewed base theme"}
```

Create a version with `POST /api/admin/theme-platform/themes/<THEME_ID>/versions`:

```json
{
  "version": "1.0.0",
  "status": "PUBLISHED",
  "document": {
    "schemaVersion": 1,
    "tokens": {"accent":"#2457D6","fontFamily":"system"},
    "components": [{"id":"welcome","type":"text","props":{"title":"Welcome","text":"Store introduction"}}],
    "assetIds": []
  },
  "reason": "Register reviewed base version"
}
```

`PUBLISHED` here seals a base document; it does not make a seller storefront live. Published base versions cannot be changed or deleted.

Create a seller service with `POST /api/admin/theme-platform/services`:

```json
{"storeId":1001,"plan":"pro","status":"ACTIVE","startsAt":"2026-01-01T00:00:00.000Z","expiresAt":null,"reason":"Enable approved seller theme service"}
```

Assign the returned version with `POST /api/admin/theme-platform/services/<SERVICE_ID>/assignments`:

```json
{"themeVersionId":"<VERSION_ID>","channel":"web","reason":"Assign reviewed web theme"}
```

Accept with `POST /api/seller/v1/theme-platform/assignments/<ASSIGNMENT_ID>/accept`, replacing `1` with the current assignment revision:

```json
{"expectedRevision":1,"reason":"Accept assigned theme"}
```

Save overrides with `PUT /api/seller/v1/theme-platform/drafts/<DRAFT_ID>`, using the current draft revision:

```json
{
  "expectedRevision": 1,
  "overrides": {
    "tokens": {"accent":"#126B43"},
    "components": [{"componentId":"welcome","props":{"title":"Our store"},"hidden":false,"order":0}],
    "assetIds": []
  },
  "reason": "Update welcome heading"
}
```

Create a preview using the revision returned by save with `POST /api/seller/v1/theme-platform/drafts/<DRAFT_ID>/previews`:

```json
{"expectedRevision":2,"reason":"Review saved theme draft"}
```

Request publication with `POST /api/seller/v1/theme-platform/drafts/<DRAFT_ID>/publications`:

```json
{"expectedRevision":2,"reason":"Request publication of reviewed draft"}
```

The returned operation is `REQUESTED` and its publication is `PUBLICATION_REQUESTED`. Neither means LIVE or delivered. A rollback request to `/api/seller/v1/theme-platform/publications/<PUBLICATION_ID>/rollback` has body:

```json
{"reason":"Request return to a verified deployment"}
```

It records `BLOCKED` with `THEME_VERIFIED_DEPLOYMENT_REQUIRED` and `livePointerChanged:false`.

An explicit entitlement change uses `PUT /api/admin/theme-platform/services/<SERVICE_ID>/entitlements/theme.editor`, with the **current policy revision**:

```json
{"expectedRevision":1,"effect":"DENY","quota":null,"startsAt":"2026-01-01T00:00:00.000Z","expiresAt":null,"reason":"Suspend theme editing entitlement"}
```

## Documents, assets, and states

Base documents and overrides are bounded to 100,000 canonical JSON bytes. Base documents have 1–100 components; overrides have up to 100 references to existing stable component IDs. The validator defines all permitted tokens, component types, properties, ID bounds, and internal navigation targets. HTML/CSS/JS fields, remote URLs, inline code, and client-owned commerce values are not accepted. Base packaged asset paths are restricted to `theme-assets/<group>/<name>.(png|webp|jpg)`; seller asset UUIDs are not allowed in base documents.

Asset registration accepts at most 512 KiB of decoded base64. It detects PNG/JPEG/WebP signatures and computes MIME, byte size, digest, and storage key on the server. Signature detection is not decoding or malware scanning. The result is **QUARANTINED**, with `storageReady:false`: upload bytes are not persisted by a storage adapter in this wave. There is no asset download or READY-promotion endpoint. Only already READY, same-service assets may be referenced by drafts; a later trusted storage/scanning adapter must provide that authority.

Assignments move `ASSIGNED → ACCEPTED` or `ASSIGNED/ACCEPTED → WITHDRAWN`; only one non-withdrawn assignment per service/channel exists. Acceptance does not publish. Saves increment draft revision and append immutable revision history. Preview artifact metadata is READY for 15 minutes and remains authenticated; it is not a public URL or native-app build. Publication requests persist an immutable artifact snapshot and an operation, audit event, and outbox event atomically. The outbox has no delivery worker in this wave. The inbox is an internal persistence primitive with no HTTP receiver or verified delivery claim.

No Stocky network transport, legal approval, domain/DNS provisioning, deployment pointer promotion, storefront renderer integration, native Android delivery, or Admin/Studio UI adapter is implemented here. Those require separate contracts and validation. Existing variant cart limitations are documented in [the deferred commerce plan](theme-platform-variant-cart.md); Theme Platform does not fix or certify them.

## Local verification

Packaged asset keys are syntax-checked only; they are not yet resolved against a
verified package manifest. Product/category IDs and internal targets are typed
references, not validated commerce bindings. Before a later renderer consumes an
artifact, it must resolve those references against the service's server-owned
commerce store mapping and reject foreign, unavailable or missing entries. This
API returns no product/customer data through those references. An artifact with a
digest or `READY` preview metadata does not certify a renderable or live store.

`npm run test:theme-platform:unit` runs focused authorization and validator tests. `npm run test:theme-platform:integration` creates its own disposable loopback PostgreSQL fixture with the existing migration registry and real signed Admin/Seller sessions; Docker and the expected local PostgreSQL image must already be available. The harness does not accept a production database URL, does not deliver provider requests, and tears down its own fixture.

Tests and review evidence do not authorize production migration, account-role provisioning, runtime activation, publication, or deployment. Follow the separately accepted environment and owner gates for those actions.
