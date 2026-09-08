# A14 Admin follow-up

ADMIN_VARIANT_HANDOFF_REQUIRED: YES. No broad Admin UI or new Admin variant write authority is introduced.

Existing Admin product writes must not replace aggregate variant price/stock. The canonical Admin catalog service rejects these edits with `VARIANT_MODE_REQUIRES_VARIANT_WRITE` (409). Product metadata/media remains under existing Admin permissions and revision rules. Public detail exposes safe variants; this is not an Admin variant management endpoint.

A separately authorized Admin lane must define its own current-admin permission/receipt/audit contract for variant management, reuse the same canonical tables and exact identity/ownership checks, and design UI around complete variants and available stock. Do not impersonate Seller sessions, use raw SQL from the UI, or introduce a second price/inventory table. Until that lane, canonical Seller-owned variant management is through the authenticated scoped Seller endpoints documented in the S01 handoff.
