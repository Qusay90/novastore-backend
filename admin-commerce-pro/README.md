# NovaStore Admin Commerce Pro

NovaStore'un Commerce Pro görsel yönünü ve gelecekteki çok satıcılı yönetim bilgi mimarisini taşıyan iki ayrı build içerir:

- `admin-commerce-pro.html`: gerçek sistemlerden izole, sıfır ağ istekli etkileşimli tasarım önizlemesi.
- `admin-commerce-pro-live.html`: admin oturumu ile yalnız aynı-origin API'den Dashboard, sipariş, iade ve admin bildirimi özetlerini okuyan, tek-satıcı sınırındaki entegrasyon yüzeyi.

Mevcut backend bugün tek satıcılıdır; preview içindeki pazaryeri kayıtları çalışan servisler değil, açıkça etiketlenmiş hedef model simülasyonudur. Entegre build bu kayıtları hiçbir koşulda göstermez.

## Güvenlik ve entegrasyon sınırı

- Mevcut `frontend/admin.html` çalışan/kabul edilen admin yüzeyi olarak kalır; Commerce Pro entegre build henüz cutover değildir.
- Preview yalnız yerel örnek veri kullanır. Değişiklikler sayfa yenilendiğinde sıfırlanır; API, WebSocket, production/remote veritabanı, ödeme, auth veya sır/env bağlantısı yoktur.
- Entegre build `nova_admin_token` ile `/api/admin/session`, `/api/admin/stats`, limitli `/api/admin/orders/summary`, `/api/admin/returns/summary` ve `/api/admin/notifications/summary` yollarını salt-okunur kullanır. Mutlak URL ve cross-origin API yolu reddedilir; hata halinde mock veriye düşülmez.
- Sipariş görünümündeki kargo bilgisi yalnız yerel NovaStore kaydıdır ve arayüzde taşıyıcı tarafından doğrulanmadığı açıkça belirtilir. İade görünümü talep edilen tutarı ve yerel refund durumunu gösterir; ödeme sağlayıcısına refund çağrısı yapıldığı anlamına gelmez.
- Entegre Commerce Pro arayüzü sipariş/iade/bildirim mutation'ı, kargo oluşturma, ürün CRUD'u, satıcı, müşteri, hakediş, payout, ödeme veya Cloudinary isteği göndermez. Bu UI capability bayrakları genel backend yetkisi değildir; mevcut legacy admin mutation yolları Tur 2 yaşam döngüsü güvenlik çekirdeği tamamlanana kadar Commerce Pro'ya açılmaz.
- Dinamik modül yükleme, migration, seller scope/RBAC enforcement ve çok satıcılı backend bu değişiklikte uygulanmaz.
- Gerçek backend'de dış satıcının ürün yükleyebildiği bir portal, seller offer servisi veya ürün başvuru/onay akışı yoktur. Mevcut ürün CRUD'u admin tarafından yönetilen birinci taraf NovaStore kataloğudur.
- `frontend/admin.html`, önizlemeyi yeni sekmede açan güvenli bir bağlantı içerir.

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

Vite'ın verdiği yerel adreste preview açılır. Üretimden veya uzak servislerden veri çekilmez.

## Tek dosyalık entegrasyon çıktısı

```bash
cd admin-commerce-pro
npm run build:integrated
```

Bu komut fontları, ürün görsellerini, ikonları, CSS'i ve JavaScript'i tek belgeye gömerek `frontend/admin-commerce-pro.html` üretir. Çıktı `noindex,nofollow,noarchive` etiketi taşır ve uygulamanın statik frontend sunucusundan `/admin-commerce-pro.html` yolunda açılabilir.

Salt-okunur entegre artifact:

```bash
cd admin-commerce-pro
npm run build:live:integrated
```

Bu komut `frontend/admin-commerce-pro-live.html` üretir. Artifact `connect-src 'self'` CSP'si taşır ve yalnız NovaStore backend ile aynı origin'de çalışır. Admin login dönüş hedefi allowlist ile bu dosyaya yönlendirilebilir. Bu build deployment veya production cutover yapmaz.

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
node tests/adminLoginNextSmoke.js
node tests/adminCommerceProLiveSmoke.mjs
COMMERCE_PRO_PREVIEW_PATH=admin-commerce-pro/standalone/index.html node tests/adminCommerceProPreviewSmoke.js
```

Testler sayfalama/arama/mağaza kapsamı/ürün doğrulama/CSV güvenliği ve örnek veri ilişkilerine ek olarak gerçek politika kurallarını, eksik girdide fail-closed davranışı, otomatik yayın/istisna/satıcı aksiyonu ayrımını, yayın-stok eksenlerini, `offerId` kimliğini, seller-scope SKU'yu, kanonik içerik yayılımını, haricî teklif alanlarının değişmez sahiplik kimliğiyle korunmasını, açıklanabilir onboarding puanını, eksik belge fail-closed davranışını, eşikleri ve onay engellerini doğrular. Preview için kaynak parmak izi, `connect-src 'none'`, önizleme uyarısı ve sıfır ağ/ödeme çağrısı korunur. Entegre build için aynı-origin yol zorlaması, JWT ön kontrolü, 401/403 ayrımı, güncel DB admin rolü, bounded/PII-azaltılmış sipariş-iade-bildirim DTO'ları, bağımsız capability kapıları, login allowlist'i, `connect-src 'self'`, no-write artifact ve mock fallback yasağı test edilir. Standalone üretici eski bundle'ı güncel kaynaklarla yeniden damgalamayı reddeder. Production DB veya ödeme testi çalıştırılmaz.

## Geçici mock önizlemesi

Dağıtım için ayrıca yetki verildiğinde bu dal, sır veya environment variable eklenmeden ayrı bir Vercel Preview veya eşdeğer static preview olarak yayınlanabilir:

- Build command: `cd admin-commerce-pro && npm ci && npm run build:integrated`
- Publish directory: `frontend`
- Preview route: `/admin-commerce-pro.html`

Preview production hedefi değildir; gerçek auth, veritabanı veya ödeme environment'ı bağlanmamalıdır. Geri alma; preview deployment'ını silmek ve gerekirse `frontend/admin.html` içindeki bağlantı ile önizleme artifact'ını kaldırmakla sınırlıdır.

## Entegrasyon yürütme planı

Tur sırası, tahminler, değişmez güvenlik kapıları ve route/capability özeti `docs/INTEGRATION-EXECUTION-PLAN.md` içinde tutulur. Mevcut tek satıcılı ürünleri `NOVASTORE_FIRST_PARTY` yapısına güvenli backfill edecek kanonik ürün/seller offer ayrımı, seller-scope/RBAC enforcement, sürümlü yayın politikası, admin override audit'i ve staging UAT ayrı plan/PR'lerle ilerlemelidir. Önizlemedeki eşikler production politikası değildir. Çok satıcılı hedef model için `docs/MULTI-VENDOR-PLAN.md`, bilgi mimarisi ve modül sınırları için `docs/ADMIN-IA-AND-MODULES.md` temel alınır.
