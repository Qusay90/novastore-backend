# Commerce Pro entegrasyon yürütme planı

Tarih: 14 Temmuz 2026

Çalışma dalı: `codex/admin-commerce-pro-integration`

Yığın tabanı: `codex/admin-commerce-pro-preview` (`1954d4b`)

## Sonuç

Commerce Pro tasarım prototipi tamamlandı; tek-satıcı salt-okunur entegrasyon katmanı Dashboard, sipariş, iade ve admin bildirimlerine kadar ilerledi. Mevcut backend hâlâ tek satıcılıdır; satıcı organizasyonu, satıcı kapsamlı yetkilendirme, teklif, seller-order, değişmez finansal kayıt, hakediş ve payout modelleri henüz yoktur.

- Gerçek tek-satıcı Commerce Pro cutover için kalan: **yaklaşık 2–3,5 hafta**.
- Dar kapsamlı, login zorunlu ilk satış pilotu için kalan: **yaklaşık 4–7 hafta**.
- Kontrollü 1–3 satıcılı ödeme pilotu: bugünden itibaren **5–7 ay**.
- Güvenilir halka açık pazaryeri: **8–12 ay**.

Bu tahmin iki kıdemli full-stack geliştirici ile yarı zamanlı QA/DevOps kapasitesini varsayar. Mevcut tek geliştirici + Codex çalışma düzeninde gerçekçi kalan takvim yaklaşık **4–8 hafta tek-satıcı cutover**, **7–15 hafta dar satış pilotu**, **9–16 ay kontrollü çok-satıcı ödeme pilotu** ve **15–28 ay güvenilir halka açık pazaryeri** düzeyindedir. Ödeme, KYC, kargo ve e-fatura sağlayıcılarının sözleşme/onay süreleri tahmine dahil değildir.

## Değişmez teslim kuralları

1. Her tur plan → uygulama → test → doğrulama → commit → push sırasıyla tamamlanır.
2. Preview ve entegre veri uygulamaları ayrı build girişleridir. Preview hiçbir ağ isteği yapmaz; entegre uygulama hata halinde mock veriye düşmez.
3. Entegre istemci yalnız aynı-origin `/api/...` yollarına JWT ekler.
4. Backend’de olmayan müşteri, satıcı, finans veya operasyon verisi entegre panelde uydurulmaz.
5. Yetki/capability bilinmiyorsa kontrol kapalıdır. UI görünürlüğü güvenlik sınırı değildir; sunucu her isteği doğrular.
6. Production, uzak veritabanı, gerçek ödeme, Cloudinary mutation, migration deploy ve production cutover ayrı açık onay kapılarıdır.
7. PR #15 büyütülmez. Entegrasyon, PR #15 üzerine yığılan ayrı dal/PR olarak ilerler.
8. Kullanıcının alakasız `support_novastore.png` değişikliği stage veya commit edilmez.

## Tur planı

| Tur | Teslim | Tahmin | Kabul kapısı | Uzak/gerçek sistem |
|---|---|---:|---|---|
| 0 | Route/DTO/capability haritası, bağımlılık sırası, bu yürütme planı | 0,5–1 gün | Sözleşme ve risk listesi gözden geçirilmiş | Yok |
| 1 | Preview/live build ayrımı, admin session gate, aynı-origin HTTP istemcisi, gerçek Dashboard + Siparişler salt-okunur | 2–3 gün | Auth/401/403, mapper, CSP, no-mock-fallback ve build testleri | Yok |
| 2A | Salt-okunur iade ve admin bildirimi özetleri; yerel kargo kaydını taşıyıcı doğrulaması gibi göstermeyen sipariş görünümü | 1–2 gün | Auth/current-role/no-store, bounded DTO, PII azaltma, bağımsız hata/empty/loading ve no-write artifact testleri | Yok |
| 2B | Yaşam döngüsü güvenlik çekirdeği: hard-delete kapısı, geçiş sahipliği, idempotency, stok rezervasyon kanıtı ve ödeme callback yarışları | 3–5 gün | İzinli/yasak geçiş, tekrar istek, stale admin, stock/event tekilliği ve karma payment/order state testleri | Fake pool + mümkünse disposable yerel PG |
| 2C | Kontrollü fulfillment/iptal/iade operasyonları; gerçek refund, kargo etiketi ve taşıyıcı doğrulaması kapalı | 2–3 gün | Beklenen durum/409, atomik shipment-order güncellemesi, audit ve post-commit bildirim davranışı | Fake pool / disposable yerel PG |
| 3 | Birinci taraf ürün, kategori, özellik, koleksiyon ve menü CRUD | 4–6 gün | Medya hariç tam DTO; hard-delete kapalı; audit izi | Fake pool / yerel PG; Cloudinary yok |
| 4 | Admin müşteri özet API’si, sorular/yorumlar, kampanya, pagination ve gizlilik | 4–6 gün | Auth açığı kapanmış, PII kapsamı ve pagination testli | Fake pool / yerel PG |
| 5 | Analytics, legacy parity, feature flag, rollback ve Commerce Pro cutover hazırlığı | 3–5 gün | Desktop/mobile UAT, console/network, güvenlik/perf | Production deploy yok |
| 6 | Seller organization/member, seller-scope RBAC ve onboarding temeli | 6–10 gün | Tenant isolation ve rol matrisi | Disposable yerel PG zorunlu |
| 7A | Kanonik katalog + seller offers; first-party backfill/dual-write/shadow-read | 8–12 gün | Veri mutabakatı ve geri alma planı | Yerel migration |
| 7B | Depo, inventory movement ve eşzamanlı stok rezervasyonu | 7–10 gün | Concurrency ve compensation testleri | Yerel PG |
| 8A | Ana sipariş/seller-order ayrımı, değişmez satır ve finans snapshot’ı | 7–10 gün | Split/return/shipping izolasyonu | Yerel PG |
| 8B | Komisyon, çift taraflı ledger, ters kayıtlar ve settlement eligibility | 10–15 gün | Kuruş bazlı invariant/reconciliation testleri | Yerel PG |
| 8C | PayTR transfer/refund/reconciliation adapterı ve staging UAT | 7–12 gün + sağlayıcı | Idempotency, webhook imzası ve finans mutabakatı | Gerçek çağrı için açık onay |
| 9 | Seller portal, operasyon runbook’u, pilot UAT ve kontrollü rollout | 10–15 gün | Go/no-go kontrol listesi ve rollback provası | Staging/production ayrı onay |

## Bağımlılık sırası

1. Admin oturum ve veri kontratı.
2. Mevcut tek-satıcı modüllerinin Commerce Pro’ya bağlanması.
3. Seller identity ve sunucu tarafı scope.
4. Kanonik katalog ve satıcı teklifleri.
5. Stok hareketi ve rezervasyon.
6. Seller-order ayrımı.
7. Finansal snapshot ve append-only ledger.
8. Settlement, refund ve reconciliation.
9. Onaylı PayTR staging UAT.
10. Kontrollü production rollout.

## Tur 0 sözleşme özeti

### Şimdi bağlanabilen salt-okunur kaynaklar

| Kaynak | Endpoint | Yetki | Karar |
|---|---|---|---|
| Admin oturumu | `GET /api/admin/session` | Admin JWT + güncel DB rolü | Tur 1’de eklendi; capability’ler fail-closed |
| Dashboard | `GET /api/admin/stats` | Admin JWT + güncel DB rolü | Tur 1; `private, no-store` |
| Siparişler | `GET /api/admin/orders/summary?limit=100` | Admin JWT + güncel DB rolü | Tur 1; sınırlı ve PII azaltılmış özet DTO, client-side filtre geçici |
| Ürünler | `GET /api/products` | Public, admin JWT ile ek alanlar | Tur 3; yalnız birinci taraf olarak eşlenir |
| İadeler | `GET /api/admin/returns/summary?limit=100` | Admin JWT + güncel DB rolü | Tur 2A; sınırlı, PII azaltılmış ve salt-okunur |
| Bildirimler | `GET /api/admin/notifications/summary?limit=50` | Admin JWT + güncel DB rolü | Tur 2A; yalnız admin kayıtları, sınırlı ve salt-okunur |
| Kategori/özellik/menü/koleksiyon | `/api/admin/...` | Admin JWT | Tur 3 |

### Entegre arayüzde çağrılmayacak kapasite

| Alan | Neden |
|---|---|
| Satıcılar / satıcı teklifleri | Seller organization, membership, scope ve offer modeli yok |
| Hakediş / payout / komisyon | Ledger, settlement ve payout modeli yok |
| Müşteri tablosu ve segment mutasyonu | Admin customer list/detail endpoint’i yok |
| Sipariş owner atama / toplu mutation | Endpoint, geçiş matrisi ve optimistic concurrency yok |
| Gerçek refund | Mevcut cancel/return yalnız DB durumunu değiştiriyor |
| Kargo etiketi ve takip webhook’u | Sağlayıcı adapterı yok |
| Fatura | HTTP API yok; iç servis `mock` provider kullanıyor |
| Ürün soruları | Admin route’larında auth middleware eksik |

## P0 güvenlik ve doğruluk işleri

- Public merchant feed görünürlük/yayın/arşiv filtreleri olmadan ürün yayımlamamalı.
- Public analitik body içindeki `userId` güvenilir kimlik sayılmamalı.
- Product/order hard-delete finans ve audit alanında kapatılmalı.
- Order/return için sunucu tarafı geçiş matrisi ve idempotency eklenmeli.
- Payment–stock yarışında rezervasyon ve compensation doğrulanmalı.
- İptal/return stok geri yükleme ve gerçek refund birbirinden tutarlı olmalı.
- Liste endpoint'lerine ortak pagination/filter/sort ve hata zarfı eklenmeli.
- Satış pilotundan önce PayTR token/iyzico initialize mock implementasyonları gerçek provider adapterlarıyla değiştirilmeli; iyzico webhook imzası sağlayıcının belgelenmiş raw-body sözleşmesiyle doğrulanmalıdır. Bu işler açık staging/sağlayıcı onayı olmadan etkinleştirilmez.

## Tur kapatma kaydı

| Tur | Durum | Commit | QA notu |
|---|---|---|---|
| 0 | Tamamlandı | `faef1f2` | Read-only repo audit; remote sistem kullanılmadı |
| 1 | Kod ve otomatik QA tamam; browser QA blokeli | `989cbeb` | Preview/entegre build, auth, mapper, CSP ve artifact testleri yeşil; Work Mode browser kanıtı eksik |
| 2A | Kod ve otomatik QA tamam; browser QA blokeli | `eea2b1c` | İade/bildirim salt-okunur bağlandı; yerel kargo/refund sınırları görünür; write capability'leri kapalı; full verify yeşil |
| 2B | Kod ve otomatik QA tamam; browser QA blokeli | Bu commit | Hard-delete/generic geçiş/sahte shipment/iade yazmaları kapalı; iptal stok kanıtına, callback'ler payment state + kalıcı reconciliation görevine bağlandı; bağımsız P0/P1 incelemesi temiz |

## Tur 2 güvenlik bölümü

Tur 2A yalnız gözlem yüzeyidir ve mevcut riskli mutation yollarını Commerce Pro'ya açmaz. Tur 2B tamamlanmadan `orderStatusWrite`, iade yazmaları, hard-delete, shipment create, notification acknowledge ve gerçek refund capability'leri `false` kalır.

Tur 2B'nin P0 kabul kapıları:

1. Tekrarlanan veya eşzamanlı iptal stok miktarını birden fazla artıramaz; rezervasyon kanıtı olmayan kayıt fail-closed/manual-review olur.
2. Ödeme callback sonucu arbitrary sipariş durumundan değil payment terminal durumundan türetilir; iptal/status yarışı gerçek tahsilatı sessiz duplicate sayamaz.
3. Finans ve audit kaydını cascade ile silebilen sipariş hard-delete yolu kapatılır.
4. Generic status endpoint'i payment/cancel/return/shipment sahipliğindeki hedefleri atlayamaz.
5. Admin mutation'ları JWT'deki eski role değil güncel DB admin rolüne dayanır.
6. Gerçek taşıyıcı, refund ve ödeme çağrıları ayrıca açık onay verilene kadar çalıştırılmaz.

Tur 2B güvenli davranış özeti:

- Sipariş hard-delete `410 ORDER_HARD_DELETE_DISABLED`; genel durum yolu yalnız aynı durum tekrarını kabul eder ve gerçek değişiklik için ilgili komutu zorunlu kılar.
- İptal, sipariş ile siparişe bağlı bütün ödeme kayıtlarını kilitler. Aktif ödeme geçmişi, provider-pending durumu ve stok rezervasyon kanıtı tutarlı değilse veri yazmadan `409` ile durur.
- PayTR/iyzico callback kararı sipariş görünümünden değil kilitli `payments.status` kaydından türetilir. Geç/karşıt callback finansal gerçeği korur; stok/kupon/sipariş satırı yan etkisini tekrar çalıştırmaz ve mutabakat kaydı üretir.
- Sahte takip numarası üreten shipment create `410 SHIPMENT_CREATE_DISABLED`; yeni iade ve iade durum yazmaları `503 RETURN_WRITES_DISABLED` ile kapalıdır. Mevcut kayıtların owner/admin salt-okunur görünümü korunur.
- Legacy admin, web profil ve Android istemcileri kapalı işlemleri etkin CTA gibi göstermez. Android iptal CTA'sı yalnız backend'in iptal edilebilir hazırlık durumlarında görünür.

Bu çekirdek callback güvenliği gerçek ödeme bağlantısı anlamına gelmez. Mevcut PayTR initialize test tokenı, iyzico initialize mock yanıtı ve iyzico imza sözleşmesi satışa açılmadan önce provider staging dokümanıyla ayrı turda değiştirilip UAT edilmelidir; o zamana kadar ödeme alma go/no-go kapısı kapalıdır.

PR #15’in `design-qa.md` sonucu, gerçek masaüstü/mobil browser kanıtı alınana kadar `blocked` kalır. Bu plan browser kısıtını atlatma yetkisi vermez.

## Tur 1 geri alma sınırı

Tur 1’in yeni artifact, session ve order-summary parçaları additive ilerler; `frontend/admin.html` cutover edilmez. Entegre Dashboard’un kullandığı mevcut `/api/admin/stats` yolu ayrıca `no-store` ve güncel DB admin-rolü kontrolüyle sıkılaştırılır; `/api/admin/behavior` zinciri değiştirilmez. Geri alma gerektiğinde entegre artifact, session/order-summary endpointleri, stats middleware sıkılaştırması, login allowlist hedefi ve Commerce Pro entegre kaynakları birlikte geri alınır. Preview artifact ve legacy admin çalışma yolu bağımsız kalır.

## Tur 2A geri alma sınırı

Tur 2A şema veya veri mutation'ı eklemez. Geri alma gerektiğinde return/notification summary handler ve rotaları, iki read capability'si, mapper/adapter kaynakları, entegre iade-bildirim-kargo görünümü ve yeniden üretilen live artifact birlikte geri alınır. Legacy admin, mevcut return/notification yolları, preview artifact ve veritabanı şeması değişmeden kalır.

## Tur 2B geri alma sınırı

Tur 2B migration veya production ayarı eklemez; mevcut tablo ve event kayıtlarını kullanır. Geri alma gerektiğinde yaşam döngüsü/callback policy servisleri, controller/route guard'ları, legacy istemci kapıları ve bunların sözleşme testleri birlikte geri alınır. Bu geri alma eski hard-delete, sahte shipment ve güvensiz return yollarını yeniden açacağı için yalnız ayrı olay incelemesi ve açık onayla yapılabilir. Gerçek ödeme veya taşıyıcı konfigürasyonu bu turda değiştirilmez.
