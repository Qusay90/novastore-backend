# Category v2 Post-Tur 18K Release Readiness

Bu belge, Tur 18K sonrasındaki staging bulgularını ve production'a geçiş için güvenli uygulama sırasını kaydeder. Komutlar runbook örneğidir; bu belge hazırlanırken hiçbir staging veya production DB işlemi yapılmamıştır.

## 1. Mevcut doğrulama özeti

- Kategori public tree, descendant ürün filtreleme, canonical PLP, recursive storefront menüsü, koleksiyon route'u ve admin breadcrumb etiketleri staging'de çalışıyor.
- Aynı kategori adı farklı parent altında staging'de doğrulandı.
- Admin kategori ve ürün kategori bağlama akışları çalışıyor.
- Admin dashboard açılışında üç ayrı non-category endpoint hatası devam ediyor:
  - `GET /api/returns/admin/all`
  - `GET /api/admin/behavior?days=<n>`
  - `GET /api/notifications/admin`
- Collection kartları fiyatı raw DB değeriyle yazdırıyor. Bu sorun `fix/storefront-price-formatting` branch'inde frontend-only olarak düzeltildi.
- `/api/analytics/page-enter` istemcisi non-2xx cevapları kontrol etmediği için analytics 500 hatası tarayıcı konsolunda sessiz kalabilir. No-write kuralı nedeniyle endpoint'e doğrudan POST smoke yapılmadı.

## 2. Admin console error audit

| Alan | Frontend çağrısı | Backend bağımlılığı | Bulgular | Category release etkisi |
|---|---|---|---|---|
| İade talepleri | `fetchReturnsForDashboard` | `returns`, `orders`, `users` | Backend hata cevabı `adminReadJson` tarafından doğru biçimde yakalanıyor ve dashboard fallback gösteriyor. | Kategori için blocker değil; iade modülü için blocker. |
| Davranış analitiği | `fetchBehaviorAnalytics` | `visitor_sessions`, `page_visits`, `product_actions`, ürün ve sipariş tabloları | Backend 500 dönüyor; frontend boş analytics bileşenleri render ediyor. | Kategori için blocker değil; analytics readiness için blocker. |
| Bildirimler | `fetchAdminNotifications` | `notifications` | Backend hata nesnesi döndüğünde frontend dizi doğrulaması yapmadan `forEach` çağırıyor. | Kategori için blocker değil; admin notification readiness için blocker. |

Muhtemel ortak kök neden staging bootstrap kapsamının kategori/menu/collection tablolarıyla sınırlı kalmasıdır. Repo'da ilgili şemalar ayrı initializer'larda bulunur:

- `models/createCommerceDb.js`
- `models/createAnalyticsDb.js`
- `models/createNotificationDb.js`

Frontend hatalarını susturmak DB/schema eksikliğini çözmez. Önce read-only schema inventory ve backend log kanıtı alınmalıdır. Bildirim payload guard'ı ayrıca yapılabilir, ancak bu yalnız ikincil defensive handling düzeltmesidir.

## 3. Category theme ve UX polish planı

### 3.1 Acil UX düzeltmeleri

1. Collection ve bütün ürün kartlarında tek fiyat formatı kullan: `29.999,00 TL`.
2. PLP toolbar'a sonuç sayısı, sıralama select'i ve mobil filtre butonu ekle.
3. PLP kartında favori/sepet işlemi sonrası görünür ve `aria-live` destekli kısa durum bildirimi göster.
4. Favori butonunun `title` ve `aria-label` değerini aktif duruma göre değiştir.
5. Collection kartlarını PLP kartlarıyla aynı fiyat, stok, favori ve sepet davranışına yaklaştır.

### 3.2 Orta vadeli tema polish

- Desktop mega menüyü root sütunları, child başlıkları ve grandchild linkleriyle daha taranabilir hale getir.
- PLP hero yüksekliğini azalt; ürün gridini ilk viewport'ta daha erken başlat.
- Breadcrumb'ı mobilde yatay kaydırılabilir veya kontrollü wrap olacak şekilde sabitle.
- Ürün kartlarında görsel oranı, fiyat hiyerarşisi, indirim bilgisi, stok durumu ve CTA konumunu ortaklaştır.
- Empty state'e üst kategoriye dön, filtreleri temizle ve popüler alt kategori aksiyonları ekle.
- Collection sayfasını ayrı tema gibi göstermek yerine ortak storefront header, kart ve toolbar bileşenleriyle hizala.

### 3.3 Sol filtre ve sıralama planı

Desktop hedef düzeni:

- Sol: 240-280 px sticky filtre paneli.
- Sağ üst toolbar: sonuç sayısı, aktif filtre chip'leri, `Önerilen`, `Fiyat Artan`, `Fiyat Azalan`, `En Yeniler` sıralaması.
- Sağ: responsive ürün grid.

İlk frontend-only aşama:

- Kategori içi arama.
- Stokta olanlar toggle'ı.
- İstemci tarafı fiyat aralığı ve sıralama; yalnız mevcut sayfadaki küçük veri seti için.
- URL query state: `q`, `sort`, `inStock`, `minPrice`, `maxPrice`.

Backend/API gerektiren ölçekli aşama:

- Server-side pagination ve sort.
- Facet counts.
- Category attribute definitions üzerinden marka, beden, renk ve teknik özellik facet'leri.
- Filtrelerin descendant kategori kapsamıyla tek sorguda uygulanması.
- Canonical kararları: sıralama ve geçici filtre query'leri canonical kategori URL'sini değiştirmemeli.

### 3.4 Mobil drawer ve drill-down planı

- Üst menüdeki inline accordion erişilebilir durumda kalabilir; ana mobil kategori deneyimi ayrı tam-yükseklik drawer olmalı.
- Drawer ekranları: root liste -> child liste -> grandchild liste.
- Her seviyede geri butonu, mevcut breadcrumb başlığı ve `Tüm <kategori>` bağlantısı bulunmalı.
- PLP filtreleri bottom sheet veya sağdan drawer olarak açılmalı.
- Uygula/Temizle butonları sabit alt action bar içinde olmalı.
- Drawer açıldığında focus trap, Escape/kapatma ve body scroll lock sağlanmalı.

### 3.5 Collection polish planı

- Ortak storefront header ve breadcrumb kullan.
- H1, açıklama, ürün sayısı ve varsa banner'ı tek kompakt hero içinde göster.
- PLP ile aynı product card renderer veya ortak helper kullan.
- Pagination, sort ve stok filtresi ekle.
- Boş durumda ana sayfa dışında ilgili kategori veya diğer koleksiyonlara bağlantı ver.

### 3.6 Production öncesi / sonrası kararı

| İş | Production öncesi mi? | Gerekçe |
|---|---|---|
| Fiyat formatı | Evet | Küçük ve görünür güven/polish sorunu. |
| Favori/sepet erişilebilir durum metni | Tercihen evet | Temel etkileşim geri bildirimi. |
| PLP sort ve mobil filtre butonu iskeleti | Tercihen evet | Profesyonel kategori deneyiminin temel parçası. |
| Server-side facet API | Sonra yapılabilir | Veri ve performans ölçeğiyle birlikte tasarlanmalı. |
| Tam mega menü polish | Sonra yapılabilir | Canonical navigasyon çalışıyor; görsel iyileştirme. |
| Collection ortak kart/layout | Tercihen evet | Mevcut sayfa belirgin biçimde PLP'den kopuk. |

## 4. Favori ve sepet feedback audit

### Mevcut durum

- PLP favori butonu `active` class'ını değiştiriyor ancak `title` ve `aria-label` aktif duruma göre güncellenmiyor.
- PLP sepete ekleme state'i kaydediyor ve shared cart event'i yayımlıyor; kategori sayfasında belirgin toast veya mini drawer yok.
- Ana sayfa sepete ekleme sonrası cart drawer açıyor; feedback yüzeyleri sayfalar arasında tutarlı değil.
- `style.css` içinde toast stilleri ve ana sayfada toast container var, ancak kategori PLP bu altyapıyı kullanmıyor.

### Önerilen küçük frontend-only tur

1. Ortak `announceStorefrontAction(message, type)` helper'ı oluştur.
2. Görünür toast ile `role="status" aria-live="polite"` durum metnini birlikte güncelle.
3. Favoride metinleri duruma göre değiştir:
   - `Favorilere eklendi` / `Favorilerden çıkarıldı`
   - `Favorilere ekle` / `Favorilerden çıkar`
4. Sepette ürün adıyla `Sepete eklendi` bildirimi göster; badge değişimini kısa animasyonla vurgula.
5. Aynı helper'ı home, PLP, product ve collection kartlarında kullan.
6. Hata halinde optimistic state'i geri al ve assertive olmayan ama görünür hata mesajı göster.

## 5. Production backup ve restore runbook

### 5.1 Zorunlu hazırlıklar

- Production project ref ve staging/restore project ref ayrı kişilerce doğrulansın.
- DB operator, migration approver ve uygulama deploy sorumlusu isim olarak atansın.
- Production bağlantı dizesi yalnız operator shell'inde environment variable olarak bulunsun; komut geçmişine veya rapora yazılmasın.
- Uygulama deploy'u ile DB rollout'u ayrı onay kapıları olsun.
- Storage bucket dosyaları DB dump'a dahil değildir; kritik medya için ayrı export/envanter alınsın.

### 5.2 Backup alma

Supabase Free plan için manuel logical export zorunludur. Önerilen üç parçalı export:

```powershell
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$backupDir = "D:\secure-backups\novastore-$stamp"
New-Item -ItemType Directory -Path $backupDir | Out-Null

supabase db dump --db-url $env:CATEGORY_V2_PRODUCTION_DATABASE_URL `
  -f "$backupDir\roles.sql" --role-only

supabase db dump --db-url $env:CATEGORY_V2_PRODUCTION_DATABASE_URL `
  -f "$backupDir\schema.sql"

supabase db dump --db-url $env:CATEGORY_V2_PRODUCTION_DATABASE_URL `
  -f "$backupDir\data.sql" --use-copy --data-only `
  -x "storage.buckets_vectors" -x "storage.vector_indexes"

Get-FileHash "$backupDir\*.sql" -Algorithm SHA256 |
  Format-Table Path, Hash -AutoSize |
  Out-File "$backupDir\SHA256SUMS.txt"
```

Backup kabul şartları:

- Üç dosya da sıfırdan büyük.
- Komut exit code'ları `0`.
- SHA-256 manifest üretildi.
- Backup klasörü erişim kontrollü ve şifreli bir off-site konuma kopyalandı.
- Secret içeren shell transcript veya command history saklanmadı.

### 5.3 Restore testi

Restore doğrudan production'a yapılmaz. İki kabul edilebilir hedef:

1. Ayrı Supabase restore/staging project.
2. Production ile aynı major PostgreSQL sürümünde disposable local PostgreSQL.

Restore sırası:

```powershell
psql --set ON_ERROR_STOP=1 --single-transaction `
  --dbname $env:CATEGORY_V2_RESTORE_DATABASE_URL `
  --file roles.sql

psql --set ON_ERROR_STOP=1 --single-transaction `
  --dbname $env:CATEGORY_V2_RESTORE_DATABASE_URL `
  --file schema.sql

psql --set ON_ERROR_STOP=1 --single-transaction `
  --dbname $env:CATEGORY_V2_RESTORE_DATABASE_URL `
  --file data.sql
```

Restore kabul şartları:

- Restore komutları hatasız tamamlanır.
- Kritik tablo row count'ları kaynak backup envanteriyle eşleşir.
- PK/FK/unique index envanteri oluşur.
- `products`, `categories`, `users`, `orders`, `product_categories` örnek sorguları çalışır.
- Auth/storage özel trigger veya policy değişiklikleri ayrıca doğrulanır.
- Restore DB üzerinde uygulama read-only smoke testi geçer.

## 6. Production preflight SQL

### 6.1 Kategori bütünlüğü

```sql
-- Aynı parent altında duplicate aktif isim
SELECT COALESCE(parent_id, 0) AS parent_scope,
       LOWER(BTRIM(name)) AS normalized_name,
       COUNT(*) AS row_count,
       ARRAY_AGG(id ORDER BY id) AS category_ids
FROM categories
WHERE deleted_at IS NULL
GROUP BY COALESCE(parent_id, 0), LOWER(BTRIM(name))
HAVING COUNT(*) > 1;

-- Duplicate canonical path
SELECT LOWER(BTRIM(path)) AS normalized_path,
       COUNT(*) AS row_count,
       ARRAY_AGG(id ORDER BY id) AS category_ids
FROM categories
WHERE deleted_at IS NULL AND NULLIF(BTRIM(path), '') IS NOT NULL
GROUP BY LOWER(BTRIM(path))
HAVING COUNT(*) > 1;

-- Null/blank path
SELECT id, name, parent_id
FROM categories
WHERE deleted_at IS NULL AND NULLIF(BTRIM(path), '') IS NULL;

-- Orphan parent
SELECT c.id, c.name, c.parent_id
FROM categories c
LEFT JOIN categories p ON p.id = c.parent_id
WHERE c.parent_id IS NOT NULL AND p.id IS NULL;

-- Self parent
SELECT id, name, parent_id
FROM categories
WHERE parent_id = id;
```

Cycle kontrolü mevcut `categoryV2BackfillService` dry-run raporuyla ve ayrıca recursive CTE ile yapılmalıdır. Her cycle/orphan apply öncesi manuel karara bağlanmalıdır.

### 6.2 Product-category bütünlüğü

```sql
-- FK dışı/bozuk ilişkiler (FK yoksa da yakalar)
SELECT pc.product_id, pc.category_id
FROM product_categories pc
LEFT JOIN products p ON p.id = pc.product_id
LEFT JOIN categories c ON c.id = pc.category_id
WHERE p.id IS NULL OR c.id IS NULL;

-- Birden fazla primary
SELECT product_id, COUNT(*) AS primary_count
FROM product_categories
WHERE is_primary = TRUE
GROUP BY product_id
HAVING COUNT(*) > 1;

-- Görünür ürünlerde primary eksikliği
SELECT p.id, p.name, p.category, p.categories
FROM products p
LEFT JOIN product_categories pc
  ON pc.product_id = p.id AND pc.is_primary = TRUE
WHERE p.deleted_at IS NULL
  AND p.publication_status = 'active'
  AND p.is_customer_visible = TRUE
  AND pc.product_id IS NULL;

-- İlişki özeti
SELECT
  COUNT(DISTINCT product_id) AS related_products,
  COUNT(*) AS relation_count,
  COUNT(*) FILTER (WHERE is_primary) AS primary_count
FROM product_categories;
```

### 6.3 Legacy ambiguity ve unmatched envanteri

```sql
WITH legacy_names AS (
  SELECT p.id AS product_id, BTRIM(value) AS legacy_name
  FROM products p
  CROSS JOIN LATERAL UNNEST(
    ARRAY_REMOVE(
      ARRAY[p.category] || COALESCE(p.categories, ARRAY[]::TEXT[]),
      NULL
    )
  ) AS value
  WHERE NULLIF(BTRIM(value), '') IS NOT NULL
), matches AS (
  SELECT l.product_id,
         l.legacy_name,
         COUNT(c.id) AS category_match_count,
         ARRAY_AGG(c.id ORDER BY c.id) FILTER (WHERE c.id IS NOT NULL) AS category_ids
  FROM legacy_names l
  LEFT JOIN categories c
    ON LOWER(BTRIM(c.name)) = LOWER(BTRIM(l.legacy_name))
   AND c.deleted_at IS NULL
  GROUP BY l.product_id, l.legacy_name
)
SELECT *
FROM matches
WHERE category_match_count <> 1
ORDER BY category_match_count DESC, legacy_name, product_id;
```

`category_match_count = 0` unmatched, `> 1` ambiguous kabul edilir. Ambiguous kayıtlar otomatik tahmin edilmez.

## 7. Migration ve backfill sırası

1. Onaylı backup al.
2. Backup restore testini tamamla.
3. Production read-only preflight çalıştır; sonuçları timestamp'li artifact olarak sakla.
4. Uygulama sürümünü ve rollback commit'ini sabitle.
5. `20260701_category_v2_additive_foundation.sql` için production dry review yap, sonra transaction kontrollü uygula.
6. `20260702_menu_collection_foundation.sql` içindeki `order_items` backfill DML'ini ayrıca incele; yalnız preflight temizse uygula.
7. `20260703_collection_home_visibility.sql` uygula.
8. `20260704_attribute_filter_foundation.sql` uygula.
9. Category backfill dry-run çalıştır ve raporu onaylat.
10. Ambiguous/unmatched/orphan/cycle/primary-missing kayıtlar için manuel mapping kararı al.
11. Backfill apply çalıştır.
12. Backfill verification SQL'lerini çalıştır.
13. `20260702_category_v2_backfill_constraints.sql` migration'ını yalnız duplicate/path/orphan preflight temizken uygula.
14. Constraint ve index envanterini doğrula.
15. App deploy yap.
16. Endpoint/browser/admin smoke ve monitoring başlat.

Önemli: `scripts/categoryV2Backfill.js` bilinçli olarak local test DB'ye kilitlidir. Production'da kullanılmamalıdır. Production için ayrı, iki kişilik onay isteyen, default dry-run olan bir operator runner veya imzalı SQL runbook hazırlanmalıdır.

Önerilen production runner guard'ları:

- `CATEGORY_V2_ROLLOUT_TARGET=production`
- `CATEGORY_V2_ALLOW_PRODUCTION_BACKFILL=YES_I_HAVE_VERIFIED_BACKUP_AND_RESTORE`
- Beklenen production project ref allowlist'i.
- Default mode `--dry-run`; `--apply` açıkça verilmeden write yok.
- Backup artifact path ve SHA-256 manifest zorunlu.
- Preflight artifact path zorunlu.
- Apply öncesi ikinci operatör onay kodu.
- SQL transaction, statement timeout ve advisory lock.
- Secret, connection string ve row payload loglama yasağı.

## 8. Verification checklist

DB:

- Kategori kolonları, tabloları, FK'ler ve indexler mevcut.
- Global `categories.name UNIQUE` yok.
- Active sibling name unique index mevcut.
- Canonical path unique index mevcut.
- Her uygun üründe en fazla ve mümkünse tam bir primary ilişki var.
- Legacy `products.category` ve `products.categories` korunuyor.
- Backfill ikinci dry-run'ı değişiklik önermiyor.

API ve UI:

- `GET /api/public/categories?format=tree`
- `GET /api/products`
- `GET /api/products?category=<root>&includeDescendants=true`
- `GET /api/products?category=<leaf>&includeDescendants=true`
- `/kategori/<path>` ve query fallback
- `/koleksiyon/<slug>`
- Admin kategori ağacı
- Admin ürün dropdown/chip/primary breadcrumb
- Favori, sepet ve checkout'a girişe kadar smoke
- Android public-tree, descendant listing ve `Tümü` reset

## 9. Rollback planı

### App rollback

1. Yeni app sürümünü durdur veya önceki Render deploy/commit'e dön.
2. Legacy `products.category` ve `products.categories` alanlarını kullanan son stabil app sürümünü yeniden başlat.
3. API ve storefront smoke yap.

### DB rollback

- Olay sırasında additive kategori kolonlarını veya relation tablolarını drop etme.
- Yeni relation verisini silme; önce app rollback ile v2 okumasını devre dışı bırak.
- Constraint kaynaklı write kesintisinde yalnız önceden review edilmiş index/constraint rollback SQL'i kullan.
- Backup restore yalnız veri kaybı, yaygın yanlış eşleme veya geri alınamayan DML kanıtı varsa uygulanır.
- Restore kararı downtime, kaybedilecek yeni siparişler ve ödeme kayıtları değerlendirilmeden verilmez.
- Ödeme tabloları için production callback trafiği durdurulmadan restore yapılmaz.

## 10. Monitoring

İlk 15 dakika sürekli, sonraki 2 saat 15 dakikada bir, ilk 24 saat saatlik:

- `/api/public/categories?format=tree` status, latency ve root count.
- `/api/products` ve descendant filter 4xx/5xx oranı.
- `/kategori/<path>` ve `/koleksiyon/<slug>` 404/500 oranı.
- Admin category/product endpoint hata oranı.
- `category_stats` reconciliation farkı.
- Ambiguous legacy category hata sayısı.
- Analytics, notification ve return endpoint 500 oranı.
- Sepet/favori hata event'leri.

## 11. Final risk register

| Alan | Risk | Şiddet | Production blocker mı? | Önerilen çözüm | Tur |
|---|---|---:|---|---|
| Production DB | Doğrulanmış backup ve restore testi yok | Kritik | Evet | Üç parçalı logical dump, checksum, ayrı hedefte restore testi | Production backup gate |
| Category backfill | Production dry-run/apply yapılmadı | Kritik | Evet | Production-safe runner ve manuel ambiguity mapping | Production data gate |
| Admin dashboard | Return endpoint 500 | Yüksek | Kategori için hayır; iade modülü için evet | Schema inventory, backend log, commerce schema rollout | Admin readiness |
| Admin dashboard | Behavior analytics endpoint 500 | Yüksek | Kategori için hayır; analytics için evet | Analytics schema inventory ve controlled rollout | Analytics readiness |
| Admin dashboard | Notification endpoint hata payload'ı dizi sanılıyor | Orta | Hayır | Önce notification schema; sonra `adminReadJson` ve array guard | Admin defensive fix |
| Analytics | `/api/analytics/page-enter` 500 geçmişi; client non-2xx'i sessiz yutuyor | Yüksek | Gözlemlenebilirlik için evet | Read-only log kanıtı, analytics schema rollout, response status telemetry | Analytics readiness |
| PLP | Sol filtre/facet ve sort eksik | Orta | Küçük katalog için hayır | Toolbar + drawer; sonra server-side facet API | UX polish |
| Mobil kategori | Tam drawer/geri akışı yok | Orta | Hayır | Root/child/grandchild drawer ve focus yönetimi | UX polish |
| Favori/sepet | Toast ve screen-reader status eksik | Orta | Hayır | Ortak action feedback helper | Accessibility polish |
| Collection | Raw fiyat formatı | Orta | Tercihen evet | Ortak `tr-TR`, iki basamak fiyat helper'ı | `fix/storefront-price-formatting` |
| Collection | PLP'den kopuk kart/layout | Orta | Hayır | Ortak kart ve toolbar bileşenleri | UX polish |
| Staging güvenliği | Paylaşılan admin test parolası ve geçici admin role | Yüksek | Evet | Parola rotasyonu; gerekmiyorsa role kaldırma/hesabı kapatma | Security cleanup |
| Git hygiene | `.kotlin/sessions/*.salive` untracked oluşabiliyor | Düşük | Hayır | Kaynağın Android Studio/Kotlin compiler olduğu doğrulanınca ayrı turda ignore kuralı | Repo hygiene |
