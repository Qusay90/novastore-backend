# NovaStore V4.13 — Yeni Sohbet Devam Handoff'u

Tarih: 13 Ağustos 2026  
Durum: V4.13 görsel ve yerel etkileşim kalibrasyonu tamamlandı; üretim altyapısı uzlaştırması henüz başlamadı.

## 1. Yeni sohbetin rolü

Bu sohbet, NovaStore Android müşteri uygulamasının tema/prototip çalışmasının ve Codex entegrasyon yönetiminin devamıdır.

Yeni sohbet:

- Tamamlanmış V4.13 tasarımını sıfırdan üretmeye veya önceki kabul edilmiş işleri tekrar etmeyecek.
- ChatGPT tarafında tema, görsel kararlar, kullanıcı geri bildirimleri, kabul kriterleri ve Codex görev yönetimini sürdürecek.
- Codex'e gönderilecek bütün promptları tek parça, bir tıklamayla kopyalanabilir metin bloğu olarak verecek.
- Kullanıcı Codex raporu gönderdiğinde onu kanıt, kapsam, güvenlik, test, commit, push ve deploy kapıları bakımından denetleyecek; ardından yalnız gerekli sonraki promptu hazırlayacak.
- Kullanıcı yeni bir görsel düzeltme isterse önce mevcut V4.13 bileşenlerini ve kaynak görselleri inceleyip aynı prototip üzerinde küçük ve doğrulanabilir değişiklik yapacak.
- Production, gerçek ödeme, production DB, migration apply, push, PR, merge veya deploy işlemlerini açık kullanıcı yetkisi olmadan yapmayacak.

## 2. Önce okunacak dosyalar

Sıra bağlayıcıdır:

1. `AGENTS.md`
2. `NOVASTORE_NEW_CHAT_CONTINUATION_V4_13.md`
3. `NOVASTORE_A_Z_AUDIT_V4_13.md`
4. `CODEX_HANDOFF_PROMPT_V4_13.md`
5. `design-qa.md`
6. Gerektiğinde `src/Prototype.tsx`, `src/prototype.css` ve ilgili `tests/`

Aynı ChatGPT Projesi içindeki eski konuşma geçmişi erişilebiliyorsa, `NovaStore APP tema Entegrasyonu` konuşmasını yalnız ek bağlam ve kaynak görseller için incele. Eski konuşma doğrudan erişilemiyorsa erişmiş gibi davranma; bu handoff ve yüklenen dosyaları bağlayıcı kaynak kabul et. Belirsizlik varsa kullanıcıdan yalnız eksik dosya veya görseli yeniden yüklemesini iste.

## 3. Mevcut kesin durum

- Sürüm: NovaStore müşteri prototipi V4.13.
- V4.13 görsel/local-interaction sonucu: PASS.
- Üretim entegrasyonu sonucu: `ÜRETİME BAĞLI DEĞİL — güçlü yerel görsel/etkileşim prototipi`.
- A–Z denetiminde 37 anlamlı route durumu açıldı.
- 715 görünür kontrol örneği ve 233 benzersiz kontrol adı envantere alındı.
- Ortak kontroller davranış sınıfı başına doğrulandı; kritik auth, search, store, filter, PDP/viewer, cart/checkout, account, notification, order, support ve NovaBot akışları ayrıca incelendi.
- Gerçek dış sistem işlemleri ve geri döndürülemez son onaylar uygulanmadı.
- Commit, push ve deploy yapılmadı; bu çalışma alanında kullanılabilir Git repository metadata/HEAD yoktu.
- Production/remote DB ve gerçek ödeme kullanılmadı.

## 4. Son kapatılan kullanıcı geri bildirimleri

- Favoriler kartı bütün ProductCard yüzeylerinin kanonik referansıdır.
- Ürün kartı ve PDP galerileri bir gesture'da en fazla bir görsel ilerler; overshoot/sallantı yoktur.
- Seçili carousel göstergesi yuvarlak, lacivert ve pasif noktadan yalnız 1,25–1,5 kat büyüktür.
- PDP görsel viewer'ı swipe, ok, 1×–4× zoom ve pan destekler; 1× dikey sürükleme bırakılınca tam merkez baseline'a döner.
- PDP medya/detay yüzeyi arasında boş seam yoktur; beyaz detay cap'i kesintisiz responsive Bézier dalgadır.
- Mağaza kapağı profil logosunun yaklaşık merkezine kadar uzar; mağaza adının arkasında çizgi yoktur.
- Mağaza arama alanında sert raw-input focus kutusu yoktur; focus'ta placeholder kaybolur, caret kalır ve yalnız rounded shell hafif değişir.
- Mağaza filtre ve sıralama eylemleri sonuç başlığında 42×42 kompakt ikon kontrolleridir.
- PDP seller alanı inline mini mağaza açmaz; ayrı `Mağazaya Git` route'u ve `Satıcıya Sor` eylemi kullanır.
- Ürün açıklaması ve özelliklerinde `Yazıları büyüt / Yazıları küçült` reflow kontrolü vardır.
- Checkout yalnız kart ödeme seçeneğini gösterir; CVV gözü çalışır ve CVV saklanmaz.
- Verified buyer değerlendirmesi moderasyon metni olmadan anında görünür; yalnız `Doğrulanmış alışveriş` yeşildir.
- Pending soru yalnız sahibine görünür; yanıtlanınca public soru-cevap olur. Gerçek yetkilendirme ve kalıcılık Codex işidir.
- PDP, kategori ve Hesabım terminal boşlukları sticky bar/safe-area ölçülerine indirildi.

## 5. Doğrulama kanıtı

- `npm run check:runtime`: PASS — 28/28.
- `npx tsc --noEmit`: PASS.
- `npm run build`: PASS.
- ProductCard geometry: PASS — 9/9.
- Carousel paging: PASS — 3/3.
- Sites worker: PASS — 4/4.
- Playwright statik discovery: PASS — toplam 56 test / 5 dosya.
- Bulut tarayıcı: store focus/hero/tools, filtre/sort sheet, PDP curve/seam ve viewer drag-reset/zoom/pan PASS.
- Yerel Playwright test gövdeleri: BLOCKED — ortamda Chromium binary yoktu; PASS olarak sayılmadı.
- Uygulama kaynaklı console hatası görülmedi; yalnız browser extension metadata gürültüsü vardı.

## 6. A–Z denetiminin kritik sonucu

### P0

- Gerçek auth/session/route guard yok.
- Checkout server quote, PSP, 3DS, payment intent, stok rezervasyonu veya gerçek order create olmadan başarı üretebilir.
- Fiyat, kupon, stok ve toplam client otoritesindedir.
- Production PSP tokenizasyon/PAN/CVV sınırı kurulmamıştır.
- Review purchase eligibility client hard-code'dur.
- Pending soru gizliliği client filter'dır; production'da başka müşteriye serialize edilmemelidir.
- Para, stok ve sipariş olayları için idempotency/outbox/inbox uzlaştırması yoktur.

### P1

- Ürün detay verisi kategori/SKU bazında ayrılmadan farklı ürünlere kulaklık fixture'ı sızabilir.
- Store route gerçek `storeId` taşımıyor ve Nova Audio'ya hard-code olabilir.
- CAL/tab/view kombinasyonları için sıkı allowlist/canonical redirect yok.
- Order `Ürüne Git` stale selected product açabilir.
- Hesabım değerlendirme/sorular ekranı PDP state/API ile bağlı değildir.
- Filtre sheet arkasındaki kontroller inert olmayabilir.
- Arama vaat ettiği ürün/kategori/marka kapsamını tam karşılamaz.
- Logout gerçek session/token/device temizliği yapmaz.
- Share/copy bazı yüzeylerde status-only'dir.
- Store follow/search/filter state'i kalıcı değildir.

## 7. Codex'e sıradaki görev

Sıradaki güvenli kapı yalnız `Faz 0 — salt okunur production reconciliation`dır.

Codex:

- Ana repository, gerçek Android uygulama, backend/BFF, auth, DB migrations, seller/admin connector, PSP, search ve event altyapısını bulacak.
- Her alanı kaynak dosya, endpoint, migration ve test kanıtıyla `EXISTS / PARTIAL / ABSENT / CONFLICTING` sınıflandıracak.
- Kanıtlı uzlaştırma raporu vermeden implementation yapmayacak.
- Eski kabul edilmiş işleri yeniden üretmeyecek ve paralel ikinci auth/order/payment sistemi kurmayacak.
- Stocky/vendor core varsa mümkün olduğunca değiştirmeyecek; NovaStore bağlantısını mevcut connector/BFF sınırında tutacak.

Tam Codex talimatı `CODEX_HANDOFF_PROMPT_V4_13.md` içindedir.

## 8. Yeni sohbette ilk cevap davranışı

Dosyalar okunduktan sonra kullanıcıya kısa şekilde şunları söyle:

1. Handoff'un ve V4.13 durumunun alındığını doğrula.
2. V4.13'ün yeniden yapılmayacağını belirt.
3. Sıradaki kapının Codex Faz 0 uzlaştırma olduğunu belirt.
4. Kullanıcıdan Codex'in Faz 0 raporunu göndermesini veya yeni görsel geri bildirimini vermesini bekle.

Eksik dosya varsa genel açıklamaya başlama; eksik dosyanın tam adını söyle.

## 9. Yeni sohbet için kısa başlangıç promptu

```text
Bu sohbet, NovaStore Android müşteri uygulaması V4.13 tema/prototip çalışmasının ve Codex entegrasyon yönetiminin devamıdır. Yüklediğim dosyaları şu sırayla eksiksiz oku: AGENTS.md, NOVASTORE_NEW_CHAT_CONTINUATION_V4_13.md, NOVASTORE_A_Z_AUDIT_V4_13.md, CODEX_HANDOFF_PROMPT_V4_13.md ve design-qa.md. Aynı ChatGPT Projesindeki önceki “NovaStore APP tema Entegrasyonu” konuşmasına erişebiliyorsan gerektiğinde kaynak görseller ve kararların ayrıntısı için bak; erişemiyorsan erişmiş gibi davranma ve yüklenen handoff'u bağlayıcı kaynak kabul et.

V4.13'te tamamlanmış ve PASS olmuş görsel/local-interaction işlerini yeniden yapma. ChatGPT burada tema, görsel kararlar, kabul kriterleri ve Codex görev yönetiminin sahibidir. Codex'e gönderilecek her promptu tek parça, bir tıklamayla kopyalanabilir metin bloğu olarak ver. Kullanıcı Codex raporu gönderdiğinde raporu kanıt, kapsam, güvenlik, test, commit, push ve deploy kapıları bakımından denetle; sonra yalnız gerekli sonraki promptu hazırla.

Mevcut durum: V4.13 görsel/local-interaction PASS; uygulama production'a bağlı değildir. Sıradaki güvenli görev yalnız CODEX_HANDOFF_PROMPT_V4_13.md içindeki Faz 0 salt-okunur production reconciliation'dır. Kanıtlı EXISTS/PARTIAL/ABSENT/CONFLICTING matrisi gelmeden implementation'a, production DB'ye, gerçek ödemeye, migration apply'a, commit/push/PR/merge/deploy'a geçme. Kullanıcı açık yetki vermedikçe bunların hiçbirini yapma.

Şimdi önce dosyaları okuduğunu, V4.13'ü yeniden yapmayacağını ve sıradaki kapının Codex Faz 0 olduğunu kısa biçimde doğrula; ardından benden Codex Faz 0 raporunu veya yeni geri bildirimi bekle.
```
