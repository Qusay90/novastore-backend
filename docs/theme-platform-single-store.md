# Wave 2 — Tek mağaza ve kanonik ticaret bağlayıcısı

Durum: yerel temel uygulandı; üretim yayını değildir. `themePlatformCommerceUnitSmoke.js` içinde 35 birim kontrolü; `themePlatformCommercePostgresSmoke.js` içinde 27 gerçek PostgreSQL/HTTP kapısı geçti. Bu sonuçlar tek başına tarayıcı kabulü, gerçek alan adı, TLS, Stocky teslimi veya ödeme kabulü sayılmaz.

## Yetki ve veri kaynağı

Sunucu zinciri:

`Host → theme_domain_bindings → theme_assignments → seller_theme_services → seller_stores.legacy_store_id → products / mevcut kanonik servisler`

- Alan adı yalnız ham `Host` üstbilgisinden okunur. Tekrarlanan Host, kullanıcı bilgisi, yol, denetim karakteri, virgül, geçersiz port, boş etiket ve son nokta reddedilir. Büyük/küçük harf normalleşir; geçerli taşıma portu mağaza kimliğinin parçası değildir.
- `X-Forwarded-Host` yetki kaynağı değildir. İleride ters vekil kullanıldığında özgün Host güvenli biçimde korunmalı; vekil güven politikası ayrıca doğrulanmalıdır.
- Genel çözümleme `VERIFIED`, dolu `verified_at` ve `verification_reference` ister. Atama `ACCEPTED`, kanal `web`, atama/alan adı modu `SINGLE_STORE`, sürüm `PUBLISHED` olmalıdır. Servis zaman aralığı, mağaza/organizasyon durumu, kamusal mağaza uygunluğu her istekte tekrar okunur.
- Public mağaza uygunluğu mevcut `publicCommerceEligibilityService.publicStoreSourceSql()` kaynağından gelir. Ürün görünürlüğü mevcut `buildPublicProductSqlPredicate` ile uygulanır.
- Query/body/localStorage içindeki `storeId` seçim yetkisi değildir. İstek izin listesi dışında gelen alan reddedilir.
- Doğrulanmış alan adı kaydı için üretim DNS doğrulama, domain etkinleştirme veya TLS uç noktası eklenmedi. Test kayıtları yalnız yeni, geçici PostgreSQL konteynerinde üretilir.

`createThemeStorefrontHostGuard` tüm `/api` yönlendirmelerinden önce bağlanmalıdır. Açıkça yapılandırılmış platform hostları mevcut platform API'lerini kullanır. Eşlenmiş tek mağaza hostları yalnız `/api/theme-storefront` API alanını kullanır. Diğer `/api` yolları 404, bilinmeyen hostlar 421 alır. Express'in varsayılan büyük/küçük harf duyarsız eşlemesi de dikkate alınır: `/API/Products` kaçış yolu değildir. Güvenilir platform hostu listesine satıcının özel alan adı eklenmemelidir.

## Uygulanan API

Router: `createThemeStorefrontRouter({database, enabled, referenceAdapter?, assetReader?})`.
Önerilen bağlantı: `/api/theme-storefront`.

| Yöntem / yol | Davranış |
|---|---|
| GET `/context` | Sunucu mağaza kimliği, atama kanalı, tek mağaza modu ve açık yayın/ödeme durumu |
| GET `/products` | Mağazaya bağlı ürünler; `q`, `categoryId`, `collectionId`, `sort`, `limit`, `offset` izinli |
| GET `/products/:productId` | Kanonik ürün, medya, kategori, varyant ve ilgili okuma bağlantıları |
| GET `/products/:productId/reviews` | Yalnız yayımlanmış yorumlar, maskelenmiş müşteri adı |
| GET `/products/:productId/questions` | Yalnız yanıtlanmış sorular, maskelenmiş müşteri adı |
| GET `/products/:productId/recommendations` | Aynı mağazadan en çok 12 öneri; mevcut ürün hariç |
| GET `/categories` | Yalnız mağazanın kamusal ürünlerine ulaşan aktif kategori ağacının düz listesi ve kapsamlı ürün sayıları |
| GET `/collections` | Kamusal koleksiyonların mağazanın ürünleriyle kesişimi |
| GET `/collections/:collectionId` | Kesişimi boş olmayan koleksiyon ve yalnız bu mağazaya ait ürünler |
| GET `/navigation` | Aynı mağazanın kategorilerinden türetilen menü hedefleri |
| POST `/quote` | Kanonik fiyat/kupon/kargo hesabı; ürün-varyant çiftleri korunur |
| GET `/assets/:assetId` | Yalnız güvenilir `assetReader` verilirse; sunucuda aynı servis/mağazaya ait READY varlık kontrolünden sonra gerçek byte bağlayıcısına geçilir |

Filtre/sıralama: `newest`, `price_asc`, `price_desc`, `name`; varsayılan sayfa 24, üst sınır 100, offset üst sınırı 10.000. Arama ILIKE jokerlerini kaçırır. Genel mağaza seçimi kabul edilmez. Koleksiyonlar mevcut manual/new_arrivals/discount/best_sellers kurallarını kullanır; sonuçlar daima mağaza ürünleriyle kesişir. Liste en çok 200 aktif koleksiyonu değerlendirir. Öneri ilk sürümde mağaza içi yeni ürün seçkisidir; kişiselleştirme değildir.

Yorum/soru ilk sürümde en çok 50 kayıt döndürür. Yorum medyası, yorum yazma/izin sorgusu, soru yazma ve takip eden sayfalar bu özel alan adı bağlayıcısında uygulanmadı. Genel platform uç noktalarına kontrolsüz yönlendirme yapılmamalıdır.

## Ortak Studio ve atama önizlemesi

Bu fonksiyonlar HTTP kimlik doğrulamasını tekrar icat etmez. Çağıran Admin/Seller işlem hattı gerçek oturumu/yetkiyi/servis kilidini önceden doğrulamalı; istemcinin servis nesnesi doğrudan iletilmemelidir.

```js
validateDocumentReferences(client, {
  service, assignment, document,
  referenceAdapter: require('./themePlatformStudioDocument').commerceReferences
});

validateCandidateDocumentReferences(client, {
  service,
  candidate: { theme_version_id, channel, commerce_mode },
  document, referenceAdapter
});

preview(client, { service, assignment, query });
previewCandidate(client, { service, candidate, query });

authenticatedProductPreview(client, { service, assignment, productId });
authenticatedProductPreview(client, { service, candidate, productId });
authenticatedQuotePreview(client, { service, assignment, body });
authenticatedQuotePreview(client, { service, candidate, body });
```

Atama henüz yokken aday sürüm/servis gerçek veritabanından doğrulanır; sahte atama kimliği üretilmez. Aday önizlemede `context.assignment=null`, `context.candidate` bulunur. Atanmış önizleme gerçek atama kimliğini döndürür. Her iki sonuç `source: CANONICAL_PREVIEW`, `live:false`, mağaza kimliği, ürün sayfası, kategoriler, koleksiyonlar ve kapsamlı menü içerir.

Kimliği doğrulanmış ürün detayı bağlayıcısı `{product,reviews,questions,recommendations}` döndürür; son üç alan dizidir. Ürün puanı/yorumu ve soru-cevap korunur, yabancı mağaza ürünü 404 alır. Fiyat hesabı bağlayıcısı aynı kanonik `quote` sonucunu döndürür. Bu iki fonksiyona `assignment` veya `candidate` seçeneklerinden tam biri verilir; ikisi birden veya ikisi de yoksa reddedilir. HTTP oturum/yetki kontrolü çağıran Experience router'ında kalır.

V1 bileşen `productIds/categoryIds/collectionIds/variants/target/imageAssetId` bağları denetlenir. Native Studio şema 2 için `commerceReferences` bağlayıcısı zorunludur; tanınmayan şema sessizce boş kabul edilmez. Manifest ürün/kategori/koleksiyon kimlikleri, ürün-varyant çiftleri, menü hedefleri ve varlık kimlikleri içerir.

Native hedefler `home`, `categories`, `search`, `cart`, `account`, `support`, `favorites`, `product:N`, `category:N`, `collection:N`, Android ürün/kategori hedefleridir. `page:id` yalnız aynı native belgedeki etkin sayfaya yönlenebilir. Bu hedefin geçerli olması, hesap/destek yazma API'sinin özel alanda hazır olduğunu göstermez. V1 `/product/N`, `/category/slug`, `/collection/slug` hedefleri aynı kapsamda denetlenir. Dış URL veya başka mağaza hedefi reddedilir.

Varlık yetkisi `theme_assets` içindeki servis + organizasyon + mağaza + READY durumundan gelir. Paket görsellerinin doğrulanmış byte deposu ve MIME/boyut kontrolleri ayrı paket/varlık servisinin sorumluluğudur; bu dosya yeni dosya yolu, URL veya byte otoritesi yaratmaz.

## Fiyat, stok, varyant ve sepet

Ürün DTO'ları mevcut `publicStoreProjectionService.toPublicProduct` ve güvenli medya URL kurallarını kullanır. Varyantlar `purchasableVariantService.publicVariants/resolve` ile okunur. Tema fiyat/stok belirleyemez.

```json
{
  "items": [
    { "productId": 123, "variantId": 45, "quantity": 1 },
    { "productId": 123, "variantId": 46, "quantity": 2 }
  ],
  "couponCode": null
}
```

Önce tüm ürün ve varyantlar alan adının kanonik mağazasında doğrulanır, sonra mevcut `pricingService.calculatePricing({client,lockCoupon:false})` çağrılır. Fiyat, indirim, kupon, kargo ve toplamın tek otoritesi bu servistir. Sonuç iç kullanıcı/SKU/mağaza alanları çıkarılarak sunulur. İki varyant iki satır kalır. Fiyat hesabı stok ayırmaz; sipariş/ödeme kaydı oluşturmaz.

Kanonik ortak sepetin ürün kimliğiyle birleştirme sorunu B03 bu çalışmada yarım düzeltilmedi. `checkout.enabled=false`, `VARIANT_CART_DEFERRED_WITH_PLAN` ve `inventoryReserved=false` açıkça döndürülür. Tam çözüm ve taşıma planı `theme-platform-variant-cart.md` içindedir. Genel ödeme API'si özel hostta engellenir; bu engel testten veya arayüzden kaldırılarak canlı ödeme iddiası üretilemez.

## Mağaza kimliği ve hukuk

Mağaza adı, açıklama, kargo/iade özeti sunucu mağaza profilinden gelir. Onaylı `seller_public_legal_identities` kaydının sürümü/hash'i ve kamusal kimliği doğrulanıp döndürülür. Başka organizasyonun hukuki kimliği görünmez.

Mevcut kanonik profil logo, kamuya açık iletişim ve sosyal alanları sağlamadığı için `logo_url/contact/social=null` döner; örnek değerle doldurulmaz. Global platform hukuk dokümanları mağazaya ait dokümanmış gibi sunulmaz. Mağaza/yerel dil/sürüm temelli hukuk CMS'i için `legal_cms_status: STORE_LEGAL_CMS_REQUIRED` bildirilir.

## Çalıştırılan doğrulama

```powershell
node --check services/themePlatformCommerceService.js
node --check routes/themeStorefrontRoutes.js
node tests/themePlatformCommerceUnitSmoke.js
node tests/themePlatformCommercePostgresSmoke.js --execute-disposable-db
```

- 35 birim kontrolü: Host normalleştirme/ret kuralları, yinelenen üstbilgi, forwarded Host, manifest biçimi ve koruyucu yönlendirme. Birim testindeki veritabanı nesnesi yalnız test double'dır.
- 28 PostgreSQL/HTTP kapısı: 42 migration tam kayıt listesi, iki gerçek test mağazası, kanonik ürün/varyant/kategori/koleksiyon/yorum/soru kayıtları, karşı mağaza ve olmayan kimliklerde aynı 404, fiyat sahteciliği, iki varyant satırı, stok sınırı, varlık yetkisi, revoke/expire/suspend/pause, aday teklif ve native önizleme. Son üç kapı gerçek veritabanında dahili PDP/fiyat önizleme fonksiyonlarını doğrudan sınar; HTTP oturum testinin yerine geçmez.
- HTTP gerçekten loopback sunucuya gider. Bu Node sürümünün `fetch` işlevi Host'u yeniden yazdığı için test `node:http.request` kullanır. Socket yalnız `127.0.0.1`'e bağlanır; tenant Host üstbilgisi gerçekten sunucuya ulaşır.
- Her çalıştırma yalnız kendisinin açtığı PostgreSQL 16 konteynerini kullanır ve kaldırır. Harici HTTP girişimi 0; günlüklerde credential kontrolü PASS. Gerçek/uzak veritabanı, DNS, sağlayıcı ve üretim ayarı kullanılmadı.
- Bu testte varlık byte okuyucusu test double'dır ve READY metadata fixture ile kurulur. Bu kapı varlık izolasyonunu doğrular; gerçek resim decode/depolama testinin yerine geçmez.

## Kalan üretim kapıları

1. Onaylı değişmez yayın artefaktı → deployment → doğrulanmış domain canlı etkinleştirmesi; şu anda genel context `live:false`, `VERIFIED_BINDING_PREVIEW_ONLY` döndürür.
2. Gerçek DNS/TLS/ters vekil doğrulaması; Host ve cache isolation dağıtım testleri.
3. B03 ortak sepet sözleşmesi ve özel mağazada kimliği doğrulanmış müşteri/checkout adapter'ı, server-side son fiyat/stok yeniden doğrulaması, ödeme/geri alma testleri.
4. Mağazaya ait onaylı logo/iletişim/sosyal ve sürümlü hukuk CMS'i; destek mesajı yönlendirme yazma akışları.
5. Yorum/soru sayfalama ve yazma/izin akışları; gelişmiş öneri, katalog faceti ve yüksek hacimli koleksiyon performansı.
6. Gerçek tarayıcıda aynı Studio renderer'ının ve satıcı görünümünün kabulü; bu rapordaki API testleri görsel kabul yerine geçmez.

Bu listedeki eksikler uygulandı veya canlıya hazır diye raporlanamaz. Mevcut müşteri/Admin/Android üretim tasarımları ve Stocky runtime değiştirilmeden geliştirme dalında ayrı tutulur.

Mapped SINGLE_STORE host belge yolları (`/`, `/magaza/...`, `/admin-login`, statik kaynak yolları) 503 `STOREFRONT_NOT_PUBLISHED` döndürür. Doğrulanmış bağ genel pazaryeri HTML fallback yetkisi değildir. Kapsamlı API ayrı çalışır. Ürün DTO `category_ids` yalnız yetkili ürünlerin görünür canonical kategori zincirinden gelir; başka mağazanın kategori adı/sayısı taşınmaz.
