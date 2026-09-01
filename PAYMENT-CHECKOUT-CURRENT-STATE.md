# Payment Checkout Güncel Durum

Kaynak inceleme tarihi: 1 Eylül 2026

## Sonuç

Checkout, gerçek müşteri oturumu ve sahibi olunan adres kaydıyla PayTR'a handoff yapacak şekilde kodlanmıştır; ancak bu çalışma zamanında dış ödeme kapısı bilinçli olarak kapalıdır. Gerçek credential, gerçek PayTR çağrısı, ödeme, provider UAT veya production ilk satış kanıtı yoktur.

## Durum Matrisi

### Zorunlu Yüzey Sınıflandırması

| Sınıf | Yüzeyler | Karar |
|---|---|---|
| `CANONICAL_KEEP` | Customer auth/session; owned address CRUD; server pricing/stock/coupon; `/api/payments/status`; callback state machine | Tek server gerçeği olarak korunur ve daraltılır |
| `LEGACY_REMOVE` | `frontend/checkout.html` sahte ödeme akışı; provider yokken `payment-result.html` sonucuna geçiş; eski success/fail query'sinden ödeme sonucu üretme | Redirect stub/okuma-only sonuç akışıyla kaldırıldı; hiçbir client dönüşü ödeme yazmaz |
| `PAYTR_ADAPTER_REQUIRED` | capability; token payload/transport; PayTR iFrame handoff; signed callback; idempotent finalizasyon | Resmi sabit endpoint ve fail-closed config ile uygulandı; credential/aktivasyon dış kapı |
| `REVIEW_ONLY` | Provider kapalı checkout sunumu; readiness/hukuk/işletme kimliği durumları; hassas olmayan dekoratif ödeme anlatımı | Yerel incelemede görünür, ödeme veya sipariş üretmez |
| `POST_LAUNCH_ALLOWED` | Direct API kullanan tam etkileşimli gerçek-card Nova Kart; gelişmiş kart animasyonu | İlk satış için gerekli değil; ayrıca yetkilendirilmeden uygulanmaz |

Bu sınıflandırmada eski `payment-result.html` dosyasının varlığı tek başına legacy başarı otoritesi değildir: dosya yalnız sahiplik kontrollü server status'unu okuyan sonuç kabuğu olarak tutulur.

| Alan | Güncel durum | Kaynak sözleşmesi |
|---|---|---|
| Kart sağlayıcısı | Yalnız `paytr`; açık seçim zorunlu | `config/paymentProviderConfig.js` |
| Mock/fallback | Yok | Provider allowlist'i yalnız `paytr`; init başka sağlayıcıyı reddeder |
| Dış çağrı kapısı | Kapalı varsayılan | `PAYTR_LIVE_REQUESTS_ALLOWED=false` |
| Token endpoint'i | Sabit | `https://www.paytr.com/odeme/api/get-token` |
| Güvenli ödeme URL'si | Sıkı origin/path kontrolü | `https://www.paytr.com/odeme/guvenli/...` |
| Müşteri oturumu | Zorunlu | `authenticateCustomer` ve customer principal kontrolü |
| Teslimat adresi | Gerçek `addressId`, server sahiplik sorgusu | `customer_addresses.id` + `user_id` |
| Fiyat/tutar | Server fiyatlandırması | İstemci toplamı ödeme otoritesi değildir |
| İşletme kimliği | Card checkout için zorunlu; değerler dışarıdan bekleniyor | `config/businessIdentityConfig.js` |
| Hukuki kabul | Ön bilgilendirme ve mesafeli satış sürümleri zorunlu | `services/legalDocumentService.js` |
| Sipariş/ödeme ilk kaydı | Read-only preflight bağlantısı provider I/O'dan önce bırakılır; token isteği uzun transaction dışında yapılır; ardından session advisory lock altındaki kısa transaction tüm state/payload bağlarını yeniden doğrulayıp commit eder | Provider I/O dışarıda + kilitli kısa revalidation transaction'ı |
| Provider sonucu | Yalnız doğrulanmış callback kesinleştirir | `/api/payments/webhook/paytr` |
| Result sayfası | Sahiplik kontrollü server durumunu okur | `/api/payments/status` |
| Satıcı görünümü | Başarılı callback sonrası iç projeksiyon | `services/sellerOrderProjectionService.js` |
| Satıcı transferi | Uygulanmış değil; dış provider sözleşmesi | İç ledger/settlement transfer değildir |

## Public API Yüzeyi

### `GET /api/payments/capability`

Yan etki üretmeden provider, işletme kimliği ve checkout hukuk belgelerinin readiness durumunu döndürür. Bir kapı eksikse `ready: false` olur ve istemci ödeme butonunu açmamalıdır.

### `POST /api/payments/agreements/preview`

Authenticated müşteri için sahibi olunan `addressId`, sunucuda yeniden fiyatlanan ürünler/kupon, gerçek işletme kimliği ve satıcı operasyon dağılımından `checkout-agreements-v2` üretir. Yanıt tam siparişe özel metni, belge içerik hash'lerini ve tek `snapshotSha256` referansını taşır; kart veya provider çağrısı yapmaz. Adres, ürün, kupon, tutar, belge sürümü ya da satıcı dağılımı değişirse hash değişir ve önceki kabul kullanılamaz.

### `POST /api/payments/initialize`

Gerçek kart init isteği şu bağları kullanır:

```json
{
  "addressId": "<oturum sahibine ait pozitif kayıt kimliği>",
  "cartItems": "<server tarafından yeniden fiyatlandırılacak satırlar>",
  "couponCode": "<opsiyonel>",
  "paymentMethod": "card",
  "agreementSnapshotSha256": "<sunucunun siparişe özel preview hash'i>",
  "agreementAcceptances": [
    { "slug": "pre-information", "version": "<yayımdaki sürüm>", "accepted": true },
    { "slug": "distance-sale", "version": "<yayımdaki sürüm>", "accepted": true }
  ]
}
```

Bu örnekte şirket, kullanıcı, sipariş, tutar veya provider değeri yoktur. Gerçek `addressId` yalnız authenticated hesabın adres listesinden seçilir. Backend, istemcinin gönderdiği ad/adres/telefon metnine güvenmez. Initialize aynı adres, fiyat, ürün ve satıcı bağlamını yeniden kurar; hash eşleşmezse tüm geçici sipariş/stok işlemi rollback olur. Kabul edilen tam metin, bağlam ve hash ödeme kaydında değişmez snapshot olarak saklanır.

### `POST /api/payments/webhook/paytr`

PayTR callback endpoint'idir. Hash, provider, referans, tutar, ödeme tipi ve para birimi doğrulanmadan durum değiştirmez. İdempotency ve satır kilidi tekrar/geç callback yarışlarını sınırlar. Uygun olmayan karşıt sonuç commerce yan etkisini tekrar çalıştırmaz; gerektiğinde açık mutabakat kaydı üretir.

### `GET /api/payments/status`

`paymentRef` ve `orderId` ile server kaydını okur; yalnız sipariş sahibi sonucu görebilir. `providerFinalized` ile `commerceFinalized` ayrıdır. Provider tahsilatı kaydedilmiş ancak operasyonel mutabakat gerekiyorsa aynı ödemeyi yeniden denemek yerine bekleme durumu gösterilir.

## İstemci Davranışı

- Storefront checkout önce capability durumunu okur, ardından sahibi olunan adres ve güncel sunucu fiyatıyla siparişe özel sözleşme preview'ı üretir.
- Kullanıcı tam siparişe özel metni açıp aynı `snapshotSha256` ile kabul eder; fiyat/adres/kupon değişimi kabulü sıfırlar.
- Yalnız kayıtlı adres kimliğini gönderir.
- Backend yalnız PayTR iFrame action'ı ve izinli resmi URL döndürürse handoff yapar.
- Success/fail query parametresi ödeme sonucunu belirlemez.
- Sonuç ekranı status endpoint'ini sorgular; sepet temizleme server tarafından `PAID` olarak kesinleşen provider durumuna bağlıdır.
- Yerel review-only oturumu gerçek ödeme, sipariş oluşturma veya provider yönlendirmesi yapmaz.

## Bilinen Dış Blokajlar

1. Doğrulanmış gerçek şirket kimliği ve public domain değerleri sağlanmadı.
2. Ön bilgilendirme ve mesafeli satış metinlerinin sahibi/hukuk onaylı sürümleri sağlanmadı.
3. PayTR başvuru/merchant onayı ve secret teslimi doğrulanmadı.
4. Public HTTPS callback/success/fail deployment'ı doğrulanmadı.
5. Ayrı yetkili provider UAT yapılmadı.
6. PayTR Pazaryeri satıcı doğrulama, split/komisyon, bloke/valör ve transfer sözleşmesi sağlanmadı.
7. Refund/chargeback, mutabakat ve production ilk satış operasyon onayı sağlanmadı.

Bu belge kaynak sözleşmesini raporlar; testleri, provider çağrılarını veya deployment'ı çalıştırma yetkisi vermez.
