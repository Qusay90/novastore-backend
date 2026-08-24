> **TARİHSEL / SUPERSEDED:** Bu belge güncel kapanış kanıtı değildir. 13 Ağustos 2026 yeniden doğrulaması için `NOVASTORE_V4_12_13_REVALIDATION_AND_A_Z_AUDIT_2026-08-13.md` kullanılmalıdır.

# NovaStore V4.13 — A’dan Z’ye Uygulama, Etkileşim ve Backend Denetimi

Tarih: 13 Ağustos 2026  
Karar: **ÜRETİME BAĞLI DEĞİL — güçlü bir yerel görsel/etkileşim prototipi**

## 1. Kapsam ve yöntem

- `CAL-01`–`CAL-12` kök ekranları ve anlamlı alt görünümler açıldı. Toplam **37 kanonik route durumu** incelendi.
- Canlı bulut tarayıcı DOM envanterinde **715 görünür kontrol örneği** ve **233 benzersiz kontrol adı** bulundu.
- Paylaşılan alt navigasyon, ProductCard, header, Carousel ve form kontrollerinin yinelenen örnekleri ortak bileşen olarak değerlendirildi; kritik satın alma, hesap, mağaza, arama, filtre, PDP, viewer, destek ve bildirim akışları ayrıca etkileşimle doğrulandı.
- Son silme onayları, gerçek dış sistem işlemleri ve `window.print()` gibi tarayıcı/yerel veri üzerinde sonuç doğurabilecek son adımlar çalıştırılmadı; bunların kaynak kodu, mevcut testleri ve açılan ilk onay durumu incelendi.
- Kaynak kanıtları: `src/Prototype.tsx`, `src/prototype.css`, `src/mobile/*`, `tests/*`, `AGENTS.md`, `package.json`.
- `src` altında üretim API, GraphQL, WebSocket, auth SDK, PSP SDK veya kalıcılık bağlantısı yoktur. Ticaret ve hesap state’i React belleğindedir. `worker/index.js` yalnız statik asset/SPA fallback sunar.

## 2. Bu turda kapatılan owner geri bildirimleri

1. Mağaza adı/arkasındaki çizgi: cover dalgası aşağı alındı; profil kimliği ayrı foreground katmanına taşındı; tam mağaza adı ve doğrulama rozeti korunuyor.
2. Mağaza arama focus’u: ham input üzerindeki sert dikdörtgen outline ve beyaz ring kaldırıldı. Focus’ta placeholder kayboluyor, lacivert caret kalıyor, yalnız yuvarlatılmış shell hafif değişiyor.
3. Mağaza filtre/sıralama: iki tam genişlikte metinli düğme yerine sonuç başlığının yanında iki kompakt ikon kontrolü var; erişilebilir adlar ve sheet davranışı korunuyor.
4. Mağaza hero sınırı: fotoğraf/dalga sınırı profil logosunun yaklaşık merkezine kadar indirildi.
5. Full-screen viewer: 1× düzeyinde yukarı/aşağı sürükleme bırakıldıktan sonra görüntü aynı merkez transformuna geri dönüyor. Sayfa değişimi stale transformu temizliyor; 1×–4× zoom ve zoomlu pan devam ediyor.
6. PDP dalgası: çok noktalı polygon kaldırıldı; solda hafif yükselen, sağa yakın daha derin çukuru ve en sağda yumuşak dönüşü olan iki sürekli Bézier eğrisi kullanılıyor.
7. Viewer açılırken açık simüle klavye kapatılıyor; modal görüntüyü itip kırpmıyor.

Canlı ölçüm kanıtı:

- Store input: `outline-style: none`, `box-shadow: none`, placeholder `rgba(0,0,0,0)`, caret Nova navy.
- Store compact actions: her biri `42 × 42 CSS px`, erişilebilir adları `Filtrele` ve `Sırala`.
- PDP media/detail: aynı x ve genişlik; birleşim yaklaşık `-0,8 px`, yatay overflow `0`.
- PDP white cap computed `clip-path`: `shape(...)`; `polygon(...)` yok.
- Viewer üçüncü görsel 1× baseline: `translate(0px, 302.5px) scale(1)`; hem aşağı hem yukarı drag-release sonrasında aynı baseline.

## 3. Route ve ekran envanteri

| Alan | Mevcut gerçek davranış | Sınıf | Üretim için gereken |
|---|---|---|---|
| CAL-01 Giriş/Kayıt/Şifre | Alan, şifre gözü, koşul, route geçişleri yerel çalışıyor. Dolu fixture ile giriş Hesabım’a gider. | DEMO | Auth/session, doğrulama, reset token, MFA, rate limit, consent ledger |
| CAL-02 Ana Sayfa | Kategori ve ProductCard geçişleri, favori/sepet local state çalışıyor. Hero noktaları statik. | LOCAL + PARTIAL | Katalog/offer/stock/fiyat API, kişiselleştirme, gerçek hero kampanya verisi |
| CAL-02 Arama | Overlay, geçmiş, öneri, ürün filtresi ve kapanma davranışı yerel çalışıyor. Geçmiş route remount’unda kalıcı değil; placeholder kapsamı filtre uygulamasından geniş. | LOCAL-PARTIAL | Arama index’i, typo/Türkçe normalizasyon, facet, pagination, history persistence/privacy |
| CAL-03 Kategoriler | Ana kategori/subkategori bağlamı PLP’ye taşınıyor. | LOCAL | Kategori ağacı ve merchandising read API |
| CAL-04 PLP/Favoriler | Sıralama, filtre, chip, ortak kart, favori animasyonu çalışıyor. | LOCAL | Server catalog query/facet; user favorites persistence |
| CAL-04 Mağaza | Seller-scoped görünen arama, tab, takip, filtre/sort local çalışıyor; yalnız Nova Audio fixture’ına hard-code. | LOCAL-DEMO | `storeId` route, store profile/catalog API, follow persistence, seller isolation |
| CAL-05 Filtre | Min/max input, validation, marka/özellik/stok ve sonuç adedi gerçek mock diziyi değiştiriyor. Arkadaki ghost kart kontrolleri inert değil. | LOCAL + BUG | Server facet/query; dialog arkasını inert yapma |
| CAL-06 PDP | Galeri, viewer, varyant, açıklama büyütme, seller CTA, review/Q&A, öneriler ve sticky CTA yerel çalışıyor. | LOCAL-DEMO | SKU/offer/seller/policy veri modeli; purchase eligibility; UGC privacy/persistence |
| CAL-07 Sepet | Adet, satır, kupon ve checkout route’u local state ile çalışıyor. Boş olmayan her kupon `%15` verir. | DEMO-RISK | Server cart/version, promotion validation, quote, stock/sellability |
| CAL-08 Checkout | Tek kart yöntemi, CVV eye, adres alt görünümü ve başarı route’u çalışıyor. Kart/adres doğrulaması ve tahsilat olmadan başarı üretir, sepeti temizler. | **P0 DEMO** | PSP hosted fields/tokenization, 3DS, server quote, inventory reservation, idempotent payment/order |
| CAL-09 Sipariş | Sipariş, tracking, invoice route’ları ve yazdırma eylemi var; tamamı sabit fixture ve checkout’tan türemiyor. | DEMO | Order state machine, immutable snapshots, shipment/invoice APIs |
| CAL-10 Hesabım | Profil, adres, ödeme kartı, kupon, bildirim, ayar ve aktivite yüzeyleri yerel çalışıyor. Bazıları CommerceContext, bazıları component-local veya sabit fixture. | LOCAL-DEMO | Profile/address/payment-token/preferences/notification/order persistence |
| CAL-10 İade | Neden seçimi ve sahte kargo kodu üretimi var. | DEMO | Eligibility, return/refund state machine, carrier integration |
| CAL-11 Destek | Arama, FAQ, geçmiş, canlı destek state geçişleri local çalışıyor. | DEMO | Ticket/chat, agent assignment, attachment güvenliği, SSE/WebSocket |
| CAL-12 NovaBot | Mesaj, öneri, sahte attachment ve sabit bot cevabı var. | DEMO | Yetkili tool-calling, support handoff, audit, data minimization |

Sınıflar:

- **LOCAL:** Aynı tarayıcı oturumunda gerçek React state ve route etkisi var.
- **DEMO:** Gerçek dış servis veya kalıcı domain sonucu yerine simülasyon var.
- **STATUS-ONLY:** Kullanıcıya başarı/kopyalama/paylaşım metni gösteriyor ancak dış işlem yapmıyor.
- **NO-OP/STATIC:** Etkileşim izlenimi veren yüzey sonuç üretmiyor.
- **BACKEND:** Sunucu otoritesi, kalıcılık, yetki veya üçüncü taraf entegrasyonu zorunlu.

## 4. Release engelleyici bulgular

### P0 — Üretime çıkışı engeller

1. **Gerçek auth ve route guard yok.** Her değerle demo giriş yapılabilir; korunan ekranlar URL ile açılabilir; `CURRENT_MOCK_USER_ID` sabittir.
2. **Checkout sahte başarı üretir.** Server quote, fiyat doğrulaması, PSP, 3DS, payment intent, inventory reservation ve order create olmadan sepet temizlenir.
3. **İstemci fiyat/indirim/stok/toplam otoritesidir.** Kupon ve payable total manipüle edilebilir.
4. **PAN/CVV sınırı production için kurulmamıştır.** Prototip yalnız güvenli görsel davranışı gösterir; gerçek kart özelliği PSP tokenizasyonu olmadan açılamaz.
5. **Review satın alma uygunluğu client hard-code’dur.** `verified` istemciden türetilmemeli.
6. **Pending soru gizliliği client filter’dır.** Başka müşterinin pending sorusu üretimde istemciye hiç serialize edilmemelidir.
7. **Order/stock/payment mutasyonlarında idempotency ve event uzlaştırması yoktur.** Retry çift tahsilat, çift order veya oversell riski doğurur.

### P1 — Ana işlev/veri bütünlüğü

1. Non-headphone ürünler aynı kulaklık PDP açıklaması, varyantı, kampanyası ve özelliklerini miras alabilir.
2. Farklı seller ürününden `Mağazaya Git`, her zaman Nova Audio mağazasını açabilir; gerçek `sellerId/storeId` route parametresi yoktur.
3. `Route` tipi yaklaşık 1.656 kombinasyona izin verir; CAL bazlı allowlist olmadığı için anlamsız `cal/tab/view` eşleşmeleri sessizce kabul edilir.
4. Sipariş `Ürüne Git` eylemi selected product’ı garanti etmez; önceki PDP açılabilir.
5. Hesabım “Değerlendirmelerim/Sorularım” sabit fixture’dır; PDP’de eklenen state ile birleşmez.
6. Filtre sheet arkasındaki ghost ProductCard alt kontrolleri canlı kalabilir; modal arka planı inert değildir.
7. Arama “ürün, kategori veya marka” vaadi verirken filtre esas olarak ürün adı/store üzerinde çalışır.
8. Logout yalnız login route’una gider; gerçek session/token/device push bağı temizlenmez.
9. Paylaşım ve kupon kopyalama eylemleri status-only; Share/Clipboard API entegrasyonu yoktur.
10. Store follow, arama ve filtre state’i route remount’unda sıfırlanır; çok cihaz/kalıcılık yoktur.

### P2 — Kalite, erişilebilirlik ve tamamlayıcılık

1. Ana sayfa hero indicator’ları gerçek carousel kontrolü değildir.
2. Full-screen viewer için focus trap ve native ekran okuyucu doğrulaması bulunmuyor.
3. `Faturayı Yazdır` gerçek `window.print()` çağırır ancak fatura verisi statiktir.
4. Formların loading/error/offline/timeout ve server validation yüzeyleri eksiktir.
5. Birçok “başarı” cümlesi gerçek servis kanıtı olmadan gösterilir; production modunda fail-closed olmalıdır.
6. Yerel CLI Playwright Chromium binary’si yok; statik discovery ve cloud-browser interaction PASS olsa da CI’de sabit browser kurulumu gereklidir.

## 5. Zorunlu backend/API kontratları

| Domain | Minimum kontrat |
|---|---|
| Auth | Login/register/refresh/logout/reset/MFA; token subject otoritesi; session rotation/revoke; protected route guard |
| Customer | `/me/profile`, preferences, consents, sessions; ETag/version; kritik değişimde re-auth |
| Catalog | Products, variants/SKU, media, categories, stores, seller offers/prices, publish/sellability status |
| Search | `q`, store/category scope, min/max, facets, sort, opaque cursor, Türkçe normalizasyon |
| Favorite/Cart | Idempotent favorite PUT/DELETE; versioned cart; guest token ve login merge |
| Quote/Promotion | Server-authoritative minor-unit prices, coupon eligibility/reservation, tax/shipping, expiry |
| Inventory | SKU/seller/warehouse on-hand/reserved/version; TTL reservation; transactional release/consume |
| Payment | PSP hosted fields/SDK, payment-method token, intent, 3DS, signed webhook inbox/dedupe |
| Orders | Idempotent create, immutable item/address/price snapshots, state machine, outbox events |
| Shipment/Invoice/Return | Owner-scoped tracking, invoice, eligibility, return/refund transitions |
| Reviews | Server purchase eligibility; immediate publish for verified buyer; duplicate guard; server masking |
| Questions | Public answered endpoint; owner-only pending endpoint; seller-store authorization; answer event |
| Notifications | Inbox/read/read-all/preferences/device tokens; `(recipient,event,channel)` dedupe |
| Store follow | Idempotent follow PUT/DELETE; aggregate follower count; verified metrics projection |
| Support/Bot | Ticket/messages, reconnect cursor, attachment scan, agent scope, authorized bot tools |

## 6. Güvenlik ve veri değişmezleri

- Kimlik yalnız doğrulanmış token subject’inden gelir; istemci `userId/ownerId` güven kaynağı değildir.
- Bütün object endpoint’leri deny-by-default owner/tenant/seller scope uygular.
- İstemci fiyat, indirim, stok, toplam, verified purchase, seller verification veya payment success konusunda otorite değildir.
- PAN/CVV/parola/access-refresh token log, analytics, crash, destek eki veya bot bağlamına girmez.
- Saved card yalnız PSP token, brand, last4, expiry ve nickname saklar.
- Para integer minor unit + ISO-4217 currency’dir.
- Quote süreli ve kullanıcı/sepet/adres bağlamına kilitlidir; order aynı quote’u bir kez tüketir.
- Payment/order/inventory mutasyonları idempotenttir; PSP/carrier webhook imzası doğrulanır ve event ID ile dedupe edilir.
- Pending soru başka müşteriye API body, cache veya istemci state’i olarak gönderilmez.
- Order/payment/inventory/notification eventleri transaction + outbox/inbox ile uzlaştırılır.
- Production secret, migration apply, gerçek ödeme, deploy veya merge ayrı açık yetki olmadan yapılmaz.

## 7. Önerilen veri modeli

Mevcut ana backend’de eşdeğerleri varsa kopyalanmamalı, uzlaştırılmalıdır:

`customers`, `customer_profiles`, `auth_sessions`, `consents`, `addresses`, `stores`, `store_memberships`, `store_follows`, `categories`, `products`, `product_variants`, `product_media`, `seller_offers`, `offer_prices`, `inventories`, `inventory_reservations`, `favorites`, `carts`, `cart_items`, `promotions`, `coupon_reservations`, `coupon_redemptions`, `checkout_quotes`, `orders`, `order_items`, `payment_methods`, `payment_attempts`, `shipments`, `shipment_events`, `invoices`, `reviews`, `questions`, `answers`, `notification_inbox`, `notification_preferences`, `device_tokens`, `support_tickets`, `support_messages`, `support_attachments`, `return_requests`, `refunds`, `idempotency_keys`, `outbox_events`, `webhook_inbox`, `audit_events`.

## 8. Fazlı uygulama sırası

1. **F0 — Salt okunur uzlaştırma:** Gerçek Android/backend/auth/DB/PSP/connector yapısını bul; her alanı `EXISTS/PARTIAL/ABSENT/CONFLICTING` sınıflandır.
2. **F1 — Kimlik ve platform temeli:** Auth/session/MFA/consent, authz, validator, error envelope, audit, idempotency, outbox/inbox.
3. **F2 — Catalog/store/search read path:** Product/variant/offer/media/store/search/facet ve stable pagination.
4. **F3 — Müşteri kalıcılığı:** Profil, adres, favori, sepet, guest merge, store follow, notification preferences.
5. **F4 — Commerce kritik yol:** Quote, promotion, inventory reservation, PSP tokenization/3DS/webhook, idempotent order.
6. **F5 — Sipariş sonrası:** Order list/detail, shipment, invoice, return/refund.
7. **F6 — UGC ve bildirim:** Verified review, pending-question privacy, seller answer auth, outbox notification.
8. **F7 — Support/NovaBot:** Ticket/chat, attachment security, handoff, authorized bot tools.
9. **F8 — Mobil de-mocking ve release:** API adapters, loading/error/offline states, flags, contract/E2E/security/observability, rollback.

## 9. Kabul testi kapıları

- CAL bazlı route allowlist ve kanonik redirect/replace matrisi.
- Her enabled kontrol ya gerçek sonuç üretmeli ya açıkça `demo` olarak işaretlenmeli; görünür no-op kalmamalı.
- Her product/store/order/notification akışında doğru productId/storeId taşınmalı.
- Cross-user ve cross-seller IDOR matrisi.
- Expired/revoked session ve logout sonrası refresh reddi.
- Guest cart merge ve iki cihaz concurrency.
- Client price/total/coupon tampering.
- Son stok için eşzamanlı reservation/oversell testi.
- 3DS success/fail/cancel/timeout ve webhook replay.
- PAN/CVV log/DB/analytics taraması.
- Payment başarı/başarısızlığında order/cart/stock tutarlılığı.
- Satın almayan review 403; uygun review anında public; retry duplicate üretmez.
- Pending soru body/cache/client sızıntısı yok; seller A seller B sorusuna erişemez.
- Tek domain eventten tek notification.
- Support reconnect/dedupe, attachment MIME/size/malware, cross-account isolation.
- Android/cloud/CI E2E; 320–480 px görsel regresyon; native accessibility ayrıca doğrulanır.

## 10. Bu çalışma alanındaki doğrulama

- `npm run check:runtime`: PASS — 28/28 protected file.
- `npx tsc --noEmit`: PASS.
- `npm run build`: PASS.
- ProductCard geometry: PASS — 9/9.
- Carousel paging unit: PASS — 3/3.
- Sites worker: PASS — 4/4.
- V4.13 Playwright discovery/type contract: PASS — 2 yeni focused test.
- Cloud browser: yeni store focus/hero/compact controls, PDP curve/seam ve viewer drag-reset/zoom/pan PASS.
- Yerel Playwright browser execution: BLOCKED — workspace’te Playwright Chromium binary yok; test gövdesi başlamadan launch engeli.
- Git: çalışma alanında kullanılabilir repository metadata/HEAD yok; commit/push yapılmadı.
- Deploy: bu turda kullanıcı deploy istemedi; yapılmadı.

## 11. Sonuç

V4.13 görsel ve yerel etkileşim prototipi owner’ın son UI geri bildirimlerini karşılıyor. Ancak bu repository tek başına üretim NovaStore değildir. Üretim için en kritik sıra: gerçek repo uzlaştırması → authz/platform → catalog/store/search → kalıcı customer state → server quote/stock/payment/order → UGC privacy → support → de-mocking/release kapılarıdır.
