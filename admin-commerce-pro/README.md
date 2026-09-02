# NovaStore Admin Commerce Pro

NovaStore Admin Commerce Pro iki ayrı ve birbirine karıştırılmaması gereken artifact içerir:

- `admin-commerce-pro.html`: gerçek sistemlerden izole, sıfır ağ istekli etkileşimli tasarım önizlemesi.
- `admin-commerce-pro-live.html`: aynı-origin Admin oturumu ve API'leriyle çalışan kanonik operasyon yüzeyi. Varsayılan Admin login hedefi ve legacy Admin üst bağlantısı bu live artifact'e gider.

Live artifact; Dashboard ile birlikte marketplace sipariş, mağaza/Seller bağı, ürün, iade, bildirim ve ortak katalog yapı projection'larını okur. Yazma yetkisi yalnız sunucunun açıkça verdiği capability ve kaynak sahipliği sınırları içinde açılır. Preview verisi, live yüzeye veya API projection'ına hiçbir koşulda taşınmaz.

## Güvenlik ve entegrasyon sınırı

- Preview yalnız yerel örnek veri kullanır. Değişiklikler sayfa yenilendiğinde sıfırlanır; API, WebSocket, production/remote veritabanı, ödeme, auth veya sır/env bağlantısı yoktur.
- Live artifact `nova_admin_token` ile yalnız aynı-origin Admin yollarını kullanır. Mutlak URL ve cross-origin API yolu reddedilir; hata halinde preview/mock veriye düşülmez.
- Varsayılan Admin login başarı hedefi `frontend/admin-commerce-pro-live.html` dosyasıdır. Legacy `frontend/admin.html` içindeki Commerce Pro operasyon bağlantısı da preview yerine live artifact'i açar. Preview artifact'i login veya kanonik operasyon hedefi değildir.
- Marketplace read projection; sipariş kalemlerini, Seller organizasyon ve mağaza allocation'larını, mağaza sahiplik bağını, ürünün mağaza/Seller bağını, ödeme-refund durumunu ve güvenli provider referanslarını bounded DTO'larla gösterir. Bu alanlar görünürlük sağlar; Admin'e kendiliğinden yazma yetkisi vermez.
- Ürün projection'ında platform ve Seller ürünleri birlikte görünür. Yalnız `adminEditable: true` olan birinci taraf platform ürünü Admin detay/düzenleme/medya/arşivleme mutation'larına açılabilir. Seller ürünü salt okunurdur; orphan veya doğrulanamayan mağaza bağı Seller sahipliği diye varsayılmaz ve fail-closed salt okunur gösterilir.
- Mağaza projection'ı Seller mağaza/organizasyon kimliği ve durumlarını gösterir. `ownershipVerified: false` olduğunda sahiplik bağının doğrulanmadığı açıkça belirtilir; görünen ad veya kimlik yetki kanıtı değildir.
- Ortak katalog yapısı endpoint'i kategori, özellik tanımı, özellik şablonu, koleksiyon, menü ve menü öğelerini bounded sayfalarda döndürür. Ürün hard-delete yolu kapalıdır; katalog mutation rotaları güncel DB Admin rolünü ve capability'yi doğrular.
- Oturumdaki `paymentProvider` yalnız güvenli readiness özetidir: `provider`, `ready`, `state` ve varsa `testMode`. UI `provider_not_configured`, `credentials_required`, `client_ip_config_required`, `production_test_mode_forbidden`, `activation_required` ve `ready` durumlarını açıkça ayırır; bilinmeyen/eksik state'i fail-closed gösterir. Banner sır, credential veya sağlayıcı erişim kanıtı taşımaz ve ödeme yapıldığını kanıtlamaz.
- İptal yalnız `orderCancelWrite: true` olduğunda, desteklenen sipariş/ödeme/refund durumunda ve açık etki onayıyla sunulur. İstek beklenen durum ve idempotency anahtarı taşır. Admin iptali provider refund çağrısı çalıştırmaz.
- Platform manuel kargo devri yalnız `manualShipmentWrite: true`, platform sahipliği, desteklenen `Hazırlanıyor`/ödeme/refund durumu ve açık fiziksel teslim onayıyla sunulur. Seller allocation'ı olan siparişte Admin platform devri açılmaz. Bu işlem taşıyıcı API'si çağırmaz; etiket, takip numarası veya takip URL'si üretmez.
- Manuel teslim doğrulaması aynı capability altında yalnız `Kargoya Verildi + PAID + refund NONE + shipment IN_TRANSIT`, mevcut provider ve takip numarası koşullarında gösterilir. Platform siparişi veya tek Seller allocation'lı sipariş desteklenir; çok Seller'lı sipariş fail-closed kalır. Açık onay, expected-state ve idempotency zorunludur.
- Sipariş ekranındaki provider/ref/external ref, ödeme hatası, refund ve kargo alanları NovaStore'un yerel operasyon gerçeğini görünür kılar. Bunlardan refund settlement, taşıyıcı doğrulaması veya dış sağlayıcı işlemi çıkarımı yapılmaz.
- Live UI gerçek refund, ödeme/provider, taşıyıcı, payout, Cloudinary veya başka bir dış servis çağrısı yapmaz. Kontrollü sipariş mutation'ları yalnız NovaStore same-origin endpoint'lerine gider; `409` veya yetki/durum uyuşmazlığında fail-closed kalır ve projection yeniden okunur.
- Capability görünürlüğü sunucu yetkilendirmesinin yerine geçmez. Backend her istekte güncel Admin rolünü, kaynak sahipliğini, beklenen durumu ve idempotency sözleşmesini yeniden doğrular.

## Etkileşim kapsamı

Önizleme yalnız tarayıcı belleğinde çalışan gerçekçi bir yönetim oturumudur. Aşağıdaki akışlar sayfa yenilenene kadar yerel olarak durum değiştirir:

- 28 siparişte mağaza kapsamı, 12 kayıttan Bugün görünümü, arama, durum filtresi, gerçek sayfalama, satır/toplu seçim, sahip atama, durum ilerletme ve sipariş notu; KPI/grafiklerde ayrı tarih dönemi kapsamı.
- Satıcı siparişleri, iadeler ve stok riskleri; kanonik ürün ile satıcı teklifi sahipliğini ayıran katalog görünümü, NovaStore birinci taraf kayıt oluşturma ve haricî satıcı fiyat/stok/SKU alanlarını koruyan içerik inceleme.
- Ürün yayını insan onayı varsaymaz: `demo-catalog-policy-v0.1` satıcı durumu, kategori izni, zorunlu ürün alanları, marka yetkisi, kanonik eşleşme güveni, yasak içerik ve fiyat anomalisi sinyallerini gerçekten değerlendirir. Normal teklif `Otomatik yayında`, düzeltilebilir eksik `Satıcı aksiyonu`, yalnız kısıt/yetki gibi gerçek istisna `İstisna incelemesi` olur; yedi zorunlu girdiden biri eksik/geçersizse veya satıcı aktif değilse sonuç fail-closed kalır. Her sonuç reason code, kural sürümü ve örnek değerlendirme zamanı taşır. Yayın kararı ile `Stokta / Düşük stok / Stokta yok` ekseni ayrıdır.
- Teklif kimliği `offerId`, sahiplik ise değişmez `sellerId + ownershipType` ile belirlenir; görünen satıcı adı yetki vermez. Satıcı SKU benzersizliği global değil seller-scope içindedir. Aynı kanonik ürüne bağlı teklifler ortak içerik güncellemesini paylaşırken birbirinin fiyat/stok/SKU alanını değiştirmez.
- Müşteri arama, segment kartları, segment değişikliği ve CSV; satıcı şirket onboarding filtreleri, belge ayrıntısı, not, onay/red ve zorunlu red gerekçesi. Onboarding onayı şirket/KYC/sözleşme/banka içindir, ürün bazlı izin değildir.
- Hardcode `Düşük / Orta / Yüksek` satıcı riski kaldırıldı. `demo-onboarding-v0.1` kural seti, yalnız inceleme sırası öneren açıklanabilir puan/neden/tamlık/engel dökümü gösterir; otomatik onay, red veya dolandırıcılık tespiti iddiası taşımaz.
- Mağaza kapsamlı hakediş filtreleri, ayrıntı, güvenli akış simülasyonu ve CSV; dönemle ölçeklenen satış raporu ve CSV.
- Modül genel kullanılabilirlik simülasyonu, rol düzeni özeti/oluşturma, denetim arama/CSV, çalışma alanı ayarları, bildirimler ve yerel hızlı-oluştur taslakları.
- Klavyeyle kullanılabilen komut paleti, odak geri dönüşü, mobil bağlamsal menü, compact sipariş modalı, boş durumlar ve önizlemeyi sıfırlama.

Gerçek servis gerektiren görünür kontroller etkin bir sahte işlem yapmaz; devre dışı ve `Entegrasyonda` etiketiyle sunulur.

## Yerel geliştirme

```bash
cd admin-commerce-pro
npm ci
npm run dev
```

Vite'ın verdiği yerel adreste izole preview açılır. Üretimden veya uzak servislerden veri çekilmez; bu geliştirme modu live Admin oturumunun yerine geçmez.

## Tek dosyalık entegrasyon çıktısı

```bash
cd admin-commerce-pro
npm run build:integrated
```

Bu komut fontları, ürün görsellerini, ikonları, CSS'i ve JavaScript'i tek belgeye gömerek `frontend/admin-commerce-pro.html` üretir. Çıktı `noindex,nofollow,noarchive` etiketi taşır ve uygulamanın statik frontend sunucusundan `/admin-commerce-pro.html` yolunda açılabilir.

Capability kontrollü entegre artifact:

```bash
cd admin-commerce-pro
npm run build:live:integrated
```

Bu komut `frontend/admin-commerce-pro-live.html` üretir. Artifact `connect-src 'self'` CSP'si taşır ve yalnız NovaStore backend ile aynı origin'de çalışır. Varsayılan Admin login hedefi ve legacy Commerce Pro operasyon bağlantısı bu dosyayı açar. Build komutu tek başına deployment, uzak servis çağrısı veya production yayını yapmaz.

## Deterministik artifact ve fingerprint sözleşmesi

Standalone üretici, nihai preview ve live HTML çıktılarını platformdan bağımsız LF byte'larıyla yazar. Artifact smoke kapıları CR byte kalmadığını ve aynı girdilerle arka arkaya iki üretimin birebir aynı SHA-256 değerini verdiğini doğrular.

Canonical kaynak fingerprint'i açık bir dosya türü allowlist'i kullanır: metin girdilerinde `CRLF` ve lone `CR` satır sonları hash öncesinde `LF` olur; PNG, WebP ve WOFF2 girdileri ise ham byte olarak kalır. Yalnız repository-relative POSIX yollar hash'e girer. Bu sözleşme Windows `core.autocrlf=true` checkout'larını destekler; mutlak makine yolu fingerprint'e eklenmez.

Preview ve live artifact'leri yalnız mevcut build scriptleriyle üretin; generated HTML'i elle düzenlemeyin:

```powershell
cd admin-commerce-pro
$artifactPaths = @('..\frontend\admin-commerce-pro.html', '..\frontend\admin-commerce-pro-live.html')
npm run build:integrated
npm run build:live:integrated
$firstBuild = Get-FileHash -LiteralPath $artifactPaths -Algorithm SHA256
```

Deterministik kontrol için aynı iki build komutunu ikinci kez çalıştırın; `Compare-Object` çıktı vermemelidir:

```powershell
npm run build:integrated
npm run build:live:integrated
$secondBuild = Get-FileHash -LiteralPath $artifactPaths -Algorithm SHA256
Compare-Object $firstBuild $secondBuild -Property Path, Hash
```

Bu üretim ve doğrulama akışı production/deploy, veritabanı, migration, gerçek ödeme, refund veya dış servis write işlemi çalıştırmaz.

## Güvenli doğrulama

Commerce Pro klasöründen tam build + model + artifact doğrulaması:

```bash
cd admin-commerce-pro
npm run verify
```

Repo kökünden bağımsız artifact kontrolleri:

```bash
node tests/adminCommerceProModelSmoke.mjs
node tests/adminCommerceProPreviewSmoke.js
node tests/adminCommerceProHttpSmoke.mjs
node tests/adminCommerceProSessionContractSmoke.js
node tests/adminCatalogMutationFoundationSmoke.js
node tests/adminLoginNextSmoke.js
node tests/adminCommerceProLiveSmoke.mjs
node tests/adminCommerceProFirstSaleUiSmoke.mjs
node admin-commerce-pro/scripts/order-mutations-smoke.mjs
COMMERCE_PRO_PREVIEW_PATH=admin-commerce-pro/standalone/index.html node tests/adminCommerceProPreviewSmoke.js
```

Testler sayfalama/arama/mağaza kapsamı/ürün doğrulama/CSV güvenliği ve örnek veri ilişkilerine ek olarak preview politika simülasyonlarını doğrular. Preview için kaynak parmak izi, `connect-src 'none'`, önizleme uyarısı ve sıfır ağ/ödeme çağrısı korunur. Live build için aynı-origin yol zorlaması, JWT ön kontrolü, 401/403 ayrımı, güncel DB Admin rolü, bounded/PII-azaltılmış marketplace projection'ları, Seller ürününün salt-okunur sınırı, doğrulanmamış mağaza sahipliği, güvenli payment-provider readiness matrisi, capability kapıları, kapalı mutation'ların adapter/UI yüzeyinden düşmesi, varsayılan login/live hedefi, idempotency ve expected-state gövdeleri test edilir. Sipariş smoke'ları kontrollü iptal, yalnız platform için manuel kargo devri ve platform/tek Seller için koşullu teslim doğrulama sınırlarını; dış provider/refund/taşıyıcı çağrısı yapılmadığını sabitler. Standalone üretici eski bundle'ı güncel kaynaklarla yeniden damgalamayı reddeder. Production DB, gerçek ödeme, refund, Cloudinary veya taşıyıcı testi çalıştırılmaz.

## Geçici mock önizlemesi

Dağıtım için ayrıca yetki verildiğinde bu dal, sır veya environment variable eklenmeden ayrı bir Vercel Preview veya eşdeğer static preview olarak yayınlanabilir:

- Build command: `cd admin-commerce-pro && npm ci && npm run build:integrated`
- Publish directory: `frontend`
- Preview route: `/admin-commerce-pro.html`

Preview production hedefi değildir; gerçek auth, veritabanı veya ödeme environment'ı bağlanmamalıdır. Preview deployment'ı live Admin artifact'ini, varsayılan login hedefini veya legacy live operasyon bağlantısını değiştirmez. Geri alma yalnız ayrı preview deployment'ını kaldırmaktır.

## Entegrasyon yürütme planı

Tur sırası, değişmez güvenlik kapıları ve route/capability özeti `docs/INTEGRATION-EXECUTION-PLAN.md` içinde tutulur. Çalışma zamanı için bu README'deki live marketplace projection, kaynak sahipliği ve capability sınırları esastır. Önizlemedeki kayıtlar, eşikler ve simülasyonlar production politikası değildir. İleriye dönük çok satıcılı tasarım için `docs/MULTI-VENDOR-PLAN.md`, bilgi mimarisi ve modül sınırları için `docs/ADMIN-IA-AND-MODULES.md` referans olabilir; hiçbir plan Seller ürününde Admin yazma yetkisi, dış provider çağrısı veya doğrulanmamış refund/teslim gerçeği oluşturmaz.
