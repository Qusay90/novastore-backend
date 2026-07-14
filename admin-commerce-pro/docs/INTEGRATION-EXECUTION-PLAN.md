# Commerce Pro entegrasyon yürütme planı

Tarih: 14 Temmuz 2026

Çalışma dalı: `codex/admin-commerce-pro-integration`

Yığın tabanı: `codex/admin-commerce-pro-preview` (`1954d4b`)

## Sonuç

Commerce Pro tasarım prototipi tamamlanmış olsa da gerçek backend entegrasyonu yeni başlıyor. Mevcut backend tek satıcılıdır; satıcı organizasyonu, satıcı kapsamlı yetkilendirme, teklif, seller-order, değişmez finansal kayıt, hakediş ve payout modelleri henüz yoktur.

- Gerçek tek-satıcı Commerce Pro cutover: **3–5 hafta**.
- Dar kapsamlı, login zorunlu ilk satış pilotu: **5–8 hafta**.
- Kontrollü 1–3 satıcılı ödeme pilotu: bugünden itibaren **5–7 ay**.
- Güvenilir halka açık pazaryeri: **8–12 ay**.

Bu tahmin iki kıdemli full-stack geliştirici ile yarı zamanlı QA/DevOps kapasitesini varsayar. Tek geliştirici ve Codex ile süre yaklaşık 1,8–2,3 katına çıkabilir. Ödeme, KYC, kargo ve e-fatura sağlayıcılarının sözleşme/onay süreleri tahmine dahil değildir.

## Değişmez teslim kuralları

1. Her tur plan → uygulama → test → doğrulama → commit → push sırasıyla tamamlanır.
2. Preview ve canlı veri uygulamaları ayrı build girişleridir. Preview hiçbir ağ isteği yapmaz; canlı uygulama hata halinde mock veriye düşmez.
3. Canlı istemci yalnız aynı-origin `/api/...` yollarına JWT ekler.
4. Backend’de olmayan müşteri, satıcı, finans veya operasyon verisi canlı panelde uydurulmaz.
5. Yetki/capability bilinmiyorsa kontrol kapalıdır. UI görünürlüğü güvenlik sınırı değildir; sunucu her isteği doğrular.
6. Production, uzak veritabanı, gerçek ödeme, Cloudinary mutation, migration deploy ve production cutover ayrı açık onay kapılarıdır.
7. PR #15 büyütülmez. Entegrasyon, PR #15 üzerine yığılan ayrı dal/PR olarak ilerler.
8. Kullanıcının alakasız `support_novastore.png` değişikliği stage veya commit edilmez.

## Tur planı

| Tur | Teslim | Tahmin | Kabul kapısı | Uzak/gerçek sistem |
|---|---|---:|---|---|
| 0 | Route/DTO/capability haritası, bağımlılık sırası, bu yürütme planı | 0,5–1 gün | Sözleşme ve risk listesi gözden geçirilmiş | Yok |
| 1 | Preview/live build ayrımı, admin session gate, aynı-origin HTTP istemcisi, gerçek Dashboard + Siparişler salt-okunur | 2–3 gün | Auth/401/403, mapper, CSP, no-mock-fallback ve build testleri | Yok |
| 2 | Sipariş geçiş matrisi, iptal/iade/kargo/bildirim akışları; gerçek olmayan owner/not/bulk kontrolleri kapalı | 3–4 gün | Idempotency, izinli geçiş, hata/empty/loading testleri | Fake pool / opsiyonel yerel PG |
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
| Admin oturumu | `GET /api/admin/session` | Admin JWT | Tur 1’de eklenecek bootstrap sözleşmesi |
| Dashboard | `GET /api/admin/stats` | Admin JWT | Tur 1 |
| Siparişler | `GET /api/orders` | Admin JWT | Tur 1; client-side filtre geçici |
| Ürünler | `GET /api/products` | Public, admin JWT ile ek alanlar | Tur 3; yalnız birinci taraf olarak eşlenir |
| İadeler | `GET /api/returns/admin/all` | Admin JWT | Tur 2 |
| Bildirimler | `GET /api/notifications/admin` | Admin JWT | Tur 2 |
| Kategori/özellik/menü/koleksiyon | `/api/admin/...` | Admin JWT | Tur 3 |

### Canlıda kapalı kalacak kapasite

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
- Liste endpoint’lerine ortak pagination/filter/sort ve hata zarfı eklenmeli.

## Tur kapatma kaydı

| Tur | Durum | Commit | QA notu |
|---|---|---|---|
| 0 | Tamamlandı | Commit sonrası işlenecek | Read-only repo audit; remote sistem kullanılmadı |
| 1 | Devam ediyor | — | Browser QA yalnız izin verilen Work Mode browser ile yapılacak |

PR #15’in `design-qa.md` sonucu, gerçek masaüstü/mobil browser kanıtı alınana kadar `blocked` kalır. Bu plan browser kısıtını atlatma yetkisi vermez.
