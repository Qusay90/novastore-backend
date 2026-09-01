# NovaStore Public Review Mevcut Durumu

Değerlendirme tarihi: 1 Eylül 2026

## Amaç ve sınır

Bu belge, Customer Web uygulamasının https://novastore.tr üzerinde yapılacak
gelecekteki müşteri ve PayTR Pazaryeri incelemesi için mevcut teknik durumunu
özetler. Belge bir deployment, PayTR başvurusu, merchant aktivasyonu, hukuk
onayı veya gerçek ödeme yetkisi değildir.

Başlangıç otoritesi:

- HEAD: 36923e6ea5c927811c002612c02ae869218722d4
- TREE: 0c15f909e35c2c799462be67a1605ce99b6ff59e
- Korunan kapsam: kabul edilmiş R1 PayTR güvenlik sınırı ve R2 Customer hesap
  tamamlığı

## Sınıflandırma

- READY: Kod sözleşmesi mevcut; ayrıca belirtilen dış kapılar yine açık olabilir.
- OWNER_REAL_DATA_REQUIRED: Gerçek ve doğrulanmış şirket/iletişim verisi gerekir.
- EXTERNAL_PAYTR_REQUIRED: PayTR başvurusu, sözleşmesi, credential'ı veya UAT'ı gerekir.
- DEPLOYMENT_REQUIRED: Public HTTPS ortamı ve yayın kanıtı henüz yoktur.
- FIRST_SALE_BLOCKER: Kapanmadan ilk gerçek satışa geçilemez.
- POST_LAUNCH_ALLOWED: İlk satış için zorunlu olmayan, ayrıca planlanabilen iş.

## Public review envanteri

| Alan | Birincil durum | Mevcut kanonik sözleşme | Açık kapı |
|---|---|---|---|
| Production Customer build | READY | Tek dosyalı cutover artifact zinciri; HTML ve iki served runtime script için 16 forbidden-reference ailesi ve negatif mutation testleri geçer | Public novastore.tr deployment ve runtime smoke |
| Public origin | DEPLOYMENT_REQUIRED | Customer origin aynı-origin API sözleşmesiyle çalışır | novastore.tr sahipliği, TLS, DNS, deployment ve gözlemleme kanıtı |
| API origin | DEPLOYMENT_REQUIRED | APP_BASE_URL ve CLIENT_ORIGIN açık yapılandırmadır; PayTR URL'leri aynı origin'e bağlanır | Yetkili public backend origin ve CORS/proxy topolojisi |
| Customer auth | READY | Server session, refresh rotation ve customer principal sınırı korunur | Production secret teslimi ve public runtime smoke |
| Ürün kataloğu | READY | Public ürün ve kategori adaptörleri server verisini tüketir | Public deployment smoke |
| Ürün detayı | READY | PDP, stok, fiyat, satıcı/mağaza atfı ve güvenli sepet akışı vardır | Public deployment smoke |
| Mağaza sayfası | READY | Kanonik public store projection kullanılır | Public deployment smoke |
| Sepet | READY | Guest/auth cart ve server-authoritative checkout handoff vardır | Public deployment smoke |
| Customer hesap | READY | R2 profil, sipariş, adres, soru, değerlendirme ve takip edilen mağaza yüzeyleri korunur | Public deployment smoke |
| Adres | READY | 81 il/973 ilçe, server ilişkisel doğrulama ve owner-bound CRUD vardır | Public deployment smoke |
| Checkout | READY | Server fiyatı, owned address, agreement snapshot ve idempotency vardır | Şirket/hukuk/provider dış kapıları |
| Payment provider slot | READY | Tek kart sağlayıcısı PayTR; mock/fallback yok; config yokken 503 | EXTERNAL_PAYTR_REQUIRED ve FIRST_SALE_BLOCKER |
| PayTR iframe | READY | Token yalnız backend'den alınır; iframe URL'si resmi PayTR origin/path allowlist'indedir | Credential, aktivasyon ve provider UAT |
| Callback | READY | İmza, tutar, ref, para birimi ve tekrar callback doğrulanır; doğrulanamayan eski/uyumsuz agreement allocation capture'ı fulfillment yerine kalıcı reconciliation'a gider | Public callback kaydı ve provider UAT |
| Legal route altyapısı | READY | 12 sürümlü, fail-closed rota vardır | Onaylı içerik ve gerçek kimlik OWNER_REAL_DATA_REQUIRED |
| Public hukuk içeriği | OWNER_REAL_DATA_REQUIRED | Türkçe taslak paketi hazırlanmıştır; yayın içeriği değildir | Owner/profesyonel hukuk incelemesi FIRST_SALE_BLOCKER |
| Company identity | OWNER_REAL_DATA_REQUIRED | Tek kaynak BusinessIdentity allowlist'i ve format doğrulaması vardır | Gerçek şirket değerleri FIRST_SALE_BLOCKER |
| Hakkımızda | OWNER_REAL_DATA_REQUIRED | about rotası BusinessIdentity placeholder'larını çözebilir | Owner onayı ve public yayın |
| İletişim | OWNER_REAL_DATA_REQUIRED | Public BusinessIdentity projection'ı ile fail-closed iletişim yüzeyi vardır | Gerçek telefon/e-posta/adres/KEP |
| Marketplace disclosure | OWNER_REAL_DATA_REQUIRED | Platform ve order-level seller kimliği için teknik sözleşme vardır | Owner/hukuk onaylı açıklama FIRST_SALE_BLOCKER |
| Seller disclosure | OWNER_REAL_DATA_REQUIRED | Checkout snapshot'ı yalnız approved organization-bound public seller identity kullanır | Her aktif satıcı için doğrulanmış/approved public identity |
| Footer/header legal navigation | READY | Kanonik rotalara giden gerçek bağlantılar vardır; belge yoksa review-not-ready gösterilir | Public browser doğrulaması |
| PayTR provider configuration | EXTERNAL_PAYTR_REQUIRED | Config absent, test-mode production ve aktivasyon yok durumları fail-closed'dur | Başvuru/onay, merchant ID/key/salt, panel URL kaydı |
| Production secrets contract | READY | Secret'lar server runtime sınırındadır; client bundle'a girmez | Secret manager teslimi ve redakte edilmiş kanıt |
| Production database | DEPLOYMENT_REQUIRED | Remote target attestation ve verify-full TLS sözleşmesi vardır | Yetkili production DB, backup/rollback ve migration onayı |
| Web Push | POST_LAUNCH_ALLOWED | Ayrı provider/worker kill switch'i vardır | Owner launch kararı; ilk satış için varsayılan olarak zorunlu değil |
| Bank transfer | POST_LAUNCH_ALLOWED | Production mutabakatı etkin değilken fail-closed kalır | Finans operasyonu ve ayrı owner yetkisi |
| Gerçek ödeme | FIRST_SALE_BLOCKER | Kod yalnız provider callback'ini otorite kabul eder | Tüm dış kapılar, provider UAT ve açık owner yetkisi |

## Kanonik hukuk ve kimlik kararı

Public belgeler yalnız services/legalDocumentService.js içindeki 12 mevcut rota
üzerinden yayımlanır. Şirket kimliği için ikinci bir metin/veri kaynağı
oluşturulmaz. Legal template içindeki yalnız allowlist edilmiş business
placeholder alanları config/businessIdentityConfig.js üzerinden çözülür.
Bilinmeyen, bozuk veya çözülemeyen placeholder belgeyi
owner_external_required durumunda tutar.

Checkout'a zorunlu iki belge:

- pre-information — /on-bilgilendirme-formu
- distance-sale — /mesafeli-satis-sozlesmesi

Bu iki belgenin owner/legal onaylı sürüm ve metni yoksa ödeme başlatılamaz.
Checkout preview; müşteri adresi, server fiyatlı ürünler, tutarlar, kupon,
approved satıcı kimliği ve mağaza bağını yeniden hesaplar. Müşteri kabulü aynı
snapshot hash'ine bağlanır.

## Public inceleme kararı

- PUBLIC_NOVASTORE_TR_DEPLOYMENT: NOT_DONE
- PAYTR_APPLICATION: NOT_SUBMITTED
- PAYTR_CREDENTIALS: NOT_AVAILABLE_IN_THIS_WORK
- OWNER_LEGAL_APPROVAL: REQUIRED
- REAL_PAYMENT: NOT_AUTHORIZED
- PUBLIC_REVIEW_RUNTIME: DEPLOYMENT_REQUIRED

Kod hazır olduğunda dahi doğru durum ifadesi şudur:

> NovaStore public review kod sözleşmesi hazırlanmıştır; gerçek şirket
> kimliği, owner/hukuk onayı, public novastore.tr deployment'ı, PayTR
> Pazaryeri başvurusu, credential teslimi ve provider UAT'ı dış kapıdır.

## İlgili belgeler

- OWNER-BUSINESS-IDENTITY-INPUT.md
- NOVASTORE-PUBLIC-LEGAL-DRAFTS-TR.md
- PRODUCTION-FIRST-SALE-ENV-MANIFEST.md
- PAYTR-PAZARYERI-APPLICATION-PACKET.md
- PAYTR-CREDENTIAL-INJECTION-RUNBOOK.md
- FIRST-REAL-PAYMENT-UAT-RUNBOOK.md
- FIRST-SALE-EXTERNAL-GATE-LEDGER.md
