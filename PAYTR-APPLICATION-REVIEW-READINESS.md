# PayTR Başvuru ve İnceleme Hazırlığı

Değerlendirme tarihi: 1 Eylül 2026

## Karar

**Kod hazırlığı `PASS` durumundadır; dış faaliyete geçiş hazır değildir.** Şirket kimliği, public deployment, hukuk metinleri ve production yetkisi `OWNER_EXTERNAL_REQUIRED`; PayTR başvurusu/onayı, merchant credential'ları, panel kaydı, Pazaryeri transfer sözleşmesi ve provider UAT'ı `PAYTR_CREDENTIAL_REQUIRED` dış kapılarıdır.

Bu değerlendirme PayTR adına gereksinim listesi üretmez. PayTR'ın güncel başvuru şartları ve NovaStore'a uygulanacak ürün modeli yalnız yetkili provider kanalıyla doğrulanmalıdır.

## Durum Etiketleri

- `PASS`: İlgili kod sözleşmesi ve kaynak kanıtı mevcut; bu etiket dış onay, credential, provider UAT'ı veya production yetkisi anlamına gelmez.
- `OWNER_EXTERNAL_REQUIRED`: Şirket sahibi, hukuk, deployment, finans/operasyon veya yetkili release sahibinin doğrulanmış girdisi ya da onayı gerekir.
- `PAYTR_CREDENTIAL_REQUIRED`: PayTR başvurusu/ürün modeli, merchant aktivasyonu veya credential'ı, provider panel kaydı ya da yetkili PayTR UAT kanıtı gerekir.
- `FAIL`: Zorunlu kod sözleşmesi yoktur, çelişkilidir veya doğrulama başarısızdır; ilk satışa ilerlenemez.

### Kod Hazırlığı ile Dış Kapı Ayrımı

`PASS`, yalnız depodaki review-ready entegrasyon tabanını ifade eder. `OWNER_EXTERNAL_REQUIRED` veya `PAYTR_CREDENTIAL_REQUIRED` taşıyan bir satır, başka bir satır `PASS` olsa bile açık kalır. Bu incelemede zorunlu kod sözleşmelerinde `FAIL` saptanmamıştır; fakat hiçbir dış kapı kod kanıtıyla kapatılmış sayılmaz.

## İnceleme Matrisi

### Prompt Tarafından Zorunlu Exact Readiness Anahtarları

| Readiness anahtarı | Durum | Gerekçe |
|---|---|---|
| `SITE_PUBLICLY_REVIEWABLE` | `OWNER_EXTERNAL_REQUIRED` | Bu dalga local-only; doğrulanmış public `novastore.tr` review deployment'ı yok |
| `PRODUCT_CATALOG` | `PASS` | Gerçek public katalog adaptörü ve yerel browser UAT mevcut |
| `PRODUCT_DETAIL` | `PASS` | Canonical PDP rotası, server ürünü ve kart verisi toplamayan ödeme sınırı mevcut |
| `CART` | `PASS` | Guest/auth sepet birleşimi ve kalıcı cart checkout handoff sözleşmesi mevcut |
| `ADDRESS` | `PASS` | Owned kayıtlı adres CRUD/checkout seçimi ve API sahiplik kontrolü mevcut |
| `PHONE` | `PASS` | Canonical `05` + 9 rakam server/client doğrulaması mevcut |
| `PROVINCE_DISTRICT` | `PASS` | Sürümlü 81 il/973 ilçe dataset'i, bağımlı seçim ve server ilişkisel doğrulama mevcut |
| `CHECKOUT` | `PASS` | Server quote, siparişe özel hukuk snapshot'ı ve provider yokken fail-closed review akışı mevcut |
| `PAYMENT_PROVIDER_SLOT` | `PASS` | PayTR-only adapter, sabit token endpoint'i ve resmi iFrame URL allowlist'i mevcut |
| `LEGAL_PAGES` | `OWNER_EXTERNAL_REQUIRED` | 12 fail-closed rota mevcut; yayımlanacak gerçek metin/sürüm sahibi ve hukuk onayı bekliyor |
| `BUSINESS_IDENTITY` | `OWNER_EXTERNAL_REQUIRED` | Format kapısı mevcut; gerçek şirket değerleri sahibi tarafından sağlanmadı |
| `SELLER_MARKETPLACE_DISCLOSURE` | `OWNER_EXTERNAL_REQUIRED` | Fail-closed rota mevcut; gerçek disclosure ve ürün/sözleşme içeriği dış onay bekliyor |
| `REAL_PROVIDER_CONFIG` | `PAYTR_CREDENTIAL_REQUIRED` | Merchant aktivasyonu, credential ve public panel URL kaydı yok |
| `REAL_PAYMENT` | `PAYTR_CREDENTIAL_REQUIRED` | Provider UAT ve ayrıca production işlem yetkisi yok; gerçek ödeme yapılmadı |

Exact anahtar sayımı: `PASS=8`, `OWNER_EXTERNAL_REQUIRED=4`, `PAYTR_CREDENTIAL_REQUIRED=2`, `FAIL=0`, toplam `14`.

### Genişletilmiş Teknik/Dış Kapı Matrisi

| İnceleme alanı | Durum | Review paketine girecek kanıt |
|---|---|---|
| Tek sağlayıcı seçimi | `PASS` | `PAYMENT_PROVIDER=paytr`; desteklenen provider allowlist'i yalnız `paytr` |
| Mock/fallback olmaması | `PASS` | Yeni kart init'inin başka sağlayıcıyı reddettiğini gösteren kaynak ve test envanteri |
| Dış istek kill switch'i | `PASS` | `PAYTR_LIVE_REQUESTS_ALLOWED=false` varsayılanı ve aktivasyon guard'ı |
| Resmi endpoint pin'i | `PASS` | Token URL'si ve güvenli iFrame URL allowlist'i |
| Callback bütünlüğü | `PASS` | Hash, provider/ref, tutar/para birimi, idempotency, locking ve geç callback politikası |
| Müşteri/adres sahipliği | `PASS` | Customer principal ve `addressId + user_id` sorgusu |
| İşletme kimliği | `OWNER_EXTERNAL_REQUIRED` | Yetkili kaynaktan doğrulanmış unvan, VKN, MERSİS, adres, KEP, telefon, e-posta |
| Public müşteri domain'i | `OWNER_EXTERNAL_REQUIRED` | Sahipliği ve HTTPS yayını doğrulanmış origin |
| Checkout hukuk metinleri | `OWNER_EXTERNAL_REQUIRED` | Ön bilgilendirme ve mesafeli satış için onaylı tam metin, sürüm ve onay kaydı |
| Diğer public hukuk/iletişim sayfaları | `OWNER_EXTERNAL_REQUIRED` | Şirket/hukuk tarafından onaylanan içerik ve public erişim kanıtı; provider'ın zorunlu kapsamı ayrıca teyit edilir |
| Android/web kimliği | `OWNER_EXTERNAL_REQUIRED` | Gerçek public dağıtım kanalı ve sahibi tarafından doğrulanmış app/domain kimlikleri |
| PayTR başvurusu | `PAYTR_CREDENTIAL_REQUIRED` | Başvuru durumu ve uygulanacak ürün modelinin yetkili PayTR doğrulaması |
| Merchant credential'ları | `PAYTR_CREDENTIAL_REQUIRED` | Secret manager'da yetkili teslim ve erişim/rotasyon kaydı; secret değeri review paketine girmez |
| Callback/success/fail URL kaydı | `PAYTR_CREDENTIAL_REQUIRED` | Owner tarafından yayımlanmış public HTTPS endpoint erişimi ve PayTR panel eşleşmesi |
| Pazaryeri transferi | `PAYTR_CREDENTIAL_REQUIRED` | Satıcı/KYC, split/komisyon, valör/bloke, transfer, iade ve chargeback için PayTR sözleşmesi |
| Provider UAT | `PAYTR_CREDENTIAL_REQUIRED` | Ayrı yetkili ortamda redakte edilmiş başarı/başarısızlık/tekrar/uyuşmazlık/timeout kanıtı |
| Production deploy ve ilk satış | `OWNER_EXTERNAL_REQUIRED` | Go/no-go, izleme, rollback ve operasyon sorumluluğu |

### Matris Sayımı

| Durum | Satır sayısı |
|---|---:|
| `PASS` | 6 |
| `OWNER_EXTERNAL_REQUIRED` | 6 |
| `PAYTR_CREDENTIAL_REQUIRED` | 5 |
| `FAIL` | 0 |
| Toplam | 17 |

## İşletme Kimliği Kapısı

Kart ödeme başlatma aşağıdaki alanların eksik veya geçersiz olmasına izin vermez:

- `BUSINESS_LEGAL_COMPANY_NAME`
- `BUSINESS_TRADE_NAME`
- `BUSINESS_TAX_VKN`
- `BUSINESS_MERSIS_NUMBER`
- `BUSINESS_REGISTERED_ADDRESS`
- `BUSINESS_KEP_ADDRESS`
- `BUSINESS_PHONE`
- `BUSINESS_EMAIL`
- `CUSTOMER_PUBLIC_DOMAIN`

`BUSINESS_TAX_OFFICE` kanonik BusinessIdentity içinde opsiyoneldir. Owner/hukuk
veya PayTR başvuru sözleşmesi zorunlu kılarsa sağlanır. Onaylı bir legal
template `{{business.taxOffice}}` kullanıyorsa, geçerli değer bulunmadan o belge
yayımlanmaz.

`ADMIN_PUBLIC_DOMAIN`, `SELLER_WEB_PUBLIC_DOMAIN`, `CUSTOMER_ANDROID_APP_ID` ve `SELLER_ANDROID_APP_ID` public işletme envanterinin parçalarıdır; mevcut card payment gate'inde hepsi zorunlu değildir. Başvuru formuna veya provider'a gönderilecek kapsam PayTR ile ayrıca doğrulanır. Hiçbir değer kod ekibi tarafından uydurulmaz.

## Hukuk ve Yayın Kapısı

Kod, checkout için iki belgeyi zorunlu kabul eder:

| Belge | Onay | Sürüm | Metin |
|---|---|---|---|
| Ön Bilgilendirme Formu | `NOVASTORE_LEGAL_PRE_INFORMATION_APPROVED` | `NOVASTORE_LEGAL_PRE_INFORMATION_VERSION` | `NOVASTORE_LEGAL_PRE_INFORMATION_TEXT` |
| Mesafeli Satış Sözleşmesi | `NOVASTORE_LEGAL_DISTANCE_SALE_APPROVED` | `NOVASTORE_LEGAL_DISTANCE_SALE_VERSION` | `NOVASTORE_LEGAL_DISTANCE_SALE_TEXT` |

Belge ancak onay exact `true`, sürüm geçerli ve metin doluysa yayımlanır.
Şirket alanları ikinci bir legal kimlik kaynağından kopyalanmaz; template yalnız
strict business placeholder allowlist'indeki alanları kanonik
BusinessIdentity projection'ından çözebilir. Bilinmeyen, bozuk veya çözülemeyen
placeholder yayını fail-closed tutar. Public kayıt kaynak-template ve render
edilmiş içerik hash'lerini ayrı izler.

Checkout, yayımdaki iki metni sunucu-doğrulamalı adres, ürünler, tutarlar,
kupon ve approved organization-bound satıcı public legal identity snapshot'ı
ile birleştirerek `checkout-agreements-v2` preview'ı üretir. Müşteri tam metni
aynı `snapshotSha256` ile kabul eder; initialize bağlamı yeniden hesaplar,
eski/değiştirilmiş hash'i reddeder ve kabul edilen tam metin + bağlam + hash'i
ödeme kaydında saklar. Satıcı application beyanı, private belge veya payout
verisi Customer disclosure kaynağı değildir. Metnin hukuki doğruluğunu kod
değil şirket/hukuk sahibi onaylar.

Public sistemde ayrıca gizlilik, KVKK, çerez, üyelik, iptal/iade/cayma, teslimat/kargo, işlem rehberi, pazaryeri bilgilendirmesi ve satıcı sözleşmesi için sürümlü yayın altyapısı vardır. Bu sayfaların PayTR başvurusunda hangilerinin zorunlu olduğu provider'ın güncel resmi incelemesiyle teyit edilir; burada varsayılmaz.

## Provider Güvenlik Paketi

İnceleme paketinde secret göstermeden şu kanıtlar bulunmalıdır:

1. `PAYMENT_PROVIDER=paytr` ve provider allowlist'i.
2. `PAYTR_LIVE_REQUESTS_ALLOWED=false` güvenli varsayılanı.
3. Render proxy zincirinde `NOVASTORE_TRUST_PROXY_HOPS` canlı istek kanıtıyla belirlenir; değer tahmin edilmez.
4. Production müşteri ödemesinde `PAYTR_TEST_MODE=true` fail-closed kalır.
5. `https://www.paytr.com/odeme/api/get-token` endpoint pin'i.
6. iFrame URL'sinin yalnız `https://www.paytr.com/odeme/guvenli/...` olması.
7. Callback hash/tutar/ref/provider doğrulaması.
8. Success/fail dönüşlerinin ödeme otoritesi olmaması.
9. Callback idempotency, transaction lock ve karşıt/geç olay politikası.
10. Müşteri-owned status sorgusu ve provider/commerce finalizasyon ayrımı.
11. Secret'ların yalnız runtime secret manager'da tutulması ve loglara yazılmaması.

## Provider UAT Öncesi Minimum Paket

- dış kapıların yetkili kişilerce kapandığına ilişkin onay,
- disposable veya ayrı kontrollü UAT veritabanı ve kullanıcıları,
- public HTTPS callback rotası ve PayTR panel yapılandırması,
- redakte edilmiş test senaryosu/işlem referansı formatı,
- başarı, başarısızlık, duplicate, stale/contradictory callback, tutar uyuşmazlığı ve timeout senaryoları,
- stok/kupon/sipariş/satıcı projeksiyonu yan etkisi ve tekrar çalışmama kanıtı,
- mutabakat ve refund/chargeback eskalasyon sahibi,
- gözlemleme, alarm, kill switch ve rollback prosedürü.

Provider UAT tamamlanmadan production'a geçilmez. UAT tamamlanması da production yetkisini otomatik vermez.

## Secret ve Kişisel Veri Kuralı

- Merchant key/salt, gerçek kimlik belgesi, banka hesabı ve kişisel veri bu depoya veya inceleme dokümanına yazılmaz.
- Kanıtlar yalnız gerekli alanları gösterecek şekilde redakte edilir.
- PayTR callback payload'ı veya provider ekran görüntüsü gerçek işlem/kişi verisi içeriyorsa yetkili güvenli kanalda tutulur.
- Başvuru formuna girilecek her şirket/provider değeri sahibi tarafından doğrulanır.

## Hazır Olma İfadesi

Dış kanıtlar gelene kadar kullanılabilecek en güçlü doğru ifade şudur:

> PayTR ilk-satış entegrasyonunun kod ve dokümantasyon tabanı review-ready durumdadır; başvuru, sağlayıcı aktivasyonu, Pazaryeri transfer sözleşmesi, UAT ve production ilk satış henüz dış onay/kanıt beklemektedir.

## R3 public review belge seti

- `NOVASTORE-PUBLIC-REVIEW-CURRENT-STATE.md`
- `OWNER-BUSINESS-IDENTITY-INPUT.md`
- `NOVASTORE-PUBLIC-LEGAL-DRAFTS-TR.md`
- `PRODUCTION-FIRST-SALE-ENV-MANIFEST.md`
- `PAYTR-PAZARYERI-APPLICATION-PACKET.md`
- `PAYTR-CREDENTIAL-INJECTION-RUNBOOK.md`
- `FIRST-REAL-PAYMENT-UAT-RUNBOOK.md`
- `FIRST-SALE-EXTERNAL-GATE-LEDGER.md`

Bu belgeler gerçek değer, provider onayı, deployment veya ödeme yetkisi
yerine geçmez.
