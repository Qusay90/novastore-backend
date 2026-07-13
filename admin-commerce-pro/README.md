# NovaStore Admin Commerce Pro Preview

NovaStore'un Commerce Pro görsel yönünü, yoğun operasyon masası yaklaşımını ve çok satıcılı yönetim bilgi mimarisini gerçek sistemlerden izole biçimde gösteren etkileşimli önizlemedir.

## Güvenlik ve entegrasyon sınırı

- Mevcut `frontend/admin.html` çalışan/kabul edilen admin yüzeyi olarak kalır; bu proje onun yerine geçmez.
- Arayüz yalnız yerel örnek veri kullanır. Değişiklikler sayfa yenilendiğinde sıfırlanır.
- API, WebSocket, production veya remote veritabanı, PayTR/ödeme, kimlik doğrulama ya da sır/env bağlantısı yoktur.
- Dinamik modül yükleme, migration, seller scope/RBAC enforcement ve çok satıcılı backend bu değişiklikte uygulanmaz.
- `frontend/admin.html`, önizlemeyi yeni sekmede açan güvenli bir bağlantı içerir.

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

Repo kökünden:

```bash
node tests/adminCommerceProPreviewSmoke.js
```

Smoke testi bağımsız çıktıyı, önizleme uyarısını, ana admindeki bağlantıyı ve istemeden eklenebilecek API/ağ/ödeme çağrılarını kontrol eder. Production DB veya ödeme testi çalıştırmaz.

## Ayrı Render önizlemesi

Dağıtım için ayrıca yetki verildiğinde bu dal, sır veya environment variable eklenmeden ayrı bir Render **Static Site** olarak bağlanabilir:

- Build command: `cd admin-commerce-pro && npm ci && npm run build:integrated`
- Publish directory: `frontend`
- Preview route: `/admin-commerce-pro.html`

Bu repository değişikliği deploy yapmaz. Geri alma; `frontend/admin.html` içindeki önizleme bağlantısını, `frontend/admin-commerce-pro.html` çıktısını ve `admin-commerce-pro/` kaynak klasörünü kaldırmakla sınırlıdır.

## Gelecek entegrasyon kapısı

Gerçek sisteme bağlanmadan önce mevcut auth/session sözleşmesi yeniden kullanılmalı; bir API adapter katmanı, seller-scope/RBAC enforcement, loading/error/empty durumları, audit/telemetry ve güvenli staging UAT ayrı bir plan/PR ile onaylanmalıdır. Çok satıcılı hedef model için `docs/MULTI-VENDOR-PLAN.md`, bilgi mimarisi ve modül sınırları için `docs/ADMIN-IA-AND-MODULES.md` temel alınır.
