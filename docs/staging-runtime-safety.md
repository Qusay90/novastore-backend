# Staging runtime safety

The staging application starts only when the perimeter gate, external side-effect
kill-switch, admin write seals, AI mock mode, and schema-init guard are all
explicitly configured. No credential values belong in this repository.

## Required runtime keys

- `NOVASTORE_DEPLOY_ENV=staging`
- `NOVASTORE_STAGING_ACCESS_GATE_ENABLED=true`
- `NOVASTORE_STAGING_ACCESS_USERNAME`
- `NOVASTORE_STAGING_ACCESS_PASSWORD_HASH`
- `NOVASTORE_STAGING_ACCESS_SESSION_SECRET`
- `NOVASTORE_STAGING_EXTERNAL_SIDE_EFFECTS_DISABLED=true`
- `NOVASTORE_ADMIN_CATALOG_PRODUCT_WRITE_ENABLED=false`
- `NOVASTORE_ADMIN_CATALOG_STRUCTURE_WRITE_ENABLED=false`
- `NOVASTORE_ADMIN_CANCEL_WRITE_ENABLED=false`
- `NOVASTORE_MANUAL_FULFILLMENT_WRITE_ENABLED=false`
- `AI_PROVIDER=mock`
- `AI_PROVIDER_FALLBACK_ENABLED=false`
- `SKIP_SCHEMA_INIT=true`
- `NOVASTORE_ALLOW_SCHEMA_INIT=false`

The staging access session secret must be independent from `JWT_SECRET`. The
password hash accepts only the bounded bcrypt format enforced by the runtime.
Credential generation and secret setup are separate, explicitly authorized
operations.

## Initial foundation omissions

The initial staging foundation rejects the presence of these provider credential
keys without inspecting or reporting their values:

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

`DATABASE_URL`, `JWT_SECRET`, and the staging access keys are not provider
credentials and are not part of that denylist.

## Perimeter routes

- `GET /_staging/access`
- `POST /_staging/access`
- `POST /_staging/logout`
- unauthenticated `GET` and `HEAD` for `/api/health/live`
- unauthenticated `GET` and `HEAD` for `/api/health/ready`

All other storefront, static, admin, API, upload, Socket.IO, and functional paths
require the signed staging perimeter cookie. This cookie is separate from the
NovaStore Bearer/JWT account session.

## External side-effect classes

- `payment_initialize`
- `payment_capture`
- `payment_refund`
- `email`
- `sms_or_push`
- `outbound_notification`
- `outbound_webhook`
- `cloudinary_write`
- `cloudinary_delete`
- `external_ai`

The global staging kill-switch is mandatory and cannot itself authorize a future
provider UAT. Each future provider activation requires a separate code, config,
credential, and approval gate.

## Schema ownership

Application startup never runs migrations or bootstrap. Staging schema changes
remain owned by the guarded migration runner and pre-deploy flow. Legacy schema
initializers are not imported when staging starts.
