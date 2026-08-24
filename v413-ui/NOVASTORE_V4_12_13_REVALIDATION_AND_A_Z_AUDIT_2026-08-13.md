# NovaStore V4.12/V4.13 Yeniden Doğrulama ve A’dan Z’ye Denetim

Tarih: 13 Ağustos 2026  
Kapsam: `android-customer-visual-calibration-v4_1`  
Nihai karar:

- **Owner’ın son V4.12/V4.13 görsel ve yerel etkileşim görevi: CANLI PROTOTİPTE PASS.**
- **Üretim uygulaması / backend hazır olma durumu: FAIL — bu paket backend’e bağlı bir uygulama değil.**
- Eski `V4.13 PASS` belgeleri bu rapordan önce kapanış kanıtı değildir; bu rapor güncel kaynak, güncel build ve 13 Ağustos 2026 canlı tarayıcı turuna dayanır.

## 1. Bu turda gerçekten yapılan düzeltmeler

1. Mağaza adının arkasından geçen kapak/dalga çizgisi, mağaza kimlik metninin beyaz foreground maskesiyle kaldırıldı.
2. PDP beyaz dalgasının sağ ucundaki ters tangent/kırık çıkıntı, yukarı doğru yumuşak biten sürekli Bézier eğrisiyle düzeltildi.
3. Checkout’taki kart yöntemi ve kart numarası alanına ek olarak uygulamadaki diğer ödeme girişleri de aynı kart ikon diline geçirildi:
   - Sipariş detayındaki Ödeme satırı
   - Hesabım > Ödeme Yöntemlerim
   - Destek > Ödeme Sorunları
4. Son Kullanma alanına hizalı takvim simgesi eklendi.
5. Filtre modalının arkasındaki ProductCard kontrolleri `inert`, `aria-hidden` ve `pointer-events: none` ile gerçekten etkisizleştirildi.
6. Sipariş detayındaki `Ürüne Git`, artık görüntülenen `sound-n1` kimliğini PDP’ye taşır.
7. Destek kısayolları düzeltildi:
   - Ödeme Sorunları → destek SSS
   - Hesap ve Güvenlik → gerçek güvenlik alt görünümü
8. NovaBot mesaj alanına erişilebilir ad eklendi.
9. V4.12/V4.13 regresyon sözleşmeleri; ödeme ikon ailesi, expiry simgesi, filtre inertliği, doğru ürün kimliği, destek rotaları, NovaBot alanı, dalga kontrol noktaları ve çok yönlü viewer drag için genişletildi.

Değiştirilen uygulama dosyaları:

- `src/Prototype.tsx`
- `src/prototype.css`
- `tests/calibration-v4_12.spec.ts`
- `tests/calibration-v4_13.spec.ts`

Korunan mobil runtime dosyaları değiştirilmedi.

## 2. Owner görev matrisi

| İstek | Son durum | Güncel kanıt |
|---|---|---|
| Üst bar altındaki beyaz bloom/gölge kalksın | PASS | Genel topbar `::after: none`; beyaz dış bloom yok. CAL-02, store, PDP ve checkout aileleri kaynak sözleşmesine eklendi. |
| Satıcı yanıtı soruyla aynı hizada olmasın | PASS | Yanıt başlangıcı sorudan `28 px` içeride. |
| Yanıt yanında lacivert çizgi olsun | PASS | Çizgi `3 px`, `rgb(6, 30, 69)`. |
| PDP’de kompakt Satıcı Bilgisi kartı | PASS | Logo, tam mağaza adı, doğrulama, hizmet özeti, puan, `Mağazaya Git`, `Satıcıya Sor` var. |
| Mağazaya Git ayrı mağaza sayfası açsın | PASS | CAL-06 → CAL-04 `view=store`; 3 Nova Audio ürünü gösteriliyor. |
| Mağazada arama, filtre, sıralama ve sekmeler | PASS (yerel) | Arama, takip, 3 sekme, quick filter, filtre/sort sheet ve ürün grid’i çalışıyor. Backend/persistence yok. |
| Filtrele/Sırala büyük metin düğmeleri değil küçük ikon olsun | PASS | İki kontrol `42 × 42 CSS px`, erişilebilir adları korunuyor. |
| Mağaza arama focus dikdörtgeni kalksın | PASS | Input outline/shadow `none`; placeholder şeffaf; caret lacivert; yalnız 16 px yuvarlatılmış shell hafif renk değiştiriyor. |
| Mağaza kapak alt sınırı profil logosunun merkezine insin | PASS | Canlı ölçümde cover altı `212.5`, logo merkezi `213`; fark `0.5 px`. |
| Mağaza adının arkasındaki çizgi kalksın | PASS | Kimlik metni beyaz foreground katmanında; canlı son görüntüde dalga sınırı yazı/rozetin arkasından geçmiyor. |
| PDP görsel noktaları görselin içinde olsun | PASS | 3 nokta media shell içinde; aktif nokta belirgin. |
| Görsel ile beyaz detay yüzeyi arasında boşluk olmasın | PASS | Media ve info aynı `x=10`, aynı `w=391.421875`; info yüzeyi media altına yaklaşık `1 px` bindiriliyor. |
| Dalga beyaz detay yüzeyine ait olsun | PASS | Dalga `.pdp-info::before`; carousel hareketinden bağımsız. |
| Dalga solda yüksek, sağda derin ve en sağda yumuşak bitsin | PASS | Sürekli `shape(...)`; son kontrol `96% 48%`, uç `100% 43%`; eski `94% 34% → 100% 51%` ters dönüşü yok. |
| Açıklama/özellikler büyütülebilsin | PASS | Açıklama `10px → 14px`, özellikler `9px → 12px`; düğme `Yazıları küçült` olur; yatay overflow `0`. |
| Viewer son görsel sürüklenip bırakılınca merkeze dönsün | PASS | Üçüncü görsel baseline `translate(0px, 302.5px) scale(1)`; aşağı ve yukarı drag-release sonrası aynı baseline. |
| Checkout turuncu focus halkaları kalksın | PASS | Kart yöntemi açık lacivert-gri seçili yüzey; turuncu shadow/ring yok. |
| Havale/EFT ve Kapıda Ödeme kalksın | PASS | Checkout’ta tek yöntem `Kartla ödeme`. |
| Ödeme ve kart numarası ikonları kartı anlatsın | PASS | Checkout + hesap + sipariş + destek girişleri `CreditCardIcon`. |
| Kart/CVV simgeleri dikey hizalı ve CVV gözü çalışır olsun | PASS | CVV input/button merkez farkı `0 px`; password ↔ text ve `123` görünürlüğü canlı doğrulandı. |
| Son Kullanma trailing simgesi hizalı olsun | PASS | Takvim simgesi aynı `input-icon` merkezleme sözleşmesinde. |

## 3. Canlı A’dan Z’ye kapsam

### 3.1 Route matrisi

Canlı bulut tarayıcıda 37 kanonik URL durumu açıldı; CAL-01 root/login aynı render yüzeyinin iki URL karşılığı olduğundan 36 benzersiz render durumu vardır.

| CAL | Açılan durumlar | Sınıf |
|---|---|---|
| CAL-01 | root, login, forgot, register | Yerel form + demo auth |
| CAL-02 | home, search | Yerel katalog/arama |
| CAL-03 | categories | Yerel taxonomy |
| CAL-04 | PLP, favorites, store | Yerel ticaret/mağaza demosu |
| CAL-05 | filter dialog | Yerel filtre |
| CAL-06 | PDP + viewer/UGC/seller yüzeyleri | Zengin yerel PDP demosu |
| CAL-07 | cart | Yerel cart/kupon |
| CAL-08 | checkout, address, success | Kritik ödeme/order simülasyonu |
| CAL-09 | order, invoice, tracking | Sabit fixture/demo |
| CAL-10 | account, returns, FAQ, history, addresses, notifications, profile, payments, coupons, reviews, questions, security, settings | Karışık yerel state + fixture |
| CAL-11 | support, FAQ, history, live | Yerel destek demosu |
| CAL-12 | NovaBot | Deterministik yerel bot demosu |

Son route taraması:

- 37/37 istenen CAL/view durumu doğru render edildi.
- 678 görünür kontrol örneği envanterlendi.
- Kırık görünür görsel bulunan route: `0`.
- Yatay taşma bulunan route: `0`.
- Erişilebilir adı/implicit label’ı olmayan görünür kontrol: `0`.
- Yinelenen DOM `id`: `0`.

Bu 678 sayı, ortak alt navigasyon ve ProductCard tekrarlarını da içerir; “678 farklı işlev” anlamına gelmez.

### 3.2 Kaynak kontrol envanteri

- 155 `<button>` bildirim yeri
- 28 `KeyboardInput`
- 2 `KeyboardTextarea`
- 5 `BottomSheet`
- 3 inline/custom `role="dialog"`
- 85 CAL navigasyon çağrısı
- 66 Playwright testi / 6 test dosyası keşfediliyor

### 3.3 Canlı çalıştırılan ana etkileşim aileleri

- Demo giriş: şifre gözü, alan doldurma, submit → CAL-10.
- Arama: `Valiz` → tek `travel-case` sonucu.
- PLP sıralama: düşükten yükseğe → ilk ürün `sound-n1`, `₺1.299`.
- ProductCard: favori durumu, sepete ekleme geri bildirimi ve alt nav badge.
- Cart: Pulse adedi `1 → 2`, cart count `3 → 4`, toplam yeniden hesaplandı.
- Mağaza: takip, Fırsatlar/Tüm Ürünler sekmeleri, filtre sheet.
- PDP: satıcı CTA, metin büyütme, Q&A girinti/çizgi, viewer üçüncü görsel up/down reset, zoom/reset.
- Checkout: tek kart, neutral selection, kart/expiry ikonları, CVV göster/gizle.
- Sipariş: `Ürüne Git` doğru `sound-n1` PDP’sini açtı.
- Bildirim: tümünü okundu → `0 okunmamış`.
- Adres: yeni adres formu açıldı.
- Ödeme yöntemleri: yeni kart sheet’i açıldı; kaynakta CVV saved method’a aktarılmıyor.
- İade: neden seçimi ve yerel demo gönderi kodu üretimi.
- Destek: `ödeme` araması → 1 sonuç; canlı destek queued → ready → connected.
- NovaBot: yerel ek eklendi, kullanıcı mesajı ve deterministik bot yanıtı üretildi, composer temizlendi.

Tekrarlanan ortak ProductCard/nav kontrollerinin her instance’ı ayrı ayrı tıklanmadı; aynı bileşen ailesi bir kez ve kritik bağlamlarda tekrar doğrulandı. Gerçek dış sistem işlemleri ve `window.print()` son eylemi çalıştırılmadı.

## 4. Test ve build sonucu

| Kontrol | Sonuç |
|---|---|
| `npm run check:runtime` | PASS — 28 korunan dosya |
| `npx tsc --noEmit --incremental false` | PASS |
| `npm run test:card-geometry` | PASS — 9/9 |
| `node --test tests/carousel-paging.test.mjs` | PASS — 3/3 |
| `npm run build` | PASS |
| `npm run test:sites` | PASS — 4/4 |
| Playwright discovery | PASS — 66 test / 6 dosya |
| V4.12/V4.13 Playwright 7 focused test | **BLOCKED BEFORE ASSERTIONS** — yerel Chromium executable eksik |
| Canlı bulut tarayıcı V4.12/V4.13 + route/interaction turu | PASS (yukarıdaki ölçülü kapsam) |

Playwright satırındaki “7 failed” uygulama assertion sonucu değildir. Her test `browserType.launch` sırasında aynı eksik binary nedeniyle başlamadan durur. Geçerli Chrome/Chromium bulunan CI’da yeniden çalıştırılması zorunludur.

Build uyarısı: ana JS chunk yaklaşık `767 kB` (`240 kB gzip`); release öncesi code splitting değerlendirilmelidir.

Çalışma alanı Git repository değildir. Branch/HEAD/commit kanıtı yok; commit, push ve deploy yapılmadı.

## 5. Bu pakette gerçekten çalışan yerel domain davranışları

- Kategori/subkategori bağlamı
- Katalog filtreleme ve stable sort
- Favoriler ve sepet miktarları
- ProductCard galeri/favori/cart geri bildirimi
- Mağaza arama, sekme, takip, filtre ve sıralama
- PDP galeri/viewer, varyant, seller CTA, açıklama/spec, review/question yerel state’i
- Adres ekleme/düzenleme/default/silme onayı
- Saved-card ekleme/default/silme yerel akışı
- Bildirim read/preference state’i
- Destek arama/accordion/canlı destek simülasyonu
- NovaBot deterministik mesaj/ek/escalation simülasyonu

Bu davranışlar mounted React oturumunda çalışır; sunucu kalıcılığı anlamına gelmez.

## 6. Demo, status-only veya statik kalan davranışlar

- Login/register/forgot gerçek auth değildir.
- Pull-to-refresh veri çekmez; animasyon/remount üretir.
- Paylaş yalnız `Paylaşım hazır` status’u üretir; Share/Clipboard yok.
- Her boş olmayan kupon indirim kabul edilir.
- Checkout doğrulama, PSP veya order transaction olmadan başarı üretir ve cart’ı temizler.
- Profil save, MFA/security/settings değişiklikleri session-localdır.
- Kupon `Kopyalandı` gerçek Clipboard API çağırmaz.
- İade yerel sahte gönderi kodu üretir.
- Canlı destek ve NovaBot deterministic demo state’leridir.
- Ana sayfa hero noktaları statiktir.
- Gizlilik/Kullanım Koşulları metni gerçek link değildir.
- Sipariş/fatura/tracking fixture’dır ve checkout’tan türemez.
- Fatura yazdırma browser side effect’idir; veri sabittir.

## 7. Backend taraması

`src` altında `fetch`, Axios, GraphQL, WebSocket, local/session storage, IndexedDB, Supabase, Firebase, Convex, Stripe, Adyen veya iyzico entegrasyonu bulunmadı. `worker/index.js` yalnız statik asset ve SPA fallback sunar.

Eksik otoriter domainler:

- Auth/session/MFA/logout/revoke/route guard
- Customer profile/consent/preferences persistence
- Catalog/product/SKU/media/store/offer/price/stock
- Search index/facet/cursor pagination
- Favorite/follow/cart/guest merge
- Promotion/quote/tax/shipping/inventory reservation
- PSP tokenization/3DS/payment intent/webhook
- Idempotent order create/state machine
- Shipment/invoice/return/refund
- Review eligibility/moderation
- Question owner privacy/seller authorization
- Notification inbox/device token/dedupe
- Support ticket/chat/attachment security
- Bot authorization/audit/data minimization

## 8. Release engelleyici bulgular

### P0 — Üretime çıkışı engeller

1. **Gerçek auth ve route guard yok.** Her kullanıcı korunan CAL route’larını doğrudan açabilir; login her dolu fixture ile geçer.
2. **Checkout sahte başarı üretir.** Server quote, PSP, 3DS, inventory reservation ve idempotent order olmadan cart temizlenir.
3. **Fiyat, kupon, stok ve toplam client-authoritative.** Üretimde güvenilemez.
4. **PAN/CVV React/DOM içinde tutuluyor.** Bu yalnız yerel prototip için kabul edilebilir; production PSP hosted fields/tokenization gerektirir.
5. **Verified review uygunluğu client hard-code.** Server purchase eligibility yok.
6. **Başka müşterinin pending sorusu client state’e kadar geliyor ve yalnız render öncesi filtreleniyor.** Production API bunu istemciye hiç serialize etmemeli.
7. **Payment/order/inventory idempotency, webhook inbox ve transactional outbox yok.** Retry/double-charge/oversell riski kapatılmamış.

### P1 — Ana işlev ve veri bütünlüğü

1. Alternatif/non-headphone ürünler Pulse kulaklık açıklama, özellik, politika ve varyantlarını miras alabilir.
2. Store route `storeId` ile parametreli değil; farklı seller ürünleri sabit Nova Audio storefront’una gidebilir.
3. `readRoute()` view’ları global allowlist ile kabul eder; CAL bazlı canonical allowlist/redirect yoktur.
4. Hesap Reviews/Questions sabit fixture’dır; PDP’de üretilen UGC state’iyle birleşmez.
5. Store follow/query/filter/sort ve search history component-localdır; reload/remount’ta sıfırlanır.
6. Logout yalnız login route’una gider; token/session/device state’i yoktur.
7. Share ve coupon copy status-onlydır.
8. Custom viewer/filter/checkout dialog’ları için tam focus trap/restoration/native screen-reader kanıtı yoktur.
9. Loading/error/offline/timeout/retry/expired-session/conflict yüzeyleri yoktur.
10. CSS `clip-path: shape()` hedef Android System WebView sürümünde ayrıca uyumluluk testi gerektirir.

Bu turda kapanan önceki P1’ler: payment icon tutarsızlığı, filtre backdrop etkileşimi, order product identity ve yanlış destek kısayolları.

### P2 — Kalite/tamamlayıcılık

- Tek büyük client chunk code splitting bekliyor.
- Hero indicator’ları gerçek carousel kontrolü değil.
- Legal affordance’lar inert metin.
- Settings switch’lerinin ürün genelinde görünür etkisi yok.
- Cart varyant metni sabit `Krem`.
- Tablet/touch/native accessibility için V4.12/V4.13’e özel kalıcı görsel paket yok.
- Yerel Playwright browser kurulumu/CI sabitlenmemiş.

## 9. Üretim backend’i için minimum kontratlar

| Domain | Minimum kontrat |
|---|---|
| Auth | login/register/refresh/logout/reset/MFA; session rotation/revoke; protected route guard |
| Customer | `/me/profile`, preferences, consents, sessions; ETag/version; kritik değişimde re-auth |
| Catalog | products, variants/SKU, media, categories, stores, seller offers/prices, publish/sellability |
| Search | `q`, store/category scope, facets, stable sort, opaque cursor, Türkçe normalizasyon |
| Favorite/Cart | idempotent favorite PUT/DELETE; versioned cart; guest token/login merge |
| Quote/Promotion | server-authoritative minor-unit prices, coupon eligibility/reservation, tax/shipping, expiry |
| Inventory | SKU/seller/warehouse on-hand/reserved/version; TTL reservation; release/consume |
| Payment | PSP hosted fields/SDK, payment token, intent, 3DS, signed webhook inbox/dedupe |
| Orders | idempotent create, immutable item/address/price snapshots, state machine, outbox |
| Shipment/Invoice/Return | owner-scoped tracking/invoice/eligibility/return/refund transitions |
| Reviews | purchase eligibility, duplicate guard, moderation, server masking |
| Questions | public answered + owner-only pending endpoints; seller-store authorization |
| Notifications | inbox/read/preferences/device tokens; recipient-event-channel dedupe |
| Store follow | idempotent follow PUT/DELETE; aggregate metrics projection |
| Support/Bot | ticket/messages, reconnect cursor, attachment scan, authorized bot tools, audit |

## 10. Önerilen uygulama sırası

1. **F0 — Gerçek repo uzlaştırması:** Asıl Android/web/backend/auth/DB/PSP yapılarını bul; her kontratı `EXISTS/PARTIAL/ABSENT/CONFLICTING` sınıflandır.
2. **F1 — Kimlik ve platform temeli:** Auth/session/authz/validator/error envelope/audit/idempotency/outbox-inbox.
3. **F2 — Catalog/store/search read path:** Product/SKU/offer/store/search/facet/pagination.
4. **F3 — Customer persistence:** Profil, adres, favori, cart, guest merge, store follow, notifications.
5. **F4 — Kritik commerce:** Quote/promotion/inventory reservation/PSP/3DS/webhook/order.
6. **F5 — Sipariş sonrası:** Orders/shipment/invoice/return/refund.
7. **F6 — UGC ve bildirim:** Review eligibility, pending-question privacy, seller authorization, event notifications.
8. **F7 — Support/NovaBot:** Ticket/chat, secure attachment, handoff, authorized tools.
9. **F8 — De-mocking ve release:** API adapters, loading/error/offline states, contract/E2E/security/observability/rollback.

## 11. Zorunlu kabul kapıları

- CAL bazlı canonical route allowlist ve invalid-route matrisi
- Her enabled kontrol için gerçek sonuç veya açık demo etiketi; görünür no-op yok
- Product/store/order identity propagation
- Cross-user/cross-seller IDOR matrisi
- Expired/revoked session ve logout sonrası refresh reddi
- Guest cart merge ve concurrency
- Client price/total/coupon tampering
- Son stokta parallel reservation/oversell
- 3DS success/fail/cancel/timeout ve webhook replay
- PAN/CVV log/DB/analytics taraması
- Payment/order/cart/stock tutarlılığı
- Review eligibility/duplicate ve pending-question privacy
- Notification dedupe
- Support reconnect/attachment security/account isolation
- 320–480 px görsel regresyon ve hedef Android WebView/native accessibility
- Geçerli Chrome ile tam 66-test Playwright paketi

## 12. Kanıt sınırları

- Güncel canlı ekranlar yakalanıp görsel olarak incelendi; ancak cloud shared-files mount’u bu turda read-only döndüğü için yeni screenshot dosyaları kalıcı pakete yazılamadı. Bu yüzden rapor, görüntü dosyası eki varmış gibi iddia etmez.
- Yerel Playwright assertions Chromium binary eksikliği nedeniyle çalışmadı; cloud-browser ölçümü bunun yerine geçti ama CI browser testi yerine sayılmaz.
- Bu paket Git repository değildir; commit/push kanıtı üretilemez.
- Kullanıcı deploy istemedi; herhangi bir yayın/deploy yapılmadı.

## 13. Sonuç

V4.12/V4.13 owner görsel görevi, güncel kaynak ve canlı prototip ölçümleriyle kapanmıştır. Uygulama genelindeki yerel etkileşim prototipi geniş ve kullanılabilir durumdadır; ancak gerçek NovaStore üretim uygulaması olmak için gerekli sunucu otoritesi, veri kalıcılığı, güvenlik sınırları ve dış servis entegrasyonları bu pakette yoktur. Bundan sonraki Codex görevi, bu UI paketinde sahte backend yazmaya başlamak değil; önce gerçek üretim repo ve servislerini bulup kontrat bazlı uzlaştırma yapmaktır.
