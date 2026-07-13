# NovaStore Admin Commerce Pro Preview

NovaStore'un Commerce Pro görsel yönünü, yoğun operasyon masası yaklaşımını ve çok satıcılı yönetim bilgi mimarisini gerçek sistemlerden izole biçimde gösteren etkileşimli önizlemedir.

## Güvenlik ve entegrasyon sınırı

- Mevcut `frontend/admin.html` çalışan/kabul edilen admin yüzeyi olarak kalır; bu proje onun yerine geçmez.
- Arayüz yalnız yerel örnek veri kullanır. Değişiklikler sayfa yenilendiğinde sıfırlanır.
- API, WebSocket, production veya remote veritabanı, PayTR/ödeme, kimlik doğrulama ya da sır/env bağlantısı yoktur.
- Dinamik modül yükleme, migration, seller scope/RBAC enforcement ve çok satıcılı backend bu değişiklikte uygulanmaz.
- `frontend/admin.html`, önizlemeyi yeni sekmede açan güvenli bir bağlantı içerir.

## Etkileşim kapsamı

Önizleme yalnız tarayıcı belleğinde çalışan gerçekçi bir yönetim oturumudur. Aşağıdaki akışlar sayfa yenilenene kadar yerel olarak durum değiştirir:

- 28 siparişte mağaza kapsamı, 12 kayıttan Bugün görünümü, arama, durum filtresi, gerçek sayfalama, satır/toplu seçim, sahip atama, durum ilerletme ve sipariş notu; KPI/grafiklerde ayrı tarih dönemi kapsamı.
- Satıcı siparişleri, iadeler ve stok riskleri; ürün arama/filtreleme ile doğrulamalı ürün oluşturma ve düzenleme.
- Müşteri arama, segment kartları, segment değişikliği ve CSV; satıcı filtreleri, belge ayrıntısı, not, onay/red ve zorunlu red gerekçesi.
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

Testler sayfalama/arama/mağaza kapsamı/ürün doğrulama/CSV güvenliği ve örnek veri ilişkilerini; bağımsız çıktının kaynak parmak izini, CSP'sini, önizleme uyarısını, ana admindeki bağlantıyı ve istemeden eklenebilecek API/ağ/ödeme çağrılarını kontrol eder. Vite build, kendi kaynak parmak izini `dist` içine yazar; standalone üretici eski bir bundle'ı güncel kaynaklarla yeniden damgalamayı reddeder. Production DB veya ödeme testi çalıştırılmaz.

## Geçici mock önizlemesi

Dağıtım için ayrıca yetki verildiğinde bu dal, sır veya environment variable eklenmeden ayrı bir Vercel Preview veya eşdeğer static preview olarak yayınlanabilir:

- Build command: `cd admin-commerce-pro && npm ci && npm run build:integrated`
- Publish directory: `frontend`
- Preview route: `/admin-commerce-pro.html`

Preview production hedefi değildir; gerçek auth, veritabanı veya ödeme environment'ı bağlanmamalıdır. Geri alma; preview deployment'ını silmek ve gerekirse `frontend/admin.html` içindeki bağlantı ile önizleme artifact'ını kaldırmakla sınırlıdır.

## Gelecek entegrasyon kapısı

Gerçek sisteme bağlanmadan önce mevcut auth/session sözleşmesi yeniden kullanılmalı; bir API adapter katmanı, seller-scope/RBAC enforcement, loading/error/empty durumları, audit/telemetry ve güvenli staging UAT ayrı bir plan/PR ile onaylanmalıdır. Çok satıcılı hedef model için `docs/MULTI-VENDOR-PLAN.md`, bilgi mimarisi ve modül sınırları için `docs/ADMIN-IA-AND-MODULES.md` temel alınır.
