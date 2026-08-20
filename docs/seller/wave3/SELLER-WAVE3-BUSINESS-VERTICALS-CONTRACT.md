# Seller Wave 3 — İş Dikeyleri Uygulama Sözleşmesi

## Durum, kaynak ve sınır

- Durum: `EXECUTION_CONTRACT`; yalnız `SELLER-ACCELERATED-WAVE-3-BACKEND-BUSINESS-VERTICALS-COMPLETION` yetkisinde kullanılabilir.
- Başlangıç: `903f78d75a2d3b448c86e5b48541dc1fe798d5eb` ve kabul edilen F0A/F0B/F1 temeli.
- Üst kaynaklar: `ADR-0001-SELLER-BOUNDARY.md`, `SCREEN-BACKEND-MATRIX.tsv`, `SELLER-API-V1.md`, additive-migration planı ve `PHASE-GATES.md`.
- Bu makro dalga, tarihsel ekran fazı adı değildir. F3, F4, F5, F6, F12 ve F13'ün yalnız aşağıdaki backend yüzeylerini, tek ve denetlenebilir bir allowlist altında birleştirir.

Her yeni yüzey `/api/seller/v1` altında seller audience, canlı seller session, aktif membership, sunucu-çözülmüş organization/store kapsamı ve bilinmeyen izin için deny kuralını zorunlu kılar. İstemci `organization_id`, `store_id`, rol, toplam, fiyat veya ödeme tutarı otoritesi değildir. Cross-tenant, silinmiş ve olmayan kaynaklar aynı güvenli `RESOURCE_NOT_FOUND` yanıtını verir. Admin/customer yetkilendirmesi kullanılmaz.

## Exact vertical scope

| Dikey | Kapsanan seller yüzeyi | Otorite ve durum |
| --- | --- | --- |
| Mağaza | `GET/PATCH /stores/{storeId}` | `seller_stores` binding'i ve `seller_store_profiles`; yalnız allowlist profil/politika alanları; status/contact değişikliği step-up olmadan reddedilir. |
| Katalog/teklif/envanter | `GET/POST/PATCH /offers`, offer command/batch command, `GET /inventory`, adjustment ve threshold | Global `products` kimliği yalnız okunur. Seller-owned `seller_offers`, variants ve inventory ayrı tutulur; media route yoktur. |
| Sipariş/fulfillment/iade görünümü | `GET /orders`, `GET /orders/{id}`, order command, `GET /returns` | Canonical `orders` referansını değiştirmeyen seller allocation/item/package shadow modeli. `prepare`, `ship`, `cancel_request` kapalı state-machine komutlarıdır. Return kabul/ret ve refund para hareketi uygulanmaz. |
| Finans | `GET /dashboard`, `/finance/summary`, `/finance/ledger`, `/finance/settlements` | Append-only `seller_ledger_entries` kaynak gerçeğidir. Summary server-side exact minor-unit toplamlarından türetilir. Settlement yalnız readiness/read modelidir. |
| Destek | `GET/POST /support/conversations`, `POST /support/messages`, `POST /support/conversations/{id}/rating` | Yeni organization/store-scoped support conversation/message/rating kayıtları; internal note hiçbir response'a girmez. |

API router varsayılan kapalıdır. Yüzey ayrıca `SELLER_OFFER_WRITE_ENABLED=false`, `SELLER_ORDER_WRITE_ENABLED=false` ve `SELLER_FINANCE_READ_ENABLED=false` koşullarını fail-closed uygular. Bu dalga flag açma, canlı token issuer, Android, provider, staging veya production migration yapmaz.

## Data and transaction invariants

1. `users.id` `INTEGER`, legacy `stores.id` `BIGINT`, `products.id`, `orders.id` ve `returns.id` `INTEGER` dış FK türleriyle aynı kalır.
2. Yeni tenant kaydı `organization_id` ve gerekli yerde `store_id` taşır; composite organization/store FK'leri cross-store bağları reddeder.
3. Money `BIGINT` minor unit + üç harfli currency ile tutulur. Float, client-calculated total ve cross-currency aggregate reddedilir.
4. Offer/inventory/sipariş/support mutation'ı `business row + append-only audit + immutable outbox` olarak tek transaction'dır. Hata üçünü de rollback eder.
5. Mutable aggregate revision ile compare-and-set yapılır. İş-etkili command `Idempotency-Key` ister; aynı key/farklı fingerprint güvenli conflict, aynı fingerprint ise önceki sonucu verir.
6. Stock absolute veya delta adjustment'i mevcut revision üzerinde kilitlidir; negative stock/backorder reddedilir. Movement history append-only'dir.
7. Offer status transition'ları `draft -> active|archived`, `active -> inactive|archived`, `inactive -> active|archived` ile sınırlıdır. Package transition'ları `pending -> prepared -> shipped`; cancellation yalnız `new|preparing -> cancellation_requested` olabilir.
8. Ledger, audit, outbox ve transition kayıtları update/delete trigger'ı ile korunur. Ledger source event'i yalnız bir kez post edilir. Finans read modeli currency bazında reconciled değildir ise `RECONCILIATION_BLOCKED` verir.
9. Her API strict body/query/path allowlist ve bounded pagination uygular. Sensitive token, credential, adres, banka, provider raw payload ve support internal note response/audit/outbox'a alınmaz.

## API surface and permissions

| Route family | Permission | Mutability | Gate |
| --- | --- | --- | --- |
| Store read/update | `store.read`, `store.update` | revision + idempotency | seller API; protected field step-up |
| Offer read/create/update/command/batch | `offer.read`, `offer.create`, `offer.update`, command-specific `offer.publish`/`offer.archive` | revision + idempotency | `SELLER_OFFER_WRITE_ENABLED` |
| Inventory read/adjust/threshold | `inventory.read`, `inventory.adjust`, `inventory.threshold.update` | revision + idempotency | `SELLER_OFFER_WRITE_ENABLED` |
| Order/return read, package command | `order.read`, `order.prepare`, `order.ship`, `order.cancel.respond`, `return.read` | revision + idempotency | reads seller API, commands `SELLER_ORDER_WRITE_ENABLED` |
| Dashboard/finance/ledger/settlements | `dashboard.read`, `finance.read`, `settlement.read` | read-only | `SELLER_FINANCE_READ_ENABLED` |
| Support | `support.read`, `support.create`, `support.message`, `support.rate` | revision + idempotency for writes | seller API; no provider |

## Explicit exclusions and combined owner decision gate

- Offer/store media upload, canonical product/category mutation, legacy product `store_id` reinterpretation, external visibility and bulk operations beyond the listed atomic commands are excluded.
- Full customer address disclosure remains `DG-004` blocked; seller order detail supplies no address, phone, email, payment instrument or raw provider data.
- Seller return `accept|contest`, refund amount mutation, payout-account setup and payout initiation/release remain unsupported. Default behavior is `CAPABILITY_DISABLED`/`RETURN_DECISION_UNSUPPORTED`; no policy is invented.
- Negative stock/backorders remain denied. Cross-currency finance aggregation remains denied. No automated historic order/product backfill occurs; only synthetic, explicitly inserted allocation fixtures are used in disposable DB proof.
- Android/theme, customer/admin route changes, socket activation, remote service, credentials, production/staging DB and flag activation are excluded.

## Forward recovery and evidence

The migration is additive, timestamped, checksum-registered and never carried by runtime schema initialization. Fresh apply, second apply, intentional failed transaction rollback and cleanup execute only against an explicitly opted-in disposable loopback PostgreSQL database named with the Wave 3 prefix. Any future defect is corrected by an additive migration, reversal/compensating ledger entry or superseding allocation/settlement; no historical seller event is edited or deleted.

The required evidence is the allowlisted contract/static, service, route/flag and real PostgreSQL tests. The migration test proves types, foreign keys, constraints, indexes, append-only triggers, cross-tenant denials, idempotency, inventory concurrency, order transition race, ledger reconciliation and cleanup.
