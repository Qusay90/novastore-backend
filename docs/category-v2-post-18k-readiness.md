# Category v2 Post-Tur 18K Release Readiness

Bu belge, Tur 18K sonrasındaki staging bulgularını ve production'a geçiş için güvenli uygulama sırasını kaydeder. Komutlar runbook örneğidir; bu belge hazırlanırken hiçbir staging veya production DB işlemi yapılmamıştır.

## 1. Mevcut doğrulama özeti

- Category v2 staging functional gate geçti.
- Kategori public tree, descendant ürün filtreleme, recursive storefront menüsü ve grandchild kategori bağlantıları staging'de çalışıyor.
- Doğrudan `/kategori/<path>` açılışı, query fallback, breadcrumb ve canonical PLP staging'de doğrulandı.
- Footer kategori bağlantıları canonical `/kategori/<path>` URL'lerini kullanıyor.
- Koleksiyon route'u ve Türkçe fiyat biçimi (`29.999,00 TL`, `899,90 TL`) staging'de doğrulandı.
- Aynı kategori adı farklı parent altında staging'de doğrulandı.
- Admin kategori ağacı, ürün kategori bağlama ve tam breadcrumb etiketleri staging runtime'da çalışıyor.
- Admin support additive migration'ları staging DB'de uygulandı. Authenticated admin runtime smoke sırasında:
  - İade paneli güvenli boş durum gösterdi.
  - Davranış analitiği metrikleri yüklendi.
  - Bildirim paneli `Henüz bildirim yok.` gösterdi.
  - Notification `forEach` TypeError, `42P01`, `42703` veya görünür `500` görülmedi.
- Bu staging kanıtı production şemasının hazır olduğunu göstermez. Admin support migration'ları production'da henüz uygulanmadı.
- `/api/analytics/page-enter` istemcisi non-2xx cevapları kontrol etmediği için analytics 500 hatası tarayıcı konsolunda sessiz kalabilir. No-write kuralı nedeniyle endpoint'e doğrudan POST smoke yapılmadı.

## 2. Admin console error audit

| Alan | Frontend çağrısı | Backend bağımlılığı | Bulgular | Category release etkisi |
|---|---|---|---|---|
| İade talepleri | `fetchReturnsForDashboard` | `returns`, `orders`, `users` | Staging schema apply sonrası authenticated runtime boş durumla açıldı; görünür schema/500 hatası yok. | Staging gate geçti; production migration apply edilene kadar production blocker. |
| Davranış analitiği | `fetchBehaviorAnalytics` | `visitor_sessions`, `page_visits`, `product_actions`, ürün ve sipariş tabloları | Staging schema apply sonrası metrikler yüklendi; görünür schema/500 hatası yok. | Staging gate geçti; production migration apply edilene kadar production blocker. |
| Bildirimler | `fetchAdminNotifications` | `notifications` | Array guard staging frontend'de doğrulandı; boş liste güvenli render edildi ve `forEach` TypeError görülmedi. | Kod riski düşürüldü; production deploy ve monitoring sonrası kapatılır. |

Önceki ortak kök neden staging bootstrap kapsamının kategori/menu/collection tablolarıyla sınırlı kalmasıydı. Dar additive migration'lar staging'de uygulandı; production için aynı migration'lar ayrı onay kapısıyla bekliyor:

- `migrations/20260712_admin_notifications_foundation.sql`
- `migrations/20260712_admin_returns_foundation.sql`
- `migrations/20260712_admin_analytics_foundation.sql`

Frontend guard gerçek DB/schema eksikliğini gizlemez. Production readiness için additive migration apply, information schema doğrulaması ve authenticated endpoint smoke birlikte tamamlanmalıdır.

## 3. Category theme ve UX polish planı

### 3.1 Acil UX düzeltmeleri

1. Collection fiyat düzeltmesini koru; home, cart drawer, product ve checkout dahil bütün fiyat yüzeylerini ortak `tr-TR` formatter'a geçir.
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
| Collection fiyat formatı | Tamamlandı | Staging'de `29.999,00 TL` ve `899,90 TL` doğrulandı. |
| Site geneli ortak fiyat formatter | Tercihen evet | Home, cart drawer, product ve checkout yüzeylerinde format drift'i kalabilir. |
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
$backupRoot = $env:CATEGORY_V2_BACKUP_ROOT
if ([string]::IsNullOrWhiteSpace($backupRoot)) {
  throw 'CATEGORY_V2_BACKUP_ROOT is required.'
}
$backupDir = Join-Path $backupRoot "novastore-$stamp"
New-Item -ItemType Directory -Path $backupDir | Out-Null

supabase db dump --db-url $env:CATEGORY_V2_PRODUCTION_DATABASE_URL `
  -f "$backupDir\roles.sql" --role-only

supabase db dump --db-url $env:CATEGORY_V2_PRODUCTION_DATABASE_URL `
  -f "$backupDir\schema.sql"

supabase db dump --db-url $env:CATEGORY_V2_PRODUCTION_DATABASE_URL `
  -f "$backupDir\data.sql" --use-copy --data-only `
  -x "storage.buckets_vectors" -x "storage.vector_indexes"

Get-ChildItem $backupDir -Filter '*.sql' |
  Select-Object Name, Length |
  Format-Table -AutoSize |
  Out-File "$backupDir\FILE-SIZES.txt"

Get-ChildItem $backupDir -Filter '*.sql' |
  Get-FileHash -Algorithm SHA256 |
  Format-Table Path, Hash -AutoSize |
  Out-File "$backupDir\SHA256SUMS.txt"
```

Backup kabul şartları:

- Üç dosya da sıfırdan büyük.
- Komut exit code'ları `0`.
- Dosya boyutu envanteri ve SHA-256 manifest üretildi.
- Backup klasörü erişim kontrollü ve şifreli bir off-site konuma kopyalandı.
- Secret içeren shell transcript veya command history saklanmadı.

### 5.3 Restore testi

Restore doğrudan production'a yapılmaz. İki kabul edilebilir hedef:

1. Ayrı Supabase restore/staging project.
2. Production ile aynı major PostgreSQL sürümünde disposable local PostgreSQL.

Restore sırası:

```powershell
$backupDir = $env:CATEGORY_V2_BACKUP_ARTIFACT_PATH
if ([string]::IsNullOrWhiteSpace($backupDir)) {
  throw 'CATEGORY_V2_BACKUP_ARTIFACT_PATH is required.'
}
$rolesFile = Join-Path $backupDir 'roles.sql'
$schemaFile = Join-Path $backupDir 'schema.sql'
$dataFile = Join-Path $backupDir 'data.sql'

psql --set ON_ERROR_STOP=1 --single-transaction `
  --dbname $env:CATEGORY_V2_RESTORE_DATABASE_URL `
  --file $rolesFile

psql --set ON_ERROR_STOP=1 --single-transaction `
  --dbname $env:CATEGORY_V2_RESTORE_DATABASE_URL `
  --file $schemaFile

psql --set ON_ERROR_STOP=1 --single-transaction `
  --dbname $env:CATEGORY_V2_RESTORE_DATABASE_URL `
  --file $dataFile
```

Restore kabul şartları:

- Restore komutları hatasız tamamlanır.
- Restore hedefinin PostgreSQL major sürümü, role oluşturma yetkileri, extension'ları ve ownership modeli dump ile uyumludur.
- Hosted restore hedefi role restore'a izin vermiyorsa `roles.sql` adımı atlanmaz; önceden review edilmiş uyumluluk prosedürüyle uygulanır veya eşdeğer roller kontrollü oluşturulur.
- Kritik tablo row count'ları kaynak backup envanteriyle eşleşir.
- PK/FK/unique index envanteri oluşur.
- `products`, `categories`, `users`, `orders`, `product_categories` örnek sorguları çalışır.
- Auth/storage özel trigger veya policy değişiklikleri ayrıca doğrulanır.
- Restore DB üzerinde uygulama read-only smoke testi geçer.

## 6. Production preflight SQL

Preflight iki ayrı gate olarak yürütülür. Gate A legacy production şemasında v2 nesnelerine dokunmaz. Gate B yalnız additive foundation başarıyla uygulandıktan sonra çalıştırılır. Her iki gate'in çıktısı timestamp'li artifact olarak saklanır.

### 6.1 Gate A — Foundation öncesi legacy-safe preflight

Gate A başlamadan önce backup dosyaları, SHA-256 manifest ve başarılı restore testinin kanıtı operator tarafından doğrulanmalıdır. Aşağıdaki envanter sorguları tablo veya kolon eksik olsa da güvenlidir:

```sql
-- Gerekli legacy tabloların envanteri
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('categories', 'products', 'users', 'orders')
ORDER BY table_name;

-- categories ve products kolon envanteri
SELECT table_name, column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('categories', 'products')
ORDER BY table_name, ordinal_position;

-- categories üzerindeki mevcut unique constraint'ler
SELECT conname, pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE conrelid = to_regclass('public.categories')
  AND contype = 'u'
ORDER BY conname;

-- Constraint dışında oluşturulmuş unique index'ler dahil tüm index envanteri
SELECT indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename = 'categories'
ORDER BY indexname;
```

Sonraki legacy sorguları yalnız envanter `categories` tablosunda `id`, `name` ve `parent_id` kolonlarının bulunduğunu doğruladıktan sonra çalıştırılır. Bu sorgular hiçbir v2-only tablo veya kolon kullanmaz:

```sql
-- Aynı parent altında duplicate legacy isim
SELECT COALESCE(parent_id, 0) AS parent_scope,
       LOWER(BTRIM(name)) AS normalized_name,
       COUNT(*) AS row_count,
       ARRAY_AGG(id ORDER BY id) AS category_ids
FROM categories
GROUP BY COALESCE(parent_id, 0), LOWER(BTRIM(name))
HAVING COUNT(*) > 1;

-- Orphan parent
SELECT c.id, c.name, c.parent_id
FROM categories c
LEFT JOIN categories p ON p.id = c.parent_id
WHERE c.parent_id IS NOT NULL AND p.id IS NULL;

-- Self parent
SELECT id, name, parent_id
FROM categories
WHERE parent_id = id;

-- Cycle kontrolü: boş sonuç beklenir
WITH RECURSIVE category_walk AS (
  SELECT
    id,
    parent_id,
    name,
    ARRAY[id] AS path_ids,
    false AS has_cycle
  FROM categories

  UNION ALL

  SELECT
    c.id,
    c.parent_id,
    c.name,
    cw.path_ids || c.id,
    c.id = ANY(cw.path_ids) AS has_cycle
  FROM categories c
  JOIN category_walk cw ON c.parent_id = cw.id
  WHERE cw.has_cycle = false
    AND cardinality(cw.path_ids) < 100
)
SELECT DISTINCT
  id,
  parent_id,
  name,
  path_ids
FROM category_walk
WHERE has_cycle = true;
```

Gate A kabul şartları:

- Backup manifest doğrulanmış ve restore testi geçmiş olmalı.
- `categories(id, name, parent_id)` ve legacy ürün alanları envanterde görünmeli.
- Orphan, self-parent ve cycle sonuçları boş olmalı.
- Same-parent duplicate isimler ve global `categories.name UNIQUE` durumu migration kararına eklenmeli.

### 6.2 Gate B — Foundation sonrası v2 ve admin-support integrity preflight

Bu gate `20260701_category_v2_additive_foundation.sql` ve üç admin-support additive migration uygulandıktan sonra çalıştırılır. İlk çalıştırma backfill öncesi baseline üretir. Null/blank path ve primary eksikliği bu aşamada beklenebilir; aynı sorgular backfill apply sonrasında tekrar çalıştırıldığında kritik sonuçların boş olması gerekir.

```sql
-- V2 tablo envanteri
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN (
    'product_categories',
    'category_aliases',
    'category_stats',
    'returns',
    'notifications',
    'visitor_sessions',
    'page_visits',
    'product_actions'
  )
ORDER BY table_name;

-- V2 kategori ve ürün kolon envanteri
SELECT table_name, column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND (
    (table_name = 'categories' AND column_name IN ('slug', 'path', 'depth', 'deleted_at'))
    OR
    (table_name = 'products' AND column_name IN ('publication_status', 'is_customer_visible', 'deleted_at'))
  )
ORDER BY table_name, column_name;

-- Admin-support kolon envanteri
SELECT table_name, column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND (
    (table_name = 'orders' AND column_name IN (
      'refund_status',
      'cancel_reason',
      'shipment_status',
      'updated_at',
      'analytics_session_key'
    ))
    OR
    (table_name = 'notifications' AND column_name IN (
      'user_id',
      'type',
      'message',
      'is_read',
      'created_at'
    ))
  )
ORDER BY table_name, column_name;

-- Deleted kayıtlar hariç same-parent duplicate isim
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

-- Null/blank path: backfill öncesi baseline, apply sonrası boş sonuç beklenir
SELECT id, name, parent_id
FROM categories
WHERE deleted_at IS NULL AND NULLIF(BTRIM(path), '') IS NULL;

-- FK dışı/bozuk product-category ilişkileri
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

-- Görünür ürünlerde primary eksikliği: apply sonrası boş sonuç beklenir
SELECT p.id, p.name, p.category, p.categories
FROM products p
LEFT JOIN product_categories pc
  ON pc.product_id = p.id AND pc.is_primary = TRUE
WHERE p.deleted_at IS NULL
  AND p.publication_status = 'active'
  AND p.is_customer_visible = TRUE
  AND pc.product_id IS NULL;

-- category_stats aritmetik tutarlılığı
SELECT category_id,
       visible_product_count,
       descendant_visible_product_count,
       subtree_visible_product_count,
       sellable_product_count,
       descendant_sellable_product_count,
       subtree_sellable_product_count
FROM category_stats
WHERE subtree_visible_product_count
        <> visible_product_count + descendant_visible_product_count
   OR subtree_sellable_product_count
        <> sellable_product_count + descendant_sellable_product_count;

-- Constraint migration öncesi envanter, migration sonrası iki index de zorunlu
SELECT indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename = 'categories'
  AND indexname IN (
    'idx_categories_sibling_name_unique',
    'idx_categories_path_unique'
  )
ORDER BY indexname;
```

Admin-support endpoint readiness bu envanterden sonra, yalnız read-only authenticated GET ile doğrulanır:

- `GET /api/returns/admin/all`: schema hatası olmadan `200` ve array response.
- `GET /api/admin/behavior?days=30`: schema hatası olmadan `200` ve analytics object.
- `GET /api/notifications/admin`: schema hatası olmadan `200` ve array response.
- Admin UI'da `42P01`, `42703`, görünür `500` veya notification `forEach` TypeError bulunmamalı.

### 6.3 Legacy ambiguity ve unmatched envanteri

Bu sorgu Gate B içinde, additive kolonlar ve tablolar doğrulandıktan sonra çalıştırılır:

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

`category_match_count = 0` unmatched, `> 1` ambiguous kabul edilir. Ambiguous kayıtlar otomatik tahmin edilmez. Gate B ve ambiguity raporu backfill apply sonrasında verification olarak tekrar çalıştırılır.

## 7. Migration ve backfill sırası

1. Onaylı production backup al ve SHA-256 manifestini doğrula.
2. Backup'ı ayrı restore hedefinde geri yükle ve restore testini tamamla.
3. Gate A legacy-safe preflight çalıştır; sonuçları timestamp'li artifact olarak sakla.
4. Uygulama sürümünü ve rollback commit'ini sabitle.
5. `20260701_category_v2_additive_foundation.sql` için production dry review yap, sonra transaction kontrollü uygula.
6. Foundation sonrası kategori envanterini çalıştır; duplicate sibling name, path ve graph sorunlarını kontrol et.
7. `20260702_category_v2_backfill_constraints.sql` migration'ını yalnız kategori preflight'ı temizse transaction kontrollü uygula.
8. `idx_categories_sibling_name_unique` ve `idx_categories_path_unique` indexlerini doğrula.
9. Admin-support additive migration'larını kendi aralarında sırayla ve transaction kontrollü uygula:
   - `20260712_admin_notifications_foundation.sql`
   - `20260712_admin_returns_foundation.sql`
   - `20260712_admin_analytics_foundation.sql`
10. Gate B v2/admin-support integrity preflight çalıştır; kategori baseline'ını, admin-support tablo/kolon/index envanterini ve read-only endpoint readiness sonucunu sakla.
11. Category backfill dry-run çalıştır ve raporu onaylat.
12. Ambiguous/unmatched/orphan/cycle/primary-missing kayıtlar için manuel mapping kararı al.
13. İkinci operatör onayı olmadan ilerleme; onaydan sonra backfill apply çalıştır.
14. Gate B, ambiguity envanteri ve verification SQL'lerini tekrar çalıştır; null path ve uygun ürünlerde primary eksikliği kalmadığını doğrula.
15. `20260702_menu_collection_foundation.sql` içindeki `order_items` backfill DML'ini ayrıca incele; yalnız kendi preflight'ı temizse uygula.
16. `20260703_collection_home_visibility.sql` ve `20260704_attribute_filter_foundation.sql` migration'larını ayrı doğrulama kapılarıyla uygula.
17. Final API, admin, storefront ve Android smoke tamamlanmadan app deploy onayı verme.
18. Onaylı app deploy'u yap ve monitoring başlat.

Önemli: `scripts/categoryV2Backfill.js` bilinçli olarak local test DB'ye kilitlidir. Production'da kullanılmamalıdır. Production için ayrı, iki kişilik onay isteyen, default dry-run olan bir operator runner veya imzalı SQL runbook hazırlanmalıdır.

### 7.1 Production-safe category backfill runner blocker'ı

Production-safe runner henüz mevcut değildir ve production rollout için kritik blocker'dır. Local veya staging test scriptleri production hedefinde doğrudan çalıştırılmaz. Runner ya da imzalı operator runbook aşağıdaki şartların tamamını sağlamalıdır:

Önerilen production runner guard'ları:

- `CATEGORY_V2_ROLLOUT_TARGET=production`
- `CATEGORY_V2_ALLOW_PRODUCTION_BACKFILL=YES_I_HAVE_VERIFIED_BACKUP_AND_RESTORE`
- Yalnız açıkça verilen production DB URL env adı; `.env DATABASE_URL` fallback'i yok.
- Beklenen production project ref allowlist'i.
- Default mode `--dry-run`; `--apply` açıkça verilmeden write yok.
- Backup artifact path ve SHA-256 manifest zorunlu.
- Preflight artifact path zorunlu.
- Apply öncesi ikinci operatör onay kodu.
- SQL transaction, statement timeout ve advisory lock.
- Ambiguous ve unmatched kayıtları otomatik tahmin etmeyen manuel karar kapısı.
- Dry-run ve apply sonuçlarını timestamp'li, secretsiz rapor artifact'ına yazma.
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
- `returns`, `notifications`, `visitor_sessions`, `page_visits` ve `product_actions` tabloları mevcut.
- `orders.analytics_session_key` ve admin-support migration'larının beklediği additive kolonlar mevcut.
- Admin-support index envanteri üç migration dosyasıyla uyumlu.

API ve UI:

- `GET /api/public/categories?format=tree`
- `GET /api/products`
- `GET /api/products?category=<root>&includeDescendants=true`
- `GET /api/products?category=<leaf>&includeDescendants=true`
- `/kategori/<path>` ve query fallback
- `/koleksiyon/<slug>`
- Admin kategori ağacı
- Admin ürün dropdown/chip/primary breadcrumb
- Authenticated returns, behavior analytics ve notifications GET smoke
- Admin UI'da notification `forEach` TypeError, `42P01`, `42703` veya görünür `500` olmaması
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
|---|---|---:|---|---|---|
| Production DB | Doğrulanmış backup ve restore testi yok | Kritik | Evet | Parametrik logical dump, size/checksum manifest ve ayrı hedefte restore testi | Tur 20A |
| Production data gate | Production preflight ve category dry-run yapılmadı | Kritik | Evet | Gate A/B artifact'ları ve onaylı dry-run | Tur 20B |
| Category backfill | Production-safe category backfill runner yok | Kritik | Evet | Explicit target/URL, default dry-run, iki kişi onayı, advisory lock ve secretsiz rapor | Tur 20B |
| Admin support schema | Admin support migration'ları production'da uygulanmadı | Yüksek | Evet | Üç additive migration, inventory ve authenticated GET smoke | Tur 20B/20C |
| Staging güvenliği | Paylaşılan admin test parolası ve geçici admin role | Yüksek | Evet, operasyonel | Parola rotasyonu; gerekmiyorsa role düşürme veya hesabı devre dışı bırakma | Tur 19G |
| Android | Final unit test, assemble ve APK runtime smoke tekrarlanmadı | Yüksek | Evet | Production base URL/config ile final Android gate | Tur 20C |
| Analytics | `/api/analytics/page-enter` 500 geçmişi; client non-2xx'i sessiz yutuyor | Yüksek | Genel go-live için evet | Staging runtime/log kanıtı, production schema doğrulaması ve status telemetry | Tur 19G/20C |
| Notifications | Array guard staging'de geçti; production deploy sonrası regresyon riski | Düşük | Hayır | Authenticated smoke ve TypeError/5xx monitoring | Tur 20C |
| Fiyat | Site genelinde ortak fiyat formatter yok | Orta | Tercihen | Home, cart drawer, PLP, product, collection ve checkout ortak helper | Tur 19 UX |
| Collection | Kartlarda favori/sepet aksiyonu yok | Orta | Hayır | Ortak product-card action renderer | Tur 19 UX |
| PLP | Sol filtre/facet ve sort eksik | Orta | Hayır | Toolbar + drawer; sonra server-side facet API | Tur 19 UX |
| Mobil kategori | Tam drawer/drill-down polish eksik | Orta | Hayır | Root/child/grandchild drawer, geri akışı ve focus yönetimi | Tur 19 UX |
| Favori/sepet | Toast ve `aria-live` feedback eksik | Orta | Hayır | Ortak action feedback helper | Tur 19 UX |

## 12. Production readiness kararı

- **Category v2 staging functional readiness:** Passed.
- **Production deployment readiness:** Not ready.

Production deploy onayı verilmemesinin blocker nedenleri:

1. Production backup ve bağımsız restore testi yok.
2. Production Gate A/Gate B preflight artifact'ları yok.
3. Production category backfill dry-run yapılmadı.
4. Admin-support additive migration'ları production'da uygulanmadı.
5. Production-safe category backfill runner veya imzalı operator runbook hazır değil.
6. Final Android unit/build/APK runtime gate tamamlanmadı.

### 12.1 Staging admin cleanup

Staging admin test hesabının parolası rotate edilmelidir. Hesaba artık ihtiyaç yoksa admin role düşürülmeli veya test hesabı devre dışı bırakılmalıdır. Bu işlem staging DB/auth write gerektirdiği için bu dokümantasyon turunun parçası değildir; ayrı, manuel ve audit kaydı tutulan Tur 19G operasyonu olarak yürütülmelidir.
