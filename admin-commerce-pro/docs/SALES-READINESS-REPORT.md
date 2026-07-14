# NovaStore satış ve pazaryeri hazırlık raporu

Tarih: 14 Temmuz 2026

Çalışma dalı: `codex/admin-commerce-pro-integration`

## Kısa cevap

NovaStore bugün gerçek ödeme alarak satışa açılmaya hazır değildir. Commerce Pro arayüzü ile mevcut backend arasındaki tek-satıcı entegrasyonu ilerliyor; sipariş/ödeme yaşam döngüsünün güvenlik çekirdeği, bounded ürün/katalog yapısı okuması ve varsayılan kapalı medyasız first-party ürün detail/create/update/archive akışı tamamlandı. Buna karşılık gerçek ödeme sağlayıcısı, güvenli iade/refund zinciri, taşıyıcı doğrulaması, güncel browser UAT'i ve production cutover kapıları hâlâ kapalıdır.

Tek geliştirici + Codex ile kesintisiz çalışma varsayımında kalan yaklaşık süreler:

| Hedef | Kalan geliştirme süresi | 14 Temmuz 2026'dan yaklaşık takvim | Ne anlama gelir |
|---|---:|---|---|
| Tek-satıcı Commerce Pro cutover | 4–8 hafta | 11 Ağustos–8 Eylül 2026 | Admin paneli gerçek endpoint'lerle ana operasyonları güvenle yürütür; bu tek başına ödeme alma izni değildir. |
| Login zorunlu dar satış pilotu | 7–15 hafta | 1 Eylül–27 Ekim 2026 | Onaylı staging ödeme/kargo/fatura UAT'i, browser QA, runbook ve geri alma kapıları tamamlanır. |
| Kontrollü 1–3 satıcılı ödeme pilotu | 9–16 ay | Nisan–Kasım 2027 | Seller-scope, offer, seller-order, stok hareketi, ledger, settlement ve sağlayıcı UAT'i çalışır. |
| Güvenilir halka açık pazaryeri | 15–28 ay | Ekim 2027–Kasım 2028 | Operasyon, güvenlik, finansal mutabakat, ölçek ve kontrollü rollout kanıtları tamamlanır. |

Bu tarihler taahhüt değil planlama aralığıdır. PayTR/iyzico, KYC, kargo ve e-fatura sözleşme/onay süreleri ile kullanıcının production, veritabanı ve gerçek ödeme onayını bekleyen süreler dahil değildir. İki kıdemli full-stack geliştirici ve yarı zamanlı QA/DevOps ile süreler belirgin biçimde kısalabilir.

## Bugünkü gerçek durum

| Alan | Durum | Kanıt / açık iş |
|---|---|---|
| Commerce Pro tasarım ve preview | Otomatik QA tamam, browser QA blokeli | Preview/live build, model ve kontrat testleri var. Güncel masaüstü/mobil etkileşim, console ve network kanıtı Work Mode browser güvenlik katmanı nedeniyle yok; PR #15 merge-ready sayılamaz. |
| Admin auth ve salt-okunur entegrasyon | İleri aşama | Güncel DB admin rolü, fail-closed capability, Dashboard, sipariş, iade, admin bildirim ve NovaStore birinci taraf ürün özetleri bağlı. |
| Sipariş/ödeme güvenlik çekirdeği | İleri aşama | Hard-delete ve generic durum mutation'ı kapalı; iptal stok kanıtına, callback'ler kilitli payment state ve kalıcı reconciliation kaydına bağlı. |
| Kontrollü admin operasyonları | Otomatik QA tamam | Admin iptali ve manuel kargo devri varsayılan kapalı kill-switch arkasında, expected-state/idempotency/audit sınırlarıyla tamamlandı. Taşıyıcı API'si, etiket ve otomatik refund yok; gerçek PostgreSQL contention ile browser QA kanıtı açık. |
| Birinci taraf katalog yönetimi | Tur 3A–3D otomatik QA tamam | Bounded/current-admin ürün ve katalog yapı okumaları ile medyasız ürün detail/create/update/archive ve canlı UI bağlı. Strict JSON, default-off write capability, store-before-revision, optimistic revision ve atomik kategori/özellik/sayaç/audit sınırları testli. Arşiv public satış/arama/feed/favori/soru/yorum yollarından fail-closed düşer. Hard-delete ve medya/Cloudinary kapalı; migration deploy'u yapılmadı, gerçek PostgreSQL ve browser kanıtı açık. |
| Müşteri, destek ve kampanya operasyonu | Eksik | Bounded admin DTO, pagination, PII sınırı ve mutation politikaları tamamlanmalı. |
| İade ve refund | Blokeli | Return writes bilerek kapalı. İdempotent iade kalemi, ödeme refund, stok hareketi ve reconciliation modeli migration/onay gerektiriyor. |
| Gerçek ödeme | Blokeli | PayTR initialize test tokenı ve iyzico initialize mock. Sağlayıcının güncel raw-body imza sözleşmesiyle staging UAT yapılmadan ödeme go/no-go kapalı. |
| Kargo ve fatura | Blokeli | Manuel handoff taşıyıcı doğrulaması değildir. Gerçek label/tracking callback ve fatura adapterı yok. |
| Production hazırlığı | Blokeli | Güncel browser UAT, gözlemlenebilirlik, yedek/geri alma, incident runbook, staging kanıtı ve ayrı deploy onayı gerekiyor. |
| Çok-satıcılı domain | Başlamadı | Seller organization/member/scope, offer, seller-order, inventory movement, immutable ledger, settlement ve payout tabloları çalışan sistemde yok. |

## Durmadan ilerleme sırası

Her tur `plan → uygulama → test → doğrulama → commit → push` sırasıyla kapanır. Production deploy, production/remote DB, migration çalıştırma ve gerçek ödeme/taşıyıcı isteği ayrıca açık onay ister.

1. **Tur 2C — güvenli operasyon yazmaları (kod ve otomatik QA tamam):** feature-gated admin iptali ve manuel kargo devri; stale-state, idempotency, audit ve post-commit bildirim testleri tamamlandı. İade/refund kapalı kalır; runtime PostgreSQL/browser kanıtı ilgili ortam sağlandığında ayrıca alınır.
2. **Tur 3A — birinci taraf ürün okuması (kod ve otomatik QA tamam):** bounded/current-admin ürün özeti Commerce Pro'ya bağlandı; gerçek PostgreSQL/browser kanıtı açık, ürün/medya yazmaları kapalı.
3. **Tur 3B — ortak katalog yapısı (kod ve otomatik QA tamam):** kategori, özellik tanımı/şablonu, koleksiyon, menü ve menü öğesi altı bounded sayfayla Commerce Pro'ya salt-okunur bağlandı; ham iç URL ve medya alanları dışarıda.
4. **Tur 3C — katalog yazma güvenlik temeli (kod ve otomatik QA tamam):** ürün hard-delete kilidi, güncel DB admin guard'ları, default-off capability, row-level revision ve append-only audit/atomik executor sözleşmesi tamamlandı; production migration, yeni CRUD/UI ve Cloudinary mutation yapılmadı.
5. **Tur 3D — medyasız ürün JSON CRUD (kod ve otomatik QA tamam):** exact detail, create/update/archive ve canlı Commerce Pro kontrolleri strict allowlist, current-admin/store scope, revision ve atomik audit sınırıyla tamamlandı; arşiv public ürün yollarında fail-closed, medya/Cloudinary ve hard-delete kapalı.
6. **Tur 3E–3F — katalog yapısı CRUD ve geniş doğrulama (sıradaki aktif turlar):** kategori/özellik/koleksiyon/menü CRUD'u, ardından disposable PostgreSQL/legacy parity/browser kanıtı.
7. **Tur 4 — müşteri ve operasyon:** bounded müşteri özeti, soru/yorum/destek, kampanya görünümü, pagination ve PII/RBAC sınırları.
8. **Tur 5 — Commerce Pro cutover hazırlığı:** legacy parity, feature flag, performans/güvenlik, rollback; seçili browser yeniden kullanılabildiğinde masaüstü/mobil, console ve network UAT.
9. **Tek-satıcı satış pilotu kapısı:** gerçek provider adapterları ve staging UAT yalnız ayrıca onaylanır; refund, taşıyıcı, fatura, mutabakat ve incident runbook birlikte geçmeden canlı ödeme açılmaz.
10. **Çok-satıcı Tur 0–3:** domain/ADR, seller identity ve tenant RBAC, onboarding/KYC, kanonik katalog + seller offer + sürümlü yayın politikası.
11. **Çok-satıcı Tur 4–6:** checkout rezervasyonu, seller-order ayrımı, satır bazlı iade/anlaşmazlık, immutable finans snapshot'ı ve çift taraflı ledger.
12. **Çok-satıcı Tur 7–9:** PayTR platform transfer mock/staging, seller portalı, reconciliation, 1–3 satıcılı kontrollü pilot ve kademeli rollout.

## Ürün onayı ve risk etiketi kararı

Bugünkü sistem tek satıcılıdır. Tur 3'te geliştirilecek katalog NovaStore'un kendi birinci taraf kataloğudur; “satıcı her ürün için adminden izin ister” akışı kurulmayacaktır.

Gelecekte çok satıcılı modelde ortak ürün içeriği ile satıcının fiyat/stok/teslimat teklifi ayrılır. Sürümlü politika kontrollerini geçen teklif otomatik yayınlanır; düzeltilebilir eksik satıcı aksiyonuna, yalnız açıkça tanımlı istisna insan incelemesine gider. Admin satıcının fiyat veya stok değerini sessizce değiştiremez.

`Düşük / Orta / Yüksek` etiketi tek başına karar değildir. Üretim modelinde her sinyal; kaynak olay, ölçüm dönemi, eşik/politika sürümü, reason code, veri tamlığı, kontrol zamanı ve itiraz/override izini taşımalıdır. Eksik girdiden risk hükmü üretilemez; onboarding önceliği, operasyon sinyali ve finansal blokaj birbirinden ayrı kalır.

## Satış için değişmez go/no-go

Canlı satış ancak aşağıdakilerin tamamı kanıtlandığında değerlendirilebilir:

- Gerçek ödeme initialize/webhook ve tekrar callback testleri staging'de geçer.
- Sipariş, stok, kupon, refund ve reconciliation kayıtları kuruş/adet bazında tutarlıdır.
- Kargo ve fatura başarısızlıklarının güvenli manuel operasyon yolu vardır.
- Admin/storefront/Android kritik yol kontratları ve güncel browser UAT'i geçer.
- P0 hata sıfırdır; log, alarm, günlük mutabakat, incident sahibi ve rollback provası vardır.
- Production migration, sırlar, deploy ve gerçek ödeme için kullanıcı ayrı açık onay verir.

Bu rapor hiçbir production işlemini, uzak veritabanı bağlantısını, migration çalıştırmayı, gerçek ödeme/kargo isteğini veya deploy'u yetkilendirmez.

Admin iptal notlarının iç audit event'inde tutulması için retention/redaksiyon ve operatör PII politikası da ilgili capability production'da açılmadan önce tamamlanmalıdır.
