# Codex’e Verilecek Tek Parça Devam Promptu

```text
NovaStore çalışmasına kaldığın yerden, geçmiş PASS iddialarına güvenmeden devam et.

TEK OTORİTER DURUM RAPORU:
NOVASTORE_V4_12_13_REVALIDATION_AND_A_Z_AUDIT_2026-08-13.md

KAYNAK PAKET:
android-customer-visual-calibration-v4_1

ÖNEMLİ BAĞLAM:
- V4.12/V4.13 owner görsel ve yerel etkileşim görevi güncel kaynak + canlı cloud-browser ölçümüyle kapandı.
- Bu turda mağaza adının arkasındaki çizgi, PDP dalgasının sağ ucu, uygulama geneli ödeme ikon dili, expiry ikonu, filtre backdrop inertliği, order product identity, destek kısayolları ve NovaBot input erişilebilirliği düzeltildi.
- 37 kanonik URL durumu / 36 benzersiz render durumu açıldı; 678 görünür kontrol örneğinde kırık görünür görsel, yatay taşma, adsız kontrol, duplicate DOM id veya route-render uyuşmazlığı çıkmadı.
- Runtime integrity 28/28 PASS; TypeScript PASS; ProductCard 9/9 PASS; Carousel 3/3 PASS; build PASS; Sites 4/4 PASS.
- Playwright 66 test keşfediyor. V4.12/V4.13 focused 7 test yerel Chromium executable eksik olduğu için assertion başlamadan BLOCKED; bunları PASS sayma.
- Cloud-browser’da store focus/hero/filter/sort, PDP seam/wave/text/Q&A/viewer, checkout icons/CVV, auth/search/sort/favorite/cart/account/support/NovaBot ana akışları canlı doğrulandı.
- Çalışma alanı Git repository değil; commit/push/deploy yapılmadı.
- Paket yalnız React yerel prototipidir. src altında fetch/API/auth SDK/DB/PSP/persistence yoktur. Backend bağlıymış gibi davranma.

HEDEF:
Gerçek NovaStore Android/web/backend sistemini A’dan Z’ye üretime bağlamak için önce kanıta dayalı repo uzlaştırması yap, ardından P0’dan başlayarak güvenli fazlar halinde uygula. Eğer sana verilen çalışma alanında gerçek üretim repo/backend yoksa bunu açık blocker olarak bildir; bu UI prototipine uydurma backend ekleyerek görevi tamamlanmış gösterme.

ÇALIŞMA KURALLARI:
1. Önce AGENTS.md ve repo yönergelerini tamamen oku.
2. Mevcut dirty/user değişikliklerini koru. Destructive git komutu kullanma.
3. Başlangıçta branch/HEAD/status, build/test komutları, ortam bağımlılıkları ve gerçek backend bağlantılarını salt okunur belirle.
4. Production DB, gerçek ödeme, gerçek kullanıcı mesajı, secret değişikliği, migration apply, commit, push, PR merge veya deploy için ayrıca açık yetki olmadan işlem yapma.
5. Her “PASS” iddiasını güncel komut çıktısı veya canlı ölçümle kanıtla. SKIPPED/BLOCKED testleri PASS yazma.
6. Gerçek ödeme için PAN/CVV’yi kendi backend/DB/log/analytics katmanına alma; PSP hosted fields/tokenization + 3DS + signed webhook kullan.
7. Client fiyat, kupon, stok, verified purchase, seller verification ve payment success otoritesi değildir.

FAZ 0 — ZORUNLU READ-ONLY UZLAŞTIRMA:
- Gerçek mobile/web repo, backend servisleri, auth provider, DB şeması/migration’lar, API gateway/BFF, object storage, queue/event bus, notification sistemi, search altyapısı, PSP, shipment/invoice/return/support entegrasyonlarını bul.
- Aşağıdaki her domain için EXISTS / PARTIAL / ABSENT / CONFLICTING matrisi çıkar; dosya ve sembol kanıtı ver:
  auth/session/MFA/consent,
  customer profile/address/payment token/preferences,
  catalog/category/product/SKU/media/store/offer/price,
  search/facet/pagination,
  favorite/follow/cart/guest merge,
  promotion/quote/tax/shipping/inventory reservation,
  payment intent/3DS/webhook/idempotency,
  order/shipment/invoice/return/refund,
  review eligibility/moderation,
  question owner privacy/seller authorization,
  notification inbox/device token/dedupe,
  support/chat/attachment security,
  NovaBot authorization/audit/data minimization,
  observability/feature flags/rollback.
- Mevcut sistemle çakışan tablo/API/contract üretme. Önce reuse/extend/migrate kararını yaz.
- Faz 0 sonunda P0/P1/P2 backlog, bağımlılık sırası, riskler, test kapıları ve uygulanabilir küçük ilk patch önerisi ver.

P0 SIRASI:
1. Auth/session/route guard/authz.
2. Server-authoritative quote, promotion, tax/shipping ve inventory reservation.
3. PSP tokenization/3DS/payment intent/signed webhook + idempotent order create.
4. Payment/order/cart/stock transaction bütünlüğü, webhook inbox ve outbox.
5. Review purchase eligibility ve pending-question privacy.

P1 SIRASI:
- Catalog/store/search gerçek read path ve storeId/seller isolation.
- Profile/address/favorite/cart/follow/notification persistence.
- CAL bazlı canonical route allowlist.
- Product/store/order kimlik aktarımı ve alternate-product PDP veri doğruluğu.
- Share/clipboard gerçek side effect veya açık demo/disabled durumu.
- Loading/error/offline/timeout/retry/expired-session/conflict UX.
- Dialog focus trap/restoration ve accessibility.

ZORUNLU TESTLER:
- Unit + schema/validator + contract + integration + E2E + security negatif testleri.
- Cross-user/cross-seller IDOR.
- Expired/revoked session/logout refresh.
- Client price/total/coupon tampering.
- Guest cart merge/concurrency.
- Last-stock oversell/reservation.
- 3DS success/fail/cancel/timeout ve webhook replay/dedupe.
- PAN/CVV log/DB/analytics sızıntı taraması.
- Payment/order/cart/stock tutarlılığı ve retry idempotency.
- Review eligibility/duplicate; pending question başka kullanıcıya body/cache/client state olarak gitmemeli.
- Notification dedupe.
- Support reconnect/attachment MIME-size-malware/account isolation.
- Geçerli Chrome/Chromium ile tam 66+ Playwright testi.
- V4.12/V4.13 için 320/360/411/480 px same-state görsel regresyon ve hedef Android WebView doğrulaması.

UI REGRESYONLARINI KORU:
- Topbar beyaz bloom yok.
- Q&A cevabı 28 px girintili ve 3 px lacivert çizgili.
- PDP seller card kompakt; Mağazaya Git ayrı storefront açar.
- PDP dots media içinde; media/detail seam yok; white wave düzgün ve sağ uçta kink yok.
- Açıklama/spec büyüt-küçült ve reflow çalışır.
- Store name arkasında çizgi yok; cover/logo merkezi hizalı.
- Store search raw focus rectangle üretmez; placeholder kaybolur; navy caret ve hafif shell değişimi kalır.
- Filter/sort ikon kontrolleri kompakt ve sheet davranışı çalışır.
- Viewer üçüncü görsel 1× up/down/diagonal drag-release sonrası baseline’a döner; zoom/reset/page change stale transform bırakmaz.
- Checkout yalnız kart; neutral selection; payment/card/expiry/CVV ikonları hizalı; CVV eye çalışır; uygulama geneli payment icon dili karttır.
- Filtre modal arka planı inerttir; order Ürüne Git doğru productId taşır; support shortcuts doğru route’a gider; NovaBot input erişilebilir ad taşır.

HER FAZ SONUNDA ÇIKTI:
- Değişen dosyalar ve nedenleri.
- Çalıştırılan komutlar; PASS/FAIL/BLOCKED ayrımı.
- Kalan riskler ve demo noktaları.
- Migration/rollback/observability notu.
- Commit/push/deploy durumu (yetki yoksa yapılmadı diye açık yaz).

Önce Faz 0 read-only uzlaştırmayı tamamla ve kanıtlı raporu getir. Gerçek repo/backend mevcut ve kullanıcı uygulamayı da istediğinde, onaylanan küçük ilk fazı uygula; doğrudan sahte “A’dan Z’ye tamamlandı” sonucu üretme.
```
