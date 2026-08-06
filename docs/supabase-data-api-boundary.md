# Supabase Data API güvenlik sınırı

## Uygulama sözleşmesi

NovaStore uygulama tabloları istemciler tarafından Supabase Data API üzerinden doğrudan kullanılmaz. Web ve Android istemcileri NovaStore Express API'sine gider; Express backend PostgreSQL'e `pg` bağlantısıyla erişir. Supabase PostgreSQL bu mimaride veri barındırma ve bağlantı katmanıdır, istemci yetkilendirme katmanı değildir.

Bu nedenle `public` içindeki 42 canonical NovaStore tablosunun Data API sözleşmesi deny-by-default'tur:

- `anon` ve `authenticated` rolleri tablo veya tablo kolonlarında hiçbir ayrıcalık taşımaz.
- Bu tablolara bağlı sequence ayrıcalıkları da bu iki rolden kaldırılır.
- Hedef tablo başka bir şemadaki sequence'e bağlıysa migration o nesneye dokunmadan fail-closed durur.
- Bütün hedef tablolarda RLS açıktır; permissive policy yoktur.
- Backend'in owner/`BYPASSRLS` davranışını korumak için `FORCE ROW LEVEL SECURITY` kullanılmaz.
- NovaStore'un `users.id INTEGER` kimliği Supabase Auth `auth.uid()` değeriyle eşleştirilmez.

Migration yalnızca açıkça listelenmiş 42 tabloyu hedefler. Bu listede eksik tablo, beklenmeyen başka bir `public` tablo/view/materialized view, mevcut policy, `FORCE RLS`, `PUBLIC` ACL, Data API rollerine açık bir `SECURITY DEFINER` routine veya etkili bir dolaylı erişim yolu görürse transaction hata verip bütünüyle geri alınır. Migration uygulama başlangıcına bağlı değildir ve elle yönetilen ayrı bir deployment adımıdır.

Migration, `novastore:public-schema-security-ddl:v1` anahtarıyla transaction-scoped advisory lock alır ve hedef tabloları mutasyondan önce deterministik sırada `ACCESS EXCLUSIVE` kilitler. Aynı veritabanında NovaStore tarafından yönetilen bütün public-schema DDL runner'ları aynı advisory lock sözleşmesini kullanmalıdır. PostgreSQL, yeterli sistem-katalog yetkisi olmayan uygulama owner rolüne üçüncü taraf DDL'yi evrensel olarak engelleyen bir schema kilidi sunmadığından, uzak uygulamada bağlantı/DDL bakım penceresi yine zorunludur.

## `public.assistant_events` karantinası

`public.assistant_events` sınıflandırması `NOVASTORE_SECURITY_QUARANTINE` değeridir. NovaStore bu tablonun tarihsel yaratıcısı veya sahibi olduğunu iddia etmez.

- Tablo yoksa migration tabloyu oluşturmaz.
- Tablo varsa yalnızca doğrulanmış kolon, PK/FK ve indeks imzası kabul edilir.
- İmza uyuşmazlığında hiçbir RLS veya ACL değişikliği bırakılmadan migration başarısız olur.
- Doğru imzada tablo ve mevcut satırlar korunur; yalnızca RLS açılır ve `anon`/`authenticated` tablo, kolon ve ilişkili sequence erişimleri kaldırılır.
- Tablo silinmez, yeniden adlandırılmaz, truncate edilmez, backfill edilmez ve policy ile yeniden açılmaz.

İleride bu tabloyu veya başka bir tabloyu Data API üzerinden kullanmak; ayrı migration, açık GRANT listesi, Supabase Auth uyumluluk kararı, tenant/sahiplik policy tasarımı, negatif yetki testleri ve insan onayı gerektirir.

## Yeni tablo veya routine kuralı

Yeni bir runtime tablosu ekleyen her migration aynı değişiklikte şu kararlardan birini açıkça eklemelidir:

1. Backend-only ise canonical allowlist, RLS, ACL ve regresyon testini güncellemek.
2. Data API'ye açılacaksa istemci, rol, GRANT ve RLS policy sözleşmesini ayrı güvenlik incelemesiyle kanıtlamak.

Bu karar olmadan yeni `public` tablo üretime alınmamalıdır. PostgreSQL default privileges bu migration'da değiştirilmez; migration runner/owner modeli kanıtlanmadığı için gelecekte oluşacak tabloların varsayılan ACL'leri ayrı bir residual risktir.

Yeni bir `public` function/procedure ekleyen değişiklik de `SECURITY DEFINER`, `EXECUTE` ve Data API görünürlüğü kararını aynı güvenlik turunda test etmelidir. Data API rollerine etkili `EXECUTE` yetkisi olan `SECURITY DEFINER` routine bu backend-only sözleşmede kabul edilmez.

## Yerel doğrulama

Statik sözleşme testi normal smoke paketine dahildir:

```text
npm test
```

Gerçek migration replay'i yalnızca açıkça sağlanan `NOVASTORE_RLS_LOCAL_DATABASE_URL` ile çalışır. Test; hostun tam olarak `127.0.0.1`, portun `55436` ve veritabanının `novastore_rls_hardening_admin` olmasını zorunlu tutar. Değişken yoksa entegrasyon testi uzak bir hedef tahmin etmez ve DB replay'ini atlar.

```text
node tests/supabaseRlsQuarantineIntegrationSmoke.js
```

Replay gerçek repo schema başlangıç zincirini disposable PostgreSQL 16 veritabanlarında çalıştırır; canonical-only, karantina tablosu mevcut/yok, drift, eksik/beklenmeyen tablo, erişim reddi, rollback, tekrar çalıştırma ve backend-owner uyumluluğunu doğrular. Test hiçbir `.env` dosyası okumaz.

## Uzak uygulama kapısı

Bu migration'ın yerelde veya Git'te bulunması production uyarısının çözüldüğü anlamına gelmez. Uzak uygulama ayrı bir turda ve ayrı insan onayıyla yapılmalıdır. O turdan önce:

1. Salt okunur pre-apply reconciliation ile 42 canonical tablo, optional karantina tablosu, policy, RLS, owner ve ACL durumu yeniden doğrulanır.
2. Bakım penceresi, veritabanı checkpoint/backup kanıtı ve yetki snapshot'ı hazırlanır.
3. Migration kontrollü runner ile tek transaction olarak uygulanır; runner aynı advisory lock sözleşmesini kullanır ve uygulama sırasında tüm eşzamanlı/üçüncü taraf DDL bakım penceresiyle durdurulur.
4. Post-apply RLS, FORCE RLS, policy ve etkili rol ayrıcalıkları tekrar doğrulanır.
5. Commit sonrası geri dönüş gerekirse, önceden alınmış ACL/RLS snapshot'ından ayrı ve insan onaylı rollback migration'ı hazırlanır. Tahmine dayalı GRANT geri yüklemesi yapılmaz.

Durum ifadesi, uzak uygulama ve doğrulama tamamlanana kadar şudur: `LOCAL FIX PREPARED — REMOTE ADVISORY NOT YET RESOLVED`.
