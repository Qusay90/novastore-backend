# ADR-0001 — NovaStore Seller Sınırı

## 1. Durum ve kapsam

- Durum: `ACCEPTED_FOR_CONTRACT_FREEZE`
- Faz: `F0A`
- Tür: Belge sözleşmesi; uygulanmış özellik, migration, endpoint veya Android modülü değildir.
- Kapsam: NovaStore satıcı telefon uygulamasının 001–296 kanonik ekranını destekleyecek backend, veri, güvenlik ve gelecek Android sınırlarını dondurur.
- Kapsam dışı: Tablet, production/staging değişikliği, uzak DB, ödeme sağlayıcısı, kod üretimi, schema değişikliği, API ve Android uygulaması.

## 2. Bağlam

Handoff paketi kabul edilmiş telefon tasarımını ve akış davranışını bağlayıcı kılar; teknik uygulamanın tamamlandığını veya backend yeteneğinin mevcut olduğunu söylemez. Mevcut repo bir müşteri uygulaması, admin yüzeyi ve first-party katalog temeli içerir. Kaynak incelemesinde `/api/seller/v1/**`, seller audience, seller membership/RBAC, seller-owned offer, seller-order allocation, seller ledger, settlement veya payout yeteneği bulunmamıştır.

Mevcut admin katalog yolları güncel DB admin rolü ve `novastore-platform` first-party store kapsamına bağlıdır. Legacy ürün, sipariş, iade, bildirim ve mesaj yolları seller tenant sınırı değildir. Bunlar seller istemcisine doğrudan açılamaz.

## 3. Bağlayıcı handoff kaynakları

Çelişki halinde öncelik:

1. `source/phone/` altındaki aynı numaralı 001–296 PNG.
2. `docs/SCREEN_CATALOG.tsv` ve `docs/CANONICAL_SOURCE_MAP.tsv`.
3. İlgili Tur geçiş haritası, yardım kataloğu, QA ve tasarım notu.
4. `docs/02-DESIGN-IMPLEMENTATION-CONTRACT.md`.
5. Tarihsel brief yalnız iş alanı bağlamıdır.

Doğrulanan kaynak durumu: 296 benzersiz telefon PNG, 296 katalog satırı, 194 SVG, 13 ortak asset, 597 manifest girdisi ve sıfır tablet dosyası. Statik PNG yalnız statik görsel geometriyi kanıtlar.

## 4. Mevcut mimari bulguları

- `stores` mevcut olsa da seller organization/membership yetki sınırı değildir.
- Entegre katalog `catalogMode: first_party` ve `novastore-platform` store’u ile sınırlıdır.
- Admin product JSON alanları gelecekte yeniden kullanılabilecek domain ipuçlarıdır; seller sözleşmesi değildir.
- `/api/products` global/legacy davranışı seller-owned offer veya tenant koruması sağlamaz.
- Admin order/return/shipment okumaları seller allocation sağlamaz.
- Shipment oluşturma ve return write yollarında fail-closed kilitler vardır.
- Seller, seller offer, settlement ve payout capability’leri kapalıdır.
- Müşteri/admin auth varlığı seller audience veya seller membership kanıtı değildir.
- Mevcut Android `:app` müşteri uygulamasıdır; seller uygulamasına dönüştürülmez.

Bu bulgular `SCREEN-BACKEND-MATRIX.tsv` içindeki `current_backend_status` değerlerinin neden çoğunlukla `PARTIAL` veya `BLOCKED` olduğunu açıklar. Enum semantiği:

- `AVAILABLE`: Yalnız `api_method=NONE` ve `api_route=N/A-BACKEND` olan yerel/statik UI state’i backend bakımından hazırdır; seller endpoint’i uygulandı anlamına gelmez.
- `PARTIAL`: Seller endpoint’i uygulanmamıştır. Kaynakta yalnız ilgili işin bir kısmına yarayabilecek customer/admin/global primitive vardır; seller audience, membership, permission ve tenant scope kurulmadan ekran çalıştırılamaz.
- `BLOCKED`: Seller domain modeli, güvenlik kapısı, write zinciri, provider veya açık owner/design kararı eksiktir.

Admin yeteneği seller availability sayılmaz. Matrixte somut `/api/seller/v1/**` route taşıyan hiçbir `PARTIAL` satır, production endpoint’in var olduğunu iddia etmez; endpoint contract status için `SELLER-API-V1.md` otoritedir.

Matrix `screen_title` ve `ui_state` alanlarını handoff kataloğundan **literal** korur. Bu nedenle 055–148 arasındaki filename-derived ASCII/İngilizce katalog etiketleri kaynak izlenebilirliği içindir; gelecekte kullanıcıya gösterilecek Türkçe metin değildir. Visible copy kanonik PNG ve doğru Türkçe karakter sözleşmesine uyar; F0A kaynak başlığını sessizce yeniden adlandırmaz.

## 5. Sözleşme kararları

Aşağıdaki maddeler **CONTRACT_DECISION** niteliğindedir; uygulanmış özellik değildir:

1. `CONTRACT_DECISION`: Mevcut backend içinde ayrı bir seller bounded context kurulacaktır.
2. `CONTRACT_DECISION`: Seller istemci API’si yalnız `/api/seller/v1/**` namespace’ini kullanacaktır.
3. `CONTRACT_DECISION`: Gelecekte ayrı `:seller-app` Android application modülü kurulacaktır.
4. `CONTRACT_DECISION`: Mevcut `:app` müşteri modülü seller mode’a çevrilmeyecektir.
5. `CONTRACT_DECISION`: `/api/admin/**` seller uygulamasına açılmayacaktır.
6. `CONTRACT_DECISION`: Global ürün kimliği; seller offer/listing, SKU, varyant, fiyat, stok ve yayın durumundan ayrılacaktır.
7. `CONTRACT_DECISION`: Marketplace siparişi seller-owned order/item/package görünümlerine tahsis edilecektir.
8. `CONTRACT_DECISION`: Finansal seller bakiyesi ve raporları append-only ledger kayıtlarından türetilecektir.
9. `CONTRACT_DECISION`: Production payout icrası kapalı kalacak ve ayrı owner onayı gerektirecektir.
10. `CONTRACT_DECISION`: Seller write yetenekleri ilgili fazın migration, security, contract ve runtime kapıları geçmeden açılmayacaktır.

## 6. Reddedilen alternatifler

- Admin tokenı veya admin rolünü seller kimliği gibi kullanmak.
- `/api/admin/**` yollarını mobil seller client’a bağlamak.
- Legacy `/api/products` kayıtlarını doğrudan seller-owned offer saymak.
- İstemciden gelen `organization_id`, `store_id`, role veya amount değerini yetki/finans otoritesi kabul etmek.
- Global product satırına seller fiyat/stok/sahiplik alanlarını kontrolsüz eklemek.
- Müşteri `:app` modülüne rol anahtarı ekleyip aynı binary’yi seller uygulaması yapmak.
- Kanonik PNG’leri poster/WebView/screenshot galerisi olarak kullanmak.
- Seller payout talebi veya sağlayıcı para hareketini bu kapsamda açmak.
- Runtime `createCoreSchema` çağrısını seller migration taşıyıcısı yapmak.

## 7. Güvenlik değişmezleri

- Customer, admin ve seller auth audience’ları ayrıdır.
- Seller oturumu her korumalı istekte DB’deki etkin session ve membership ile yeniden bağlanır.
- Token claim’leri membership, permission, organization/store sahipliği veya kaynak erişimi için tek otorite değildir.
- Bilinmeyen permission, role, capability veya state `deny` olur.
- Organization/store scope sunucu tarafından çözülür; istemci filtresi güvenlik kontrolü değildir.
- Cross-tenant, mevcut olmayan ve soft-deleted kaynak aynı güvenli not-found davranışını verir.
- IDOR kontrolleri revision/idempotency doğrulamasından ve veri ifşasından önce yapılır.
- Hassas işlemde step-up/re-auth tek kullanımlı, süreli ve hedef/aksiyon bağlıdır.
- Membership/permission değişikliği etkin session’ları yeniden değerlendirmeye veya iptale zorlar.
- Mass assignment allowlist ile engellenir.
- Belge ve medya yüklemeleri tür, boyut, içerik, malware ve owner scope kontrollerinden geçer.
- PII, banka/vergi verisi, recovery code, token ve belge içeriği loglanmaz.
- Audit append-only’dir; reddedilen kritik denemeler de redacted olarak kaydedilir.

## 8. Veri sahipliği değişmezleri

- Her tenant-owned kayıt değişmez `organization_id` ve gerektiğinde `store_id` taşır.
- `seller_organizations`, `seller_memberships` ve `seller_stores` server-side tenant çözümünün temelidir.
- Son owner silinemez; owner rolü sıradan davet ile verilemez.
- Global ürün kimliği platforma aittir; seller offer ve SKU durumu organization/store’a aittir.
- Stok hareketi append-only adjustment/transaction geçmişiyle açıklanır.
- Seller order allocation platform order’ı değiştirmeden seller’a ait item/package görünümü üretir.
- Ledger ve audit kayıtları hard-delete veya geriye dönük düzenleme görmez.
- Finans düzeltmeleri reversal/compensating kayıtla yapılır.
- PII ve finans verisi retention sınıfı ile tutulur; export ve loglar en az veri içerir.

## 9. Android uygulama sınırı

- Gelecek modül: `:seller-app`.
- Mevcut müşteri modülü: `:app`; davranışı ve application ID’si korunur.
- Seller navigation, session storage, API adapter, cache ve deep link’ler ayrı audience/namespace kullanır.
- Paylaşılan düşük-riskli design-system/network primitives ancak audience ve storage ayrımı bozulmadan ortaklaştırılabilir.
- Fixture/preview verisi production runtime adapter’ına düşemez.
- Tablet kapsam dışıdır.

## 10. API namespace sınırı

- Seller client’ın tek production namespace’i `/api/seller/v1/**` olacaktır.
- Matrix route alanında yalnız bu prefix veya `N/A-BACKEND` geçerlidir.
- `/api/admin/**`, legacy customer/public yolları ve provider yolları seller API yerine geçmez.
- Bütün bu dokümandaki seller endpoint’leri aksi kaynakla doğrulanmadıkça `PROPOSED_NOT_IMPLEMENTED` veya `BLOCKED` durumundadır.
- API, stable error code, revision/`If-Match`, idempotency, audit ve redaction sözleşmesini taşır.

## 11. Product ve seller-offer sınırı

- `products`: global ürün kimliği ve paylaşılan katalog içeriği.
- `seller_offers`: `organization_id`, `store_id`, `product_id`, satış görünürlüğü ve lifecycle.
- `seller_offer_variants`: seller SKU/barcode bağlamı, fiyat, vergi/kargo seçimleri ve revision.
- `seller_inventory_items` ve append-only `seller_inventory_movements`: stok ve düzeltme nedeni.
- Satıcı yalnız kendi offer/variant/inventory kayıtlarını değiştirir.
- Moderation normal publish akışının varsayılanı değildir; yalnız açık politika/eksik bilgi istisnasıdır.
- Media contract mevcut seller sınırında yoktur; F3’te ayrı güvenli upload sözleşmesi onaylanmadan yazma açılamaz.

## 12. Seller-order allocation sınırı

- Platform order değişmeden kalır.
- `seller_orders`, `seller_order_items`, `seller_fulfillment_packages` ve allocation kayıtları yalnız ilgili organization/store kapsamını sunar.
- Bir müşteri siparişi birden fazla seller order/package üretebilir.
- Seller yalnız tahsisli kalem, miktar, paket ve izinli durum geçişlerini görür.
- İptal/iade/refund sonucu platform kurallarını ve ledger etkisini atlayamaz.
- Command’ler server-side state machine, idempotency key ve optimistic revision ile korunur.
- Açık müşteri adresi yalnız kanıtlanmış operasyon ihtiyacı ve ayrı privacy kararıyla gösterilebilir.

## 13. Ledger ve settlement sınırı

- Tutarlar float değildir; ISO currency ile minor unit veya kesin decimal kullanılır.
- Ledger append-only ve kaynak olaya bağlıdır.
- Available, pending, reserve, fee, commission, refund, chargeback, adjustment ve paid ayrı türlerdir.
- Settlement hazırlığı ledger snapshot ve reconciliation sonucu üretir; source ledger’ı değiştirmez.
- Seller’ın gönderdiği refund, settlement veya payout amount otorite değildir.
- Payout account değişikliği step-up, audit ve maskeli response gerektirir.
- Payout release ve provider money movement platform-only ve kapsam dışıdır.

## 14. Migration stratejisi

- İlk sıra additive-only’dir.
- Mevcut customer/admin schema ve API semantiği korunur.
- Yeni seller tabloları, foreign key’ler, unique/index ve audit/outbox temeli ayrı migration’larla eklenir.
- First-party kayıtlar açık mapping tablosu ve doğrulama raporu ile backfill edilir; `owner_user_id` seller organization sahipliği diye yeniden yorumlanmaz.
- Dual-write yalnız F0B contract testleri ve ilgili faz onayı sonrası, flag kapalıyken başlar.
- Rollback yerine forward-recovery; ledger/audit için reversal/compensating kayıt kullanılır.
- Bu ADR SQL veya migration uygulamaz.

## 15. Feature-flag stratejisi

Başlangıç varsayılanı `false`:

- `SELLER_API_V1_ENABLED`
- `SELLER_ONBOARDING_ENABLED`
- `SELLER_OFFER_WRITE_ENABLED`
- `SELLER_ORDER_WRITE_ENABLED`
- `SELLER_FINANCE_READ_ENABLED`
- `SELLER_PAYOUT_PREP_ENABLED`
- `EXTERNAL_SELLER_VISIBILITY_ENABLED`

Flag tek başına authorization değildir. Flag açık olsa bile audience, membership, permission, scope, state, revision ve audit kapıları zorunludur. External visibility en son açılır.

## 16. Uyumluluk gereksinimleri

- Mevcut customer login, sipariş, ürün ve checkout sözleşmeleri değişmez.
- Mevcut admin auth ve first-party katalog davranışı değişmez.
- Legacy API’lerin response shape/status code’ları seller işi adına değiştirilmez.
- Yeni seller tabloları global/public katalog okumasını kendiliğinden genişletmez.
- Seller kayıtları flag kapalıyken müşteri/storefront görünürlüğü üretmez.
- Var olan kapalı capability ve fail-closed return/shipment davranışları ayrı onay olmadan açılmaz.

## 17. Tasarım açıkları

| ID | Ad | Bağımlı ekranlar | Durum | Eksik karar ve owner girdisi |
| --- | --- | --- | --- | --- |
| DG-001 | MULTI_ORGANIZATION_STORE_SELECTOR | 024, 027, 055, 243 | BLOCKED | Bir kullanıcının birden fazla organization/store üyeliğinde seçim, son seçim, deep-link ve erişim kaybı davranışı için ürün sahibi kararı gerekir. |
| DG-002 | OWNER_TRANSFER_AND_FOUR_EYES_FLOW | 285, 287, 290 | BLOCKED | Owner transferi, çift onay, bekleme süresi ve acil kurtarma akışı 001–296’da yoktur. |
| DG-003 | MANUAL_PAYOUT_REQUEST_OR_RELEASE | 193 | BLOCKED | Kanonik akış otomatik ödeme planıdır. Manuel payout request/release tasarımı ve yetkisi yoktur; eklenmez. |
| DG-004 | FULL_ADDRESS_REVEAL_PRIVACY_POLICY | 159 | BLOCKED | Tam adresin hangi rol, zaman penceresi ve audit koşulunda açılacağına privacy/security owner kararı gerekir. |
| DG-005 | BOTTOM_NAV_MOTION_TIMING | 055, 074, 142, 185, 243 | BLOCKED | PNG geometri, bubble/shine, shadow, spacing ve safe-area’yı gösterir; duration, easing, spring, reduced-motion ve frame timing göstermez. Motion referansı veya açık owner kararı gerekir. |

`DG-005` için statik PNG’den animasyon süresi, easing curve, spring parametresi, reduced-motion transition veya frame timing çıkarılmayacaktır.

## 18. Non-goals

- Bu fazda kod, endpoint, migration, DB, module, build, test veya production rollout üretmek.
- Tablet tasarlamak.
- Admin özelliklerini seller uygulamasına taşımak.
- Provider payout/transfer yürütmek.
- Otomatik risk skoru, otomatik ceza veya varsayılan admin moderation tasarlamak.
- Kanonik ekranlarda olmayan yeni bir görsel karar uydurmak.

## 19. Faz kapısı referansları

Bağlayıcı faz sözlüğü `PHASE-GATES.md` içindeki `F0A`–`F15` dizisidir. Handoff’taki tarihsel `Faz 0`–`Faz 9` adları yalnız eşleme notudur ve yeni kapı kimliği değildir. Screen matrix backend/android fazları bu sözlüğe bağlanır.

## 20. Sonuçlar ve sonraki onaylar

- F0A yalnız sözleşme dondurur; hiçbir runtime capability açmaz.
- İlk önerilen sonraki faz `F0B` contract-test foundation’dır.
- Her faz ayrı owner allowlist’i, branch/HEAD doğrulaması, test kanıtı ve commit izni gerektirir.
- Migration/DB, API uygulaması, Android modülü, staging/production, payout provider, commit, push ve PR birbirinden ayrı onay kapılarıdır.
- Bu belgelerin kabulü F0B veya sonraki herhangi bir fazı otomatik yetkilendirmez.
