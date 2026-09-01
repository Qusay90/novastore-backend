# PayTR Review-Ready Entegrasyon Tabanı

Son durum: 1 Eylül 2026

Bu belge, ilk satış kart ödemesi için kod tabanında bulunan PayTR sınırını ve henüz dışarıdan tamamlanması gereken kapıları tanımlar. Buradaki **review-ready** ifadesi gerçek ödeme almaya hazır, PayTR başvurusu onaylı veya production'a çıkmaya yetkili anlamına gelmez.

Bu hazırlık kapsamında gerçek PayTR kimlik bilgisi kullanılmadı, PayTR'a ağ isteği gönderilmedi, ödeme alınmadı ve gerçek sipariş oluşturulmadı.

## Otorite ve Entegrasyon Kaydı

`CUSTOMER_VISUAL_AUTHORITY_PRESERVED: PASS`

- HEAD: `b80526c73331aad0358d6c3e5bf07b4f2f66d457`
- TREE: `1a8a3451590d83f196c14b4c2f7661d0eb255df1`
- Kanıt: kabul edilmiş Customer Web HEAD'i, tüketilen PC1 backend HEAD'inin doğrudan atasıdır; korunan `storefront-commerce-pro/src/App.jsx` değiştirilmedi.

`PC1_BACKEND_AUTHORITY_CONSUMED: PASS`

- HEAD: `847d725c7e99605326b3811c567edd4ffcec3ecf`
- TREE: `51b77d94d4ccb89d9075fce629da19a74b4ca46c`
- Kanıt: bu çalışma için ayrılmış worktree/branch tam olarak bu kabul edilmiş SHA'dan oluşturuldu.

`INTEGRATION_STRATEGY: DEDICATED_WORKTREE_FROM_PC1_AUTHORITY_WITH_PROVEN_CUSTOMER_VISUAL_ANCESTRY`

Tüm dalı başka bir checkout'tan birleştirme veya dizin kopyalama yapılmadı. Customer görsel otoritesini zaten atası olarak içeren PC1 backend otoritesinden ayrılmış temiz entegrasyon worktree'sinde yalnız bu dalganın dar Customer checkout/PayTR değişiklikleri uygulandı.

## Değişmez Mimari Kararları

1. Kart ödemesinin tek seçilebilir sağlayıcısı `paytr` değeridir. `PAYMENT_PROVIDER` eksikse veya başka bir değer içeriyorsa ödeme fail-closed olur.
2. Ödeme için mock sağlayıcı ve otomatik sağlayıcı fallback'i yoktur.
3. `PAYTR_LIVE_REQUESTS_ALLOWED=false` güvenli varsayılandır. Bu bayrak ayrı bir yetkili provider UAT/production kararı olmadan `true` yapılmaz.
4. Token isteği yalnız `https://www.paytr.com/odeme/api/get-token` adresine gönderilebilir. `PAYTR_BASE_URL` yalnız `https://www.paytr.com` olabilir.
5. Checkout serbest metin adresiyle ödeme başlatmaz. İstemci gerçek `addressId` gönderir; backend adresi aktif müşteri oturumunun sahipliğinde `customer_addresses` kaydından yeniden okur.
6. Gerçek kart ödemesi için sahibi tarafından doğrulanmış `BusinessIdentity` ve checkout'a zorunlu iki hukuk/şirket onaylı, sürümlü metin gerekir.
7. Success/fail tarayıcı dönüşü ödeme sonucu değildir. Ödeme ve commerce finalizasyonunun tek sağlayıcı otoritesi, hash'i ve tutarı doğrulanmış PayTR callback'idir.
8. NovaStore satıcı ledger/settlement kayıtları gerçek PayTR Pazaryeri transferi değildir. Satıcıya para aktarımı dış sağlayıcı sözleşmesi ve ayrı entegrasyon kapısıdır.

## Çalışan Sözleşme

### 1. Readiness sorgusu

`GET /api/payments/capability` aşağıdaki üç alanı birlikte değerlendirir:

- PayTR provider yapılandırması ve açık aktivasyon bayrağı,
- ödeme için zorunlu gerçek işletme kimliği,
- yayımlanmış checkout sözleşmeleri.

Bu kapılardan biri eksikse cevap `ready: false` kalır. Bu endpoint ödeme başlatmaz.

### 2. Ödeme başlatma

`POST /api/payments/initialize` yalnız müşteri principal'ı ile çalışır. Kart isteği en az şu gerçek bağları taşır:

- oturum sahibine ait pozitif `addressId`,
- server fiyatlandırmasına tekrar girecek sepet satırları,
- isteğe bağlı kupon,
- `paymentMethod: "card"`,
- yayımdaki sürümlerle birebir eşleşen `agreementAcceptances`,
- idempotency bağlamı.

Backend adresi kullanıcı sahipliğiyle yükler; müşteri adı, telefon, e-posta ve teslimat adresini istemcinin serbest metninden kabul etmez. İşletme kimliği snapshot'ı ve onaylanan sözleşmelerin sürüm/hash snapshot'ı ödeme kaydına bağlanır.

### 3. PayTR handoff

Tüm kapılar açık olduğunda backend merchant OID, server fiyatı, sepet ve success/fail dönüş URL'leriyle token payload'ı oluşturur. Public callback URL'si aynı yapılandırmanın zorunlu ayrı parçasıdır; token payload'ında tarayıcı dönüş URL'si gibi davranmaz. Dış token isteği yalnız sabit resmi endpoint'e gider. Dönen token, yalnız `https://www.paytr.com/odeme/guvenli/...` origin/path sözleşmesine uyan iFrame URL'siyle istemciye aktarılır.

### 4. Tek finalizasyon otoritesi

`POST /api/payments/webhook/paytr` form-urlencoded callback'i:

- gerekli alanları ve callback hash'ini doğrular,
- provider ve `merchant_oid` eşleşmesini kontrol eder,
- ödeme tutarı, tahsil edilen tutar, kart tipi ve para birimini server kaydıyla karşılaştırır,
- ödeme/sipariş satırını transaction içinde kilitler,
- webhook olayını idempotent işler,
- geç veya karşıt callback'leri callback politikasına göre yok sayar ya da mutabakata taşır,
- yalnız uygun başarı callback'inde stok, kupon, sipariş, satıcı sipariş projeksiyonu ve bildirim yan etkilerini kesinleştirir.

Callback'i görmeden success sayfasına dönmek, iFrame'in kapanması, istemci mesajı veya status sorgusu ödeme durumunu `PAID` yapamaz.

### 5. Sonuç okuma

`GET /api/payments/status?paymentRef=...&orderId=...` kimliği doğrulanmış kullanıcının yalnız kendi sipariş/ödeme kaydını okur. Sonuç ekranı bu server durumunu gösterir; provider sonucunu üretmez.

## Ortam Değişkeni Sözleşmesi

| Değişken | Review-ready örneği | Açıklama |
|---|---|---|
| `PAYMENT_PROVIDER` | `paytr` | Tek desteklenen ilk-satış kart sağlayıcısı |
| `PAYTR_LIVE_REQUESTS_ALLOWED` | `false` | Dış token isteği için ayrı, açık aktivasyon kapısı |
| `PAYTR_BASE_URL` | `https://www.paytr.com` | Kod tarafından allowlist edilen resmi origin; değiştirilemez |
| `PAYTR_MERCHANT_ID` | boş | PayTR/secret yöneticisinden dışarıdan sağlanır |
| `PAYTR_MERCHANT_KEY` | boş | Secret; belgeye, loga veya Git'e yazılmaz |
| `PAYTR_MERCHANT_SALT` | boş | Secret; belgeye, loga veya Git'e yazılmaz |
| `PAYTR_CALLBACK_URL` | boş | Yetkili public HTTPS deployment sonrası belirlenir |
| `PAYTR_SUCCESS_URL` | boş | Tarayıcı dönüşü; ödeme otoritesi değildir |
| `PAYTR_FAIL_URL` | boş | Tarayıcı dönüşü; ödeme otoritesi değildir |
| `PAYTR_TEST_MODE` | `true` | Provider test işareti; tek başına güvenlik veya aktivasyon sağlamaz |
| `PAYTR_DEBUG_ON` | `false` | Review-ready örneğinde kapalıdır |

Gerçek işletme kimliği için `BUSINESS_LEGAL_COMPANY_NAME`,
`BUSINESS_TRADE_NAME`, `BUSINESS_TAX_VKN`, `BUSINESS_MERSIS_NUMBER`,
`BUSINESS_REGISTERED_ADDRESS`, `BUSINESS_KEP_ADDRESS`, `BUSINESS_PHONE`,
`BUSINESS_EMAIL` ve `CUSTOMER_PUBLIC_DOMAIN` sahibi tarafından sağlanmalıdır.
`BUSINESS_TAX_OFFICE` opsiyoneldir; owner/hukuk/provider gereksinimi veya bir
legal template içindeki `{{business.taxOffice}}` kullanımı onu ilgili belge
için zorunlu hale getirir. Kod format kontrolü yapar; değer üretmez.

Checkout için iki belge birlikte yayımlanmalıdır:

- `NOVASTORE_LEGAL_PRE_INFORMATION_APPROVED`, `NOVASTORE_LEGAL_PRE_INFORMATION_VERSION`, `NOVASTORE_LEGAL_PRE_INFORMATION_TEXT`
- `NOVASTORE_LEGAL_DISTANCE_SALE_APPROVED`, `NOVASTORE_LEGAL_DISTANCE_SALE_VERSION`, `NOVASTORE_LEGAL_DISTANCE_SALE_TEXT`

`*_APPROVED=true` tek başına yeterli değildir. Sürüm geçerli formatta, metin
dolu ve müşteri kabulü aynı sürümde olmalıdır. Legal template yalnız kanonik
BusinessIdentity kaynağına bağlı strict business placeholder allowlist'ini
kullanır; bilinmeyen/bozuk/çözülemeyen placeholder belgeyi yayımlamaz.
Kaynak-template ve render edilmiş içerik hash'leri ayrıdır.

Checkout seller disclosure; server fiyatlı ürünün organization/store bağından
yüklenen admin-approved, versioned public seller legal identity ile mağaza
görünümünü snapshot'a alır. Seller application payload'ı, private doğrulama
belgesi veya payout verisi public hukuk kaynağı olamaz. Hiçbir şirket, hukuk
veya PayTR değeri bu depoda tahmin edilmez.

## Bu Tabanın Dışında Kalanlar

- şirket kuruluşu ve doğrulanmış yasal kimlik,
- public müşteri/admin/satıcı deployment'ları ve alan adı sahipliği,
- PayTR başvurusu, sözleşmesi, merchant onayı ve gerçek credential teslimi,
- PayTR'ın uygulanacak hesap/pazaryeri ürün modelini yazılı doğrulaması,
- alt üye işyeri onboarding'i, komisyon/split, valör/bloke ve satıcı transferi,
- yetkili provider UAT'ta başarı, başarısızlık, tekrar callback, tutar uyuşmazlığı ve timeout kanıtı,
- refund/chargeback, mutabakat, alarm, destek ve finans operasyon sahipleri,
- production go/no-go ve ilk gerçek satış yetkisi.

Bu dış kapılar tamamlanmadan `PAYTR_LIVE_REQUESTS_ALLOWED` güvenli olarak `false` kalır.

## Review Kabul Kriteri

Bu dokümantasyon tabanı yalnız aşağıdaki ifadeyle kabul edilir:

> Kod sözleşmesi PayTR incelemesine hazırdır; gerçek provider aktivasyonu, şirket/hukuk verileri, public deployment, Pazaryeri transfer sözleşmesi, UAT ve production izni dış kapıdır.

“Canlı ödeme hazır”, “başvuru tamam”, “merchant onaylı” veya “ilk satış yapılabilir” ifadeleri, dış kanıt olmadan kullanılamaz.

## R3 public review devam belgeleri

Güncel 12 rota taslağı, owner girdisi, production environment manifesti,
application checklist'i, credential/UAT planı ve dış gate ledger'ı şu
belgelerde tutulur:

- `NOVASTORE-PUBLIC-REVIEW-CURRENT-STATE.md`
- `OWNER-BUSINESS-IDENTITY-INPUT.md`
- `NOVASTORE-PUBLIC-LEGAL-DRAFTS-TR.md`
- `PRODUCTION-FIRST-SALE-ENV-MANIFEST.md`
- `PAYTR-PAZARYERI-APPLICATION-PACKET.md`
- `PAYTR-CREDENTIAL-INJECTION-RUNBOOK.md`
- `FIRST-REAL-PAYMENT-UAT-RUNBOOK.md`
- `FIRST-SALE-EXTERNAL-GATE-LEDGER.md`

Bu belge seti PayTR başvurusu göndermemiştir, credential enjekte etmemiştir ve
public deployment ya da gerçek ödeme yetkisi vermez.
