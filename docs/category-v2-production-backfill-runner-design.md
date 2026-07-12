# Category v2 Production-Safe Backfill Runner Design

Bu belge production veya staging veritabanına bağlanmadan hazırlanmış tasarım sözleşmesidir. Runner uygulanana, local disposable PostgreSQL testleri tamamlanana ve production backup/restore gate'i geçene kadar production category backfill blokludur.

## 1. Güvenlik sözleşmesi

Runner yalnız açık rollout değişkenlerini kabul eder:

- `CATEGORY_V2_ROLLOUT_TARGET=staging|production`
- `CATEGORY_V2_ROLLOUT_DATABASE_URL=<secret>`
- `CATEGORY_V2_ROLLOUT_MODE=dry-run|apply` (varsayılan: `dry-run`)
- `CATEGORY_V2_BACKUP_CONFIRMED=YES`
- `CATEGORY_V2_RESTORE_TEST_CONFIRMED=YES`
- `CATEGORY_V2_OPERATOR=<non-secret operator id>`
- `CATEGORY_V2_REPORT_DIR=<local artifact directory>`

`.env DATABASE_URL`, `DATABASE_URL` ve local-test runner değişkenleri fallback olarak kullanılmaz. URL, parola veya bağlantı dizesi loglanmaz. Rapor yalnız hedef adı, maskeli host özeti, PostgreSQL server kimliği, zaman ve sayımları içerir.

Production apply ek olarak şu iki değeri zorunlu tutar:

```text
CATEGORY_V2_PRODUCTION_APPROVAL=I_HAVE_VERIFIED_BACKUP_RESTORE_PREFLIGHT_AND_ACCEPT_CATEGORY_V2_APPLY
--confirm-production=APPLY_CATEGORY_V2_TO_PRODUCTION_AFTER_VERIFIED_DRY_RUN
```

Eksik, yanlış veya büyük/küçük harfi farklı onayda bağlantı kurulmadan çıkılır.

## 2. CLI taslağı

```powershell
node scripts/categoryV2RolloutBackfill.js `
  --target staging `
  --mode dry-run `
  --report-dir artifacts/category-v2-rollout
```

Production apply yalnız ayrı komutta çalışır:

```powershell
node scripts/categoryV2RolloutBackfill.js `
  --target production `
  --mode apply `
  --confirm-production APPLY_CATEGORY_V2_TO_PRODUCTION_AFTER_VERIFIED_DRY_RUN `
  --report-dir artifacts/category-v2-rollout
```

CLI argümanı ile environment target/mode farklıysa fail edilir. `apply`, önceki dry-run raporunun `reportSha256` değerini `--approved-dry-run-sha256` ile ister. Dry-run ile apply aynı git commit'i, migration envanteri ve hedef DB fingerprint'i üzerinde olmalıdır.

## 3. Çalışma akışı

1. Argümanları ve exact confirmation değerlerini bağlantıdan önce doğrula.
2. URL'yi parse et; secret'ı loglama. Target allowlist ile project ref/host eşleşmesini doğrula.
3. Salt metadata bağlantısı kur; `current_database()`, PostgreSQL version ve schema fingerprint al.
4. `pg_try_advisory_lock` ile tek category-v2 rollout sahibi ol. Lock alınamazsa çık.
5. Gate A legacy-safe inventory sonuçlarını oku veya yeniden read-only çalıştır.
6. Foundation migration envanterini ve Gate B v2 integrity koşullarını doğrula.
7. Kategoriler için slug/path/depth planını bellekte üret.
8. Ürün-kategori eşleşme planını bellekte üret.
9. Ambiguous, unmatched, orphan, cycle veya primary-missing politikalarını değerlendir.
10. Deterministic JSON raporu yaz, SHA-256 hesapla ve mode `dry-run` ise çık.
11. Apply'da onaylı dry-run SHA, git commit, DB fingerprint ve migration envanterini tekrar doğrula.
12. Tek transaction içinde değişiklikleri uygula; timeout ve lock timeout kullan.
13. Transaction içi verification sorgularını çalıştır. Kabul şartı sağlanmazsa rollback et.
14. Commit sonrası read-only verification raporu ve checksum üret.
15. Advisory lock'u `finally` bloğunda bırak.

## 4. Fail-closed kuralları

Varsayılan olarak aşağıdakiler apply'i engeller:

- Bir veya daha fazla ambiguous legacy kategori adı.
- Bir veya daha fazla unmatched kategori adı.
- Orphan, self-parent veya cycle.
- Duplicate canonical path veya same-parent active name.
- Boş/null canonical path.
- Uygun üründe primary kategori üretilememesi.
- Migration/index envanterinin beklenen sözleşmeyle uyuşmaması.
- Dry-run raporu ile apply hedefinin DB fingerprint farkı.
- Dry-run sonrasında kategori/ürün kaynak sayımlarının değişmesi.

Manuel mapping gerekiyorsa version-control dışında secret içermeyen, ID tabanlı ve checksum'lı bir mapping artifact kullanılır. Mapping dosyası ayrıca approver imzası/onayı olmadan apply'e alınmaz; runner otomatik tahmin yapmaz.

## 5. Transaction ve eşzamanlılık

- Session advisory lock: category-v2 rollout için sabit namespaced key.
- `lock_timeout`: kısa ve açık hata veren değer.
- `statement_timeout`: veri hacmine göre preflight'ta belirlenir.
- Apply DML tek transaction içinde yürür.
- Relation insertleri `ON CONFLICT` ile idempotent olur.
- Primary ilişki partial unique index ihlalinde işlem rollback olur.
- Path güncellemeleri parent önce, depth sırasıyla ve deterministic yapılır.
- Transaction sırasında uygulama yazma trafiği için maintenance/readiness kararı runbook gate'inde verilir.

## 6. Rapor artifact'i

Önerilen ad:

```text
category-v2-<target>-<mode>-<UTC timestamp>-<git short sha>.json
```

Rapor alanları:

- runnerVersion, gitCommit, target, mode, operator, startedAt, finishedAt
- maskeli DB fingerprint ve migration/index fingerprint
- source category/product counts
- planned/changed category ve relation counts
- ambiguous, unmatched, orphan, cycle ve primaryMissing listeleri
- verification sonuçları
- dryRunReportSha256, reportSha256
- apply sonucu: `not-requested|committed|rolled-back|failed-before-connection`

DB URL, parola, JWT, API key, tam connection string ve kullanıcı PII rapora girmez. Artifact deployment paketine veya git commit'ine eklenmez; onaylı güvenli saklama alanına kopyalanır.

## 7. Verification

Apply kabul şartları:

- Aktif kategorilerde null/blank path yok.
- Canonical path duplicate yok.
- Aynı parent altında active normalized name duplicate yok.
- Orphan/cycle yok.
- `product_categories` duplicate ilişki yok.
- Ürün başına en fazla bir primary var.
- Dry-run'da uygun görülen ürünlerde primary eksikliği yok.
- Legacy `products.category` ve `products.categories` değişmedi.
- Public category tree ve descendant listing smoke sorguları başarılı.

Verification raporu transaction içi ve commit sonrası olmak üzere iki kez üretilir.

## 8. Rollback yaklaşımı

- Transaction içi hata: otomatik rollback; uygulama deploy edilmez.
- Commit sonrası uygulama sorunu: uygulama sürümü rollback edilir, additive tablolar/indexler hemen drop edilmez.
- V2 okuma yolu feature/config gate ile devre dışı bırakılır; legacy alanlar korunur.
- Yanlış relation/path verisi kontrollü ters DML ile düzeltilemiyorsa, DB operator backup restore kararını verir.
- Backup restore yalnız yaygın veri bozulması veya geri alınamayan DML kanıtında, ödeme/callback trafiği koordine edilerek yapılır.

## 9. Test planı

1. Arg/env çakışması ve eksik confirmation bağlantıdan önce fail eder.
2. Secret redaction testleri hata ve başarı loglarında URL/parola olmadığını doğrular.
3. Staging/production host allowlist ve yanlış ref rejection testleri.
4. Dry-run hiçbir DML çalıştırmaz; rapor deterministic ve checksum'lıdır.
5. Ambiguous/unmatched/orphan/cycle/primary-missing fail-closed testleri.
6. Aynı isim farklı parent ve duplicate sibling senaryoları.
7. Advisory lock contention testi.
8. Transaction rollback enjeksiyon testi.
9. Apply idempotency testi.
10. Dry-run/apply DB fingerprint drift rejection testi.
11. Local disposable PostgreSQL üzerinde foundation, constraints, dry-run, apply ve verification uçtan uca testi.
12. Legacy string alanlarının değişmediğini doğrulayan regression testi.

## 10. Uygulama öncesi açık kararlar

- Production ve staging project-ref/host allowlist değerlerinin secret olmayan konfigürasyon kaynağı.
- Operator ve approver ayrımı.
- Kabul edilecek sıfır-tolerans eşikleri; öneri tüm integrity listelerinde sıfırdır.
- Maintenance/readiness penceresi.
- Artifact'in saklanacağı erişim kontrollü alan ve retention süresi.
- Feature/config gate'in mevcut runtime'da nasıl uygulanacağı.

Bu kararlar, production backup ve restore testi tamamlanmadan runner implementasyonuna production yetkisi vermez.
