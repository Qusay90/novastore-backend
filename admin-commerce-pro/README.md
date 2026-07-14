# NovaStore Admin Commerce Pro Preview

NovaStore'un Commerce Pro görsel yönünü, yoğun operasyon masası yaklaşımını ve gelecekteki çok satıcılı yönetim bilgi mimarisini gerçek sistemlerden izole biçimde gösteren etkileşimli önizlemedir. Mevcut backend bugün tek satıcılıdır; pazaryeri kayıtları çalışan servisler değil, açıkça etiketlenmiş hedef model simülasyonudur.

## Güvenlik ve entegrasyon sınırı

- Mevcut `frontend/admin.html` çalışan/kabul edilen admin yüzeyi olarak kalır; bu proje onun yerine geçmez.
- Arayüz yalnız yerel örnek veri kullanır. Değişiklikler sayfa yenilendiğinde sıfırlanır.
- API, WebSocket, production veya remote veritabanı, PayTR/ödeme, kimlik doğrulama ya da sır/env bağlantısı yoktur.
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

Vite'ın verdiği yerel adreste arayüz açılır. Üretimden veya uzak servislerden veri çekilmez.

## Tek dosyalık entegrasyon çıktısı

```bash
cd admin-commerce-pro
npm run build:integrated
```

Bu komut fontları, ürün görsellerini, ikonları, CSS'i ve JavaScript'i tek belgeye gömerek `frontend/admin-commerce-pro.html` üretir. Çıktı `noindex,nofollow,noarchive` etiketi taşır ve uygulamanın statik frontend sunucusundan `/admin-commerce-pro.html` yolunda açılabilir.

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
COMMERCE_PRO_PREVIEW_PATH=admin-commerce-pro/standalone/index.html node tests/adminCommerceProPreviewSmoke.js
```

Testler sayfalama/arama/mağaza kapsamı/ürün doğrulama/CSV güvenliği ve örnek veri ilişkilerine ek olarak gerçek politika kurallarını, eksik girdide fail-closed davranışı, otomatik yayın/istisna/satıcı aksiyonu ayrımını, yayın-stok eksenlerini, `offerId` kimliğini, seller-scope SKU'yu, kanonik içerik yayılımını, haricî teklif alanlarının değişmez sahiplik kimliğiyle korunmasını, açıklanabilir onboarding puanını, eksik belge fail-closed davranışını, eşikleri ve onay engellerini doğrular. Bağımsız çıktının kaynak parmak izi, CSP, önizleme uyarısı, ana admindeki bağlantı ve istemeden eklenebilecek API/ağ/ödeme çağrıları da kontrol edilir. Vite build, kendi kaynak parmak izini `dist` içine yazar; standalone üretici eski bir bundle'ı güncel kaynaklarla yeniden damgalamayı reddeder. Production DB veya ödeme testi çalıştırılmaz.

## Geçici mock önizlemesi

Dağıtım için ayrıca yetki verildiğinde bu dal, sır veya environment variable eklenmeden ayrı bir Vercel Preview veya eşdeğer static preview olarak yayınlanabilir:

- Build command: `cd admin-commerce-pro && npm ci && npm run build:integrated`
- Publish directory: `frontend`
- Preview route: `/admin-commerce-pro.html`

Preview production hedefi değildir; gerçek auth, veritabanı veya ödeme environment'ı bağlanmamalıdır. Geri alma; preview deployment'ını silmek ve gerekirse `frontend/admin.html` içindeki bağlantı ile önizleme artifact'ını kaldırmakla sınırlıdır.

## Gelecek entegrasyon kapısı

Gerçek sisteme bağlanmadan önce mevcut tek satıcılı ürünleri `NOVASTORE_FIRST_PARTY` yapısına güvenli backfill edecek kanonik ürün/seller offer ayrımı, mevcut auth/session sözleşmesi, seller-scope/RBAC enforcement, sürümlü yayın politikası, açıklanabilir reason code'lar, admin override audit'i, loading/error/empty durumları ve güvenli staging UAT ayrı plan/PR'lerle onaylanmalıdır. Önizlemedeki eşikler production politikası değildir. Çok satıcılı hedef model için `docs/MULTI-VENDOR-PLAN.md`, bilgi mimarisi ve modül sınırları için `docs/ADMIN-IA-AND-MODULES.md` temel alınır.
