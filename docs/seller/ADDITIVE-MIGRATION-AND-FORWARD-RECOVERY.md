# Seller Additive Migration ve Forward-Recovery Planı

## Belge durumu

- Durum: `PLAN_ONLY`
- Faz: `F0A`
- SQL: Yok
- Migration/DB bağlantısı: Yok
- Uygulama yetkisi: Yok

Bu belge gelecekteki ayrı onaylı fazlar için veri değişim sırasını dondurur. Mevcut customer/admin davranışını değiştirmez.

## 1. Migration ilkeleri

1. İlk seller schema değişiklikleri additive-only olur.
2. Mevcut tablo/kolon yeniden adlandırılmaz, silinmez ve anlamı değiştirilmez.
3. `owner_user_id`, admin role, platform store veya legacy product sahipliği seller organization üyeliği olarak yeniden yorumlanmaz.
4. Her tenant-owned kayıt `organization_id`, gerektiğinde `store_id` ve audit alanı taşır.
5. Foreign key, unique constraint ve index’ler tenant sorgu desenini ve duplicate korumasını birlikte sağlar.
6. Migration ile runtime feature activation ayrıdır; schema varlığı endpoint’i açmaz.
7. Schema, service, contract, backfill ve rollout her fazın kendi kapısından geçer.
8. Production ve staging uygulaması ayrı owner onayı olmadan yapılmaz.
9. Ledger ve audit append-only’dir; düzeltme reversal/compensating kayıtla yapılır.
10. Runtime `createCoreSchema` seller migration taşıyıcısı olarak kullanılamaz.

## 2. Additive-only başlangıç sırası

Önerilen migration paketleri ayrı, küçük ve ileri yönlüdür:

1. Organization, store binding, membership, role/permission.
2. Seller session, step-up challenge, audit ve outbox.
3. Application/onboarding ve güvenli belge metadata.
4. Seller offer, variant, inventory item ve movement shadow modeli.
5. Seller order allocation, item ve fulfillment package.
6. Seller ledger shadow posting ve kaynak-event mapping.
7. Settlement preparation ve payout-account metadata.
8. Notification, support ve reporting projection’ları.
9. Doğrulanan backfill ve dual-write yardımcı kayıtları.
10. External visibility projection; yalnız son kapılardan sonra.

Her paket kendi migration kimliğine, forward-recovery notuna, doğrulama sorgularına ve disposable DB testine sahip olur.

## 3. Organization ve membership temeli

Önerilen varlıklar:

- `seller_organizations`: immutable id, legal/display state, lifecycle, revision, audit timestamps.
- `seller_stores`: organization FK, mevcut platform store ile açık ve unique binding, lifecycle.
- `seller_memberships`: user, organization, role, status, effective/revoked zamanları; user+organization için kontrollü uniqueness.
- `seller_roles` ve `seller_role_permissions`: system role ile organization-scoped custom permission ayrımı.
- `seller_invitations`: hashed token, intended role/scope, expiry, inviter, accepted/revoked state.

Silme davranışı:

- Organization/store/membership iş kayıtları hard-delete edilmez.
- İptal/askı/revoke lifecycle transition ile yapılır.
- Son owner’ı kaldıran transition DB/service invariant’ıyla reddedilir.
- User silinmesi PII retention/pseudonymization planına tabidir; audit referansı korunur.

İndeksler tenant anahtarı başta olacak şekilde tasarlanır. Permission ve ownership her request’te güncel membership üzerinden çözülür.

## 4. Seller session, audit ve outbox temeli

- Seller session customer/admin session’dan audience ve storage olarak ayrılır.
- Session membership revision/security stamp taşır; permission değişikliğinde yeniden değerlendirilir.
- Step-up challenge action, target, session ve expiry’ye bağlı; secret/OTP hash dışında tutulmaz.
- `seller_audit_events` append-only, redacted ve actor/tenant/target/result bilgili olur.
- `seller_outbox_events` transaction ile aynı commit sınırında üretilir; delivery retry business mutation’ı tekrarlamaz.
- Duplicate event, idempotency key ve aggregate revision ile engellenir.

Audit/outbox tabloları veri düzeltmesi için update/delete kabul etmez. Hatalı kayıt yeni correction/reversal olayıyla açıklanır.

## 5. Offer ve inventory shadow modeli

- Global `products` kimliği korunur.
- Yeni `seller_offers` product ile organization/store arasındaki satış sözleşmesidir.
- `seller_offer_variants` seller SKU, barcode, price, visibility, tax/shipping seçimi ve revision taşır.
- `seller_inventory_items` current projection; `seller_inventory_movements` append-only stok nedenidir.
- Legacy first-party product alanları seller offer’a sessizce taşınmaz.
- Media ayrı güvenli metadata/upload sözleşmesi oluşmadan seller write’a açılmaz.
- Publish/archive transition’ları state machine ve revision ile korunur.

Shadow aşamasında seller offer verisi müşteri/public katalogda görünmez.

## 6. Seller-order allocation

- Platform order source-of-truth olarak kalır.
- Yeni `seller_orders` organization/store’a ayrılan görünümü taşır.
- `seller_order_items` platform order item ile birebir izlenebilir allocation kaydıdır.
- `seller_fulfillment_packages` seller paket durum makinesi ve revision taşır.
- Allocation aynı platform order içinde birden çok seller’ı destekler.
- Seller command yalnız kendi allocation/package kaydını etkiler.
- Refund/cancellation etkisi platform kararını, inventory reversal’ı ve ledger posting’i birlikte doğrulamadan tamamlanmaz.

Backfill, mevcut order’ları otomatik seller-owned saymaz. Güvenilir store/offer/item bağları olmayan kayıtlar quarantine raporunda kalır.

## 7. Ledger shadow posting

- Para `currency` + minor unit veya kesin decimal ile tutulur; float yasaktır.
- `seller_ledger_entries` append-only ve immutable olur.
- Her posting source event/type/id ve idempotency key taşır.
- Commission, platform fee, reserve, refund, chargeback, adjustment ve payout ayrı entry türleridir.
- Balance materialized projection olabilir; otorite ledger entry toplamıdır.
- Aynı source event ikinci kez post edilemez.
- Negatif bakiye silinmez veya gizlenmez; politika kapsamında forward entry ile taşınır.
- Reconciliation mismatch payout hazırlığını kapatır.

Shadow posting hiçbir provider çağrısı veya gerçek para hareketi üretmez.

## 8. Settlement hazırlığı

- Settlement period, included ledger cursor/range, gross, fee, reserve, refund ve net bilgilerini taşır.
- Settlement aynı ledger aralığını iki kez sahiplenemez.
- Prepared, reviewed, blocked ve superseded lifecycle’ı olur.
- Settlement düzeltmesi eski kaydı silmez; yeni settlement/reversal zinciri kurar.
- `payout_accounts` yalnız maskeli metadata, provider token reference, verification ve lifecycle taşır.
- Tam banka/vergi değeri uygulama logu, audit payload veya response’a girmez.
- `payout_requests`/`payout_batches` değerlendirilse bile provider release ve money movement platform-only, ayrıca yetkili ve bu entegrasyonun dışındadır.

## 9. First-party backfill

1. Platform store ve first-party product kayıtları kaynak kimlikleriyle snapshot raporuna alınır.
2. Hangi kayıtların seller organization’a bağlanabileceği açık owner kararıyla belirlenir.
3. Mapping tablosu original id, target id, reason, source revision ve status taşır.
4. Collision, orphan, inactive/deleted ve ambiguous kayıtlar otomatik geçirilmez.
5. Backfill flag kapalıyken transaction içinde çalışır.
6. Sayım, uniqueness, referential integrity ve sample hash doğrulanmadan completed olmaz.
7. Existing admin/public behavior değişmez; seller visibility kapalı kalır.

## 10. Historical backfill

- Order/return/shipment/payment geçmişi yalnız kanıtlanmış store/item ilişkisiyle tahsis edilir.
- Ambiguous ve eksik tarihsel kayıtlar quarantine edilir.
- Tarihsel finans kaydı kesin ledger kaynağı yoksa tahmini entry üretmez.
- Customer PII backfill’i en az veri ve retention politikasına uyar.
- Backfill checkpoint/cursor idempotenttir ve yeniden başlatılabilir.
- Her batch önce/sonra count, amount ve referential reconciliation üretir.

## 11. Dual-write sınırları

- F0A dual-write yetkisi vermez.
- Dual-write ancak F0B contract testleri ve ilgili domain fazı PASS sonrası başlayabilir.
- Eski write’ın business sonucu değişmez; seller shadow write aynı transaction veya güvenilir outbox ile bağlanır.
- Shadow başarısızsa kaynak write davranışı önceden kararlaştırılmış fail-closed/forward-recovery politikasına uyar; sessiz veri kaybı olmaz.
- İki ayrı otorite oluşturulmaz; her domain için source-of-truth açıkça ilan edilir.
- Finans/order command için geçici client-side queue dual-write aracı olamaz.

## 12. Shadow-read karşılaştırması

Karşılaştırma sadece salt okunur ve redacted telemetry üretir:

- Tenant/store scoped row count.
- Offer/variant price-stock-publication eşleşmesi.
- Seller order item/package allocation eşleşmesi.
- Ledger sum ve source-event completeness.
- Settlement inclusion/exclusion.
- Permission kararlarının beklenen deny/allow matrisi.

Mismatch kullanıcıya yanlış veri açmaz; flag kapalı kalır ve reconcile kuyruğuna gider.

## 13. Reconciliation kapıları

Her domain için PASS şartları:

- Orphan FK: 0.
- Duplicate tenant mapping: 0.
- Cross-tenant collision: 0.
- Unknown permission allow: 0.
- Duplicate source-event ledger posting: 0.
- Ledger currency bazında debit/credit invariant: tanımlı tolerans içinde tam eşleşme.
- Settlement ile ledger inclusion farkı: 0.
- Backfill expected/actual count ve amount farkı: 0 veya açık onaylı quarantine.
- Sampled resource IDOR negatif testleri: güvenli not-found.
- Eski customer/admin contract testleri: PASS.

BLOCKED/FAIL sonucu visibility veya write flag’ini açamaz.

## 14. Feature flag’ler

Tümü default `false`:

| Flag | İlk açılabileceği kapı | Etki |
| --- | --- | --- |
| `SELLER_API_V1_ENABLED` | F1 | Seller namespace routing; ayrıca audience/scope zorunlu. |
| `SELLER_ONBOARDING_ENABLED` | F2 | Seller application/auth akışı. |
| `SELLER_OFFER_WRITE_ENABLED` | F3 | Scoped offer/inventory mutations. |
| `SELLER_ORDER_WRITE_ENABLED` | F4 | Seller package/order command’leri. |
| `SELLER_FINANCE_READ_ENABLED` | F5 | Reconciled ledger-derived read. |
| `SELLER_PAYOUT_PREP_ENABLED` | F6 | Maskeli account/settlement preparation; provider release yok. |
| `EXTERNAL_SELLER_VISIBILITY_ENABLED` | F15 sonrası ayrı onay | Müşteri/public visibility. |

Flag değerleri permission veya tenant scope yerine geçmez. Unknown/non-boolean değer fail-closed kabul edilir.

## 15. Rollout sırası

1. F0B: Contract-test foundation, hiçbir production capability yok.
2. F1–F6: Domain schema/service/API temelleri; flags kapalı.
3. F7: Ayrı seller Android kabuğu; production seller endpoint’i kullanılmadan.
4. F8–F14: Kanonik ekran dalgaları ve domain contract bağları.
5. F15: Tam runtime, görsel, security ve compatibility QA.
6. Staging migration/apply: ayrı owner onayı.
7. Production migration/apply: ayrı owner onayı.
8. Internal seller read rollout.
9. Sınırlı writes.
10. External seller visibility: en son ve ayrı onay.

## 16. Forward-recovery kuralları

- Applied migration dosyası değiştirilmez; yeni ileri migration eklenir.
- Nullable/additive başlangıç, backfill doğrulaması sonrası constraint tightening uygulanır.
- Hatalı mapping yeni correction mapping ile supersede edilir.
- Ledger/audit delete/update yok; reversal/compensating kayıt zorunludur.
- Order allocation yanlışsa source order korunur, yanlış allocation kapatılır ve doğru allocation yeni revision ile yazılır.
- Settlement mismatch durumunda payout preparation bloke edilir; settlement supersede edilir.
- Feature flag kapatma yeni trafik etkisini durdurur fakat şema/veri silmez.
- Provider veya remote side effect yoksa rollback yerine kod flag’i ve forward migration tercih edilir.
- Her recovery path idempotent ve yeniden çalıştırılabilir doğrulama üretir.

## 17. Veri retention kuralları

- Audit, ledger ve settlement yasal/finansal retention politikasına göre immutable tutulur.
- Session ve challenge secrets süre sonunda silinir veya geri döndürülemez hale getirilir.
- Invitation token yalnız hash olarak tutulur; expiry sonrası kullanılamaz.
- Document binary erişimi metadata’dan ayrılır; retention süresi bitince güvenli purge olayı audit edilir.
- PII export/log/cache minimum süre ve minimum alan ilkesine uyar.
- Mobile offline cache, finance ve açık adres için yalnız redacted/salt-okunur veri tutabilir; hassas mutation queue yasaktır.

## 18. Uyumluluk kısıtları

- Customer/admin table, route, token audience ve response contract’ı korunur.
- Seller migration’ı legacy `/api/products` veya `/api/admin/**` authorization’ını genişletmez.
- Platform store davranışı değişmez.
- Existing return/shipment fail-closed kilitleri seller migration gerekçesiyle açılmaz.
- Yeni seller FK’leri legacy satırlara zorunlu default tenant atamaz.
- Public catalog seller visibility flag’i ve doğrulanmış projection olmadan yeni kayıt göstermez.

## 19. Production ve staging onay sınırları

Aşağıdakilerin her biri ayrı owner onayıdır:

- Migration dosyası oluşturma.
- Disposable local DB’de migration çalıştırma.
- Staging DB bağlantısı/apply.
- Production DB bağlantısı/apply.
- Backfill.
- Dual-write.
- Seller API flag açma.
- Finance read/payout preparation.
- External seller visibility.
- Provider money movement.

F0A bunların hiçbirini yetkilendirmez.

## 20. Disposable local DB test gereksinimleri

Gelecekteki migration fazı:

- Gerçek production/staging dump kullanmadan sentetik fixture ile disposable DB kurar.
- Forward migration’ı sıfırdan ve mevcut schema snapshot’ından çalıştırır.
- Aynı migration’ın ikinci çalıştırma davranışını doğrular.
- Constraint, index, FK delete behavior ve transaction failure testlerini çalıştırır.
- Cross-tenant, collision, orphan, duplicate, last-owner, ledger duplicate ve settlement mismatch fixture’ları içerir.
- Test bitiminde yalnız disposable DB kaldırılır; bunun için o fazın açık silme yetkisi gerekir.

## 21. Gelecek faz doğrulama sorguları

SQL bu belgede yazılmaz. Her migration PR’ı aşağıdaki amaçlar için salt okunur doğrulama sorgularını ayrıca taşımalıdır:

- Schema/constraint/index varlığı.
- Tenant-owned satırların organization/store completeness’i.
- Orphan ve cross-tenant FK sayımı.
- Membership/role/permission uniqueness.
- Offer/global product mapping count ve collision.
- Order allocation toplamı ve item quantity eşleşmesi.
- Ledger source-event uniqueness ve currency bazlı denge.
- Settlement inclusion ve duplicate aralık kontrolü.
- Backfill expected/actual/quarantine sayımı.
- Flag kapalıyken public/admin/customer no-regression.

Query çıktıları secret, PII, banka/vergi değeri veya gerçek müşteri içeriği raporlamaz.

## 22. Açık yasaklar

- Runtime `createCoreSchema` seller migration carrier değildir.
- F0A’da local, staging veya production DB’ye bağlanılmaz.
- SQL, migration, seed, backfill veya verification script dosyası oluşturulmaz.
- Remote service/provider çağrısı yapılmaz.
- Destructive rollback, table/column drop, ledger/audit delete uygulanmaz.
- Client-provided amount, tenant veya role otorite kabul edilmez.
