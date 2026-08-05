# Tur 1 — Düzeltme Sonrası Tasarım QA Kaydı

Bu kayıt yalnız Tur 1 ortak tasarım sistemi, bileşen kataloğu ve debug görsel QA altyapısını değerlendirir. Home, Orders, Appearance veya başka bir gerçek müşteri ekranı uygulanmadı; Tur 2 başlatılmadı.

## Görsel gerçeklik ve uygulama kanıtı

- Kaynak görsel kökü: `C:\Users\kusay\source\NovaStore-Codex\android-customer-theme-20260722\.handoff-stage-20260722\android-tema-reference`
- Üst bar kaynağı: `Siparişlerim listesi.png` — 850 × 1850 px.
- Alt bar kaynağı: `Anasayfa teması.png` — 853 × 1844 px; `Ana Sayfa` seçili, sepet rozeti `3`.
- Uygulama üst barı: `C:\Users\kusay\source\NovaStore-Codex\android-customer-theme-20260722\evidence\tur1\controlled-top-bar-app-final-1080x2400.png`.
- Uygulama alt barı: `C:\Users\kusay\source\NovaStore-Codex\android-customer-theme-20260722\evidence\tur1\controlled-bottom-bar-app-final-1080x2400.png`.
- Aynı ölçekli yan yana karşılaştırma: `C:\Users\kusay\source\NovaStore-Codex\android-customer-theme-20260722\evidence\tur1\controlled-components-side-by-side.png`.
- Yüzde 50 kaynak + yüzde 50 uygulama overlay: `C:\Users\kusay\source\NovaStore-Codex\android-customer-theme-20260722\evidence\tur1\controlled-components-overlay-50.png`.
- Maskesiz, açıklamalı ısı haritası: `C:\Users\kusay\source\NovaStore-Codex\android-customer-theme-20260722\evidence\tur1\controlled-components-heatmap-annotated.png`.
- Balon hareket videosu: `C:\Users\kusay\source\NovaStore-Codex\android-customer-theme-20260722\evidence\tur1\controlled-bottom-bar-transition.mp4`.
- Katalog kaydırma kanıtı: `C:\Users\kusay\source\NovaStore-Codex\android-customer-theme-20260722\evidence\tur1\catalog-scroll-proof-contact-sheet.png`.
- Gerçek açılır modal kanıtı: `C:\Users\kusay\source\NovaStore-Codex\android-customer-theme-20260722\evidence\tur1\catalog-interactive-modal-open.png`.
- 80/77 seçici kanıtı: `C:\Users\kusay\source\NovaStore-Codex\android-customer-theme-20260722\evidence\tur1\scenario-selector-final-correction.png`.

## Sabit doğrulama ortamı

- AVD: `Medium_Phone_API_36.1`, Android API 36, `emulator-5554`.
- Fiziksel viewport: 1080 × 2400 px.
- Yoğunluk: 420 dpi; font scale: 1.0.
- Dil: `tr-TR`; açık tema.
- Uygulama paketi: `com.novastore.app`, sürüm `1.0.0 (1)`, debug.
- Aynı uygulama sistem çubuğu düzeni bütün uygulama yakalamalarında korundu. Kaynak mockuplarda sistem çubuğu bulunmadığı için odaklı bileşen kırpmaları sistem çubuğunu içermiyor.
- CSS viewport ve `deviceScaleFactor` uygulanamaz; kanıt yerel Android Compose çıktısıdır.

## Ölçekleme, kırpma ve koordinat dönüşümü

Görsel farkları saklayan yeniden ölçeklendirme yapılmadı. Kaynak yalnız uygulamanın fiziksel genişliğine normalize edildi; en-boy oranı korundu. Sonrasında yalnız bileşen merkezini hizalayan dikey kırpma/öteleme uygulandı.

### Üst bar

- Kaynak: 850 px → 1080 px; ölçek `1.270588`.
- Normalize kaynak kırpması: `x=0..1080`, `y=36..216`.
- Uygulama kırpması: `x=0..1080`, `y=68..248`.
- Kaynak bar kutusu normalize edildiğinde yaklaşık `x=48..1032`, `h=124–125 px`.
- Uygulama bar kutusu: `x=47..1033`, `h=126 px` = 48 dp.
- Kaynak başlık piksel kutusu normalize edildiğinde yaklaşık `231 × 43 px`; uygulama başlığı `233 × 44 px`.

### Alt navigasyon

- Kaynak: 853 px → 1080 px; ölçek `1.266120`.
- Normalize kaynak kırpması: `x=0..1080`, `y=2069..2319`.
- Uygulama kırpması: `x=0..1080`, `y=2088..2338`.
- Kaynak taban yüksekliği normalize edildiğinde yaklaşık `152–154 px`; uygulama tabanı `152 px` = 58 dp.
- Kaynak seçili balon çapı normalize edildiğinde yaklaşık `158–161 px`; uygulama balonu `163 px` = 62 dp.
- Kaynak `Kategoriler` etiketi normalize edildiğinde yaklaşık `95 × 19 px`; uygulama görünür piksel kutusu yaklaşık `99 × 20 px`.
- Kaynak favori ikonu normalize edildiğinde yaklaşık `47 × 43 px`; uygulama görünür piksel kutusu yaklaşık `48 × 44 px`.
- Alt fixture zemini opaklığı görünür kılmak için lacivert/açık/turuncu ölçüm bantları içerir. Kaynakta ürün içeriği vardır. Bu zemin farkı ısı haritasında maskelenmedi ve renk eşleşme skoru olarak yorumlanmadı.

## Bulgular

- Güncel kontrollü karşılaştırmada açık P0, P1 veya P2 ortak-bileşen farkı saptanmadı.
- [P3] Kaynaktaki ikonlar özel çizilmiş ince konturlara sahipken uygulama en yakın Material `Outlined/Filled` ikon ailesini kullanıyor. Geometri ve optik boyut eşleştirildi; bazı eğri ve kontur kalınlıklarında yakın bakışta küçük siluet farkı kalıyor.
- [P3] Cam yüzey, merkezi opaklık tokenları, çok katmanlı beyaz/lacivert tonlama, iç parlaklık, kenarlık ve yumuşak gölgeyle üretiliyor. Compose bileşeni keyfî arka planı canlı olarak örnekleyip gerçek backdrop blur uygulamıyor; hareketli ve yüksek ayrıntılı içerikte kaynak rasterdaki blur karakterine göre küçük fark kalabilir.
- [P3] Kaynak mockuplarda Android sistem barları yoktur. Sistem barları uygulama yakalamalarında sabit tutuldu, fakat odaklı üst/alt bileşen kanıtlarından bilinçli olarak dışarı kırpıldı.

## Zorunlu sadakat yüzeyleri

- Font ve tipografi: Üst başlık 17 sp / 22 sp, alt etiket 8 sp / 10 sp olarak merkezi tokenlara bağlandı. Kaynak ve uygulama başlık/etiket piksel kutuları aynı fiziksel ölçeğe getirildi. Türkçe kopya ve karakterler doğru.
- Spacing ve layout: Üst bar 48 dp ve 20 dp radius; alt dış konteyner 70 dp, cam taban 58 dp, balon 62 dp. Seçili öğe 1.2 ağırlığa yumuşak geçerek kaynakta seçili balonun komşuları açma karakterini taklit ediyor. Balon tabanı aşıyor ve kırpılmıyor.
- Renk ve tokenlar: Lacivert/turuncu, cam üst-alt opaklığı, backdrop tint, gloss, stroke ve gölgeler `CustomerTokens.kt` içinde merkezîdir; ekran bazlı görsel hile kullanılmadı.
- Görsel/asset sadakati: Tur 1 gerçek ürün veya dekoratif asset üretmez. Kaynak asset yerine emoji, metin sembolü, sahte SVG veya ürün placeholder'ı eklenmedi. Debug opaklık bantları yalnız ölçüm zemini olarak açıkça etiketlidir.
- İkonlar: En yakın Material ikon ailesi kullanıldı; boyutlar ve hizalar kaynak piksel kutularına çekildi. Kalan siluet farkı P3 olarak açıklandı.
- Kopya/içerik: Fixture verileri sentetik ve `.test` alan adındadır. Gerçek PII, ödeme, SMS, e-posta veya remote veri yoktur.
- Durum ve etkileşim: OTP düzenlenebilir; switch/chip/tab/bottom-nav etkileşimli; timeline gerçek veri modeliyle çizilir; modal gerçek `Dialog` olarak açılır/kapanır; loading, empty, error ve offline durumları ayrı ortak bileşen örnekleridir.
- Erişilebilirlik: 48 dp minimum dokunma alanı, tab/selected semantiği, içerik açıklamaları ve azaltılmış hareket süresi korunur.

## Karşılaştırma geçmişi

### Önceki insan kapısı — blocked

- [P1] Alt taban kalın ve opaktı; seçili balon tabanın içinde sıkışıyordu.
- [P1] Balon katman/parlaklık/gölge karakteri ve küçülme-genişleme hareketi kaynağı karşılamıyordu.
- [P1] Üst bar 56 dp ile fazla yüksekti; başlık ve geri ikonunun türü/ölçeği yanlıştı.
- [P2] Alt ikonlar/etiketler iri ve sıkışık görünüyordu.
- [P1] Aynı olmayan tam ekranlar yan yana konmuş; aynı bileşen/durum fixture'ı, overlay ve ısı haritası üretilmemişti.
- [P2] OTP, timeline, modal ve bütün durumların kaydırmalı görsel kanıtı eksikti.

### Düzeltme

- Üst/alt bar ve balon kaynak piksel kutularından yeniden ölçülüp merkezi tokenlara taşındı.
- Alt taban ayrı 58 dp cam katmanı, dış 70 dp taşma konteyneri ve 62 dp katmanlı/gloss balon olarak yeniden kuruldu.
- İkon/etiket tipografisi küçültüldü; seçili öğe ağırlığı ve fade/shrink/expand geçişi animasyonlandı; animasyon kırpması kapatıldı.
- Üst bar 48 dp/20 dp radius oldu; `KeyboardArrowLeft` tipindeki geri ikonu ve ölçülmüş başlık stili kullanıldı.
- Debug-only üst/alt kontrollü fixture eklendi.
- Gerçek dialog, offline state ve kaydırmalı katalog kanıtları eklendi.
- Son uygulama yeniden yakalandı; aynı ölçekli yan yana, yüzde 50 overlay ve maskesiz açıklamalı ısı haritası üretildi.

## Test ve build sonucu

- `:app:testDebugUnitTest`: 34 test, 0 failure, 0 error, 0 skipped — PASS.
- `:app:testReleaseUnitTest`: 34 test, 0 failure, 0 error, 0 skipped — PASS.
- `:app:connectedDebugAndroidTest`: 5 test, 0 failure, 0 error, 0 skipped — PASS.
- `:app:assembleDebug`: PASS.
- `:app:compileReleaseKotlin`: PASS.
- Release runtime sınıf JAR'ında QA sınıf girdisi: 0; birleştirilmiş release manifestlerinde QA/cleartext marker'ı: 0 — PASS.
- `git diff --check`: PASS.
- Ek `:app:lintDebug` kontrolü: FAIL; değişmemiş `NotificationsScreen.kt:2201` satırındaki üç API 26 `java.time` lint hatası nedeniyle. Dosya Tur 1 diff'inde değildir; bu turda kapsam dışı kod değiştirilmedi. Ana plan lint'i “uygulanabiliyorsa” ek kontrol olarak tanımlar; zorunlu Tur 1 unit/build kapıları geçmiştir.

## İkinci insan geri bildirimi sonrası doğrulama — 2026-07-23

Bu bölüm yukarıdaki önceki ikon/P3 ve ilk test kaydını güncel durum açısından geçersiz kılar; tarihsel kayıt silinmemiştir. Gerçek Tur 2 ekranı oluşturulmadı.

### Uygulanan görsel düzeltmeler

- Alt navigasyon ikonları genel Material ikonlarından çıkarıldı. Kaynak siluetleriyle eşleşen sabit Phosphor yolları kullanıldı: yuvarlak dört hücreli `Kategoriler`, saplı `Sepetim` çantası, yuvarlatılmış `Destek` konuşma balonu, `Ana Sayfa`, `Favoriler` ve `Hesabım`. Seçili olmayan ikonlarda kaynak piksel kutusuna göre yatay optik ölçek uygulandı; rozetin bağlı olduğu 22 dp ikon yuvası sabit kaldı.
- Sepet rozeti kaynakta ve uygulamada `x=657..695` aralığına, yaklaşık `y=71..108` / `y=70..108` aralığına oturdu. Kaynak ve uygulama merkezleri aynı 1080 px ölçekte yaklaşık `x=676` oldu.
- Seçili balon 68 dp, kısıtsız ve kare halo katmanı ile 62 dp dairesel çekirdek olarak çiziliyor. Dıştaki ikinci keskin halka kaldırıldı; halo kenarı radyal olarak saydamlaşıyor, tek keskin halka çekirdekte kalıyor. `requiredSize`, `SizeTransform(clip=false)` ve dokunma göstergesinin kapatılması sayesinde geçişte dikdörtgen ripple, ovalleşme ve katman kırpılması önlendi.
- Ana Sayfa seçili merkezi yaklaşık `x=153.5`, Hesabım seçili merkezi yaklaşık `x=936` olacak şekilde kaynak kenar optiğine hizalandı.
- Üst barın geometri ve tipografisi korunarak yalnız geri ikonu düzeltildi. Kaynak görünür kutusu `21 × 39 px`, uygulama görünür kutusu `21 × 40 px`; merkez farkı yaklaşık `1.4 px` yatay ve `1.2 px` düşeydir.
- Renk bantlı opaklık fixture'ı korundu. Buna ek olarak yalnız debug kaynak setinde, Home kaynağından değiştirilmeden alınan `853 × 274` ürün zemini eklendi. Kaynak ve debug kopyasının SHA-256 değeri `69441d885e7ff291525b04d828bd7daa67c60ba6a23c637d705c28964688e96e` değeridir.

### Güncel görsel kanıtlar

- Final Ana Sayfa tam ekran: `C:\Users\kusay\source\NovaStore-Codex\android-customer-theme-20260722\evidence\tur1\tur1-verified-final-home-full-1080x2400.png`.
- Final Hesabım tam ekran: `C:\Users\kusay\source\NovaStore-Codex\android-customer-theme-20260722\evidence\tur1\tur1-verified-final-account-full-1080x2400.png`.
- Final üst bar tam ekran: `C:\Users\kusay\source\NovaStore-Codex\android-customer-theme-20260722\evidence\tur1\tur1-verified-final-top-full-1080x2400.png`.
- Aynı fiziksel ölçekte kaynak/uygulama: `C:\Users\kusay\source\NovaStore-Codex\android-customer-theme-20260722\evidence\tur1\tur1-verified-final-bottom-side-by-side-1to1.png`.
- Yüzde 50 overlay: `C:\Users\kusay\source\NovaStore-Codex\android-customer-theme-20260722\evidence\tur1\tur1-verified-final-bottom-overlay-50.png`.
- Maskesiz açıklamalı ısı haritası: `C:\Users\kusay\source\NovaStore-Codex\android-customer-theme-20260722\evidence\tur1\tur1-verified-final-bottom-heatmap-maskless-annotated-tr.png`. Zemin, cam yüzey, gölge, ikon, rozet ve tipografi dahil hiçbir piksel alanı maskelenmedi. Ham ölçüm `MAE=38.931`, `RMSE=68.346`; bunlar arka plan ve raster farklarını da içerdiği için kabul skoru olarak yorumlanmadı.
- Ana Sayfa/Hesabım aynı ürün zemini kanıtı: `C:\Users\kusay\source\NovaStore-Codex\android-customer-theme-20260722\evidence\tur1\tur1-verified-final-home-account-selected-proof-tr.png`.
- Üst ve alt bileşen 1:1 panosu: `C:\Users\kusay\source\NovaStore-Codex\android-customer-theme-20260722\evidence\tur1\tur1-verified-final-components-side-by-side-1to1-tr.png`.
- Doğrulanmış geçiş videosu: `C:\Users\kusay\source\NovaStore-Codex\android-customer-theme-20260722\evidence\tur1\tur1-human-gate-transition-verified-final.mp4`.
- Başlangıç/ara/bitiş açıklamalı contact sheet: `C:\Users\kusay\source\NovaStore-Codex\android-customer-theme-20260722\evidence\tur1\tur1-human-gate-transition-contact-sheet-tr.png`. Yerleşim katmanı ara kare dahil 68 × 68 dp karedir; oturmuş çekirdekler 159 × 159 px görünür kutudadır.

### Güncel zorunlu kapılar

- `:app:testDebugUnitTest`: 34 test, 0 failure, 0 error, 0 skipped — PASS.
- `:app:testReleaseUnitTest`: 34 test, 0 failure, 0 error, 0 skipped — PASS.
- `:app:connectedDebugAndroidTest`: 6 test, 0 failure, 0 error, 0 skipped — PASS.
- `:app:assembleDebug`, `:app:compileReleaseKotlin`, `:app:bundleReleaseClassesToRuntimeJar`, `:app:processReleaseManifest` — PASS.
- Release runtime JAR QA girdisi: 0; üç release manifestinde QA/cleartext işareti: 0; release ara çıktılarında QA fixture dosya adı: 0 — PASS.
- Final cihaz akışında FATAL/ANR girdisi: 0; depolama eşiği doğrulama sonunda `null` — PASS.
- `graphify update .` ve `git diff --check` — PASS. Staging alanı boştur.
- Önceki ek `lintDebug` sonucu değişmemiş kapsam dışı `NotificationsScreen.kt:2201` API 26 `java.time` bulgusuyla FAIL olarak tarihsel kayıtta kalır; dosya Tur 1 diff'ine alınmadı ve bu turda değiştirilmedi.

### Açıkça kalan görsel farklar

- Kaynak PNG rasterizasyonu ile Android metin/vektör rasterizasyonu arasında yakın bakışta yaklaşık 1–4 px kenar yumuşatma ve kontur kalınlığı farkları kalır.
- Cam yüzey gerçek zamanlı backdrop blur uygulamaz; merkezi saydamlık, tint, highlight ve gölge katmanlarıyla yaklaşır. Aynı kaynak ürün zeminindeki maskesiz ısı haritası bu farkı saklamaz.
- Kaynak mockup altında barın örttüğü gerçek ürün pikselleri erişilebilir değildir. Debug fixture aynı Home kaynağının değiştirilmemiş, normalize ürün kırpmasını kullanır; bu nedenle gizli arka plan piksel eşliği iddia edilmez.

## Açık kapı

Tek açık kabul kapısı kullanıcının bu güncel kanıtlar için açıkça `Tur 1 görsel onayı PASS` demesidir. Otomatik testler ve Codex değerlendirmesi insan görsel kapısının yerine geçmez. Bu onay alınmadan Tur 1 kapatılmaz ve Tur 2 başlatılmaz.

final result: blocked

## Selected-item cradle / birleşik silüet yeniden incelemesi — 2026-07-25

Bu bölüm, 25 Temmuz 2026 tarihli bağlayıcı `CHANGES REQUESTED` kararındaki
bar + hareketli şişkin yuva + balon birleşik silüet düzeltmesini kaydeder.
Önceki Source Asset Recovery `blocked` sonucu sonradan verilen bağlayıcı
uygulama kararıyla terminal blok olmaktan çıkarılmıştır. Tur 2 başlatılmadı.

### Karşılaştırma hedefi ve normalizasyon

- Kanonik Home kaynak:
  `C:\Users\kusay\source\NovaStore-Codex\android-customer-theme-20260722\evidence\tur1\normalized-bottom-source-crop.png`.
- Kanonik Hesabım kaynak:
  `C:\Users\kusay\source\NovaStore-Codex\android-customer-theme-20260722\evidence\tur1\tur1-correction3-account-source-normalized-crop-1080x250.png`.
- Son uygulama görüntüleri:
  `tur1-visual-rework-cradle-human-review-app-home-1080x250.png` ve
  `tur1-visual-rework-cradle-human-review-app-account-1080x250.png`.
- Emülatör viewport'u `1080 × 2400`, yoğunluk `420 dpi`, Android API `36`;
  karşılaştırma kırpması her iki durumda `1080 × 250` ve yeniden boyutlandırmasızdır.
- Tam durum panosu:
  `tur1-visual-rework-cradle-human-review-selected-states-source-app-2160x500.png`.
- Odaklı birleşik kontur kanıtı:
  `tur1-visual-rework-cradle-human-review-edge-overlay-combined-silhouettes-2040x880.png`.
  Cyan kaynak, magenta uygulama, beyaz çakışan kenardır; yalnız bu tanı dosyası
  nearest-neighbor ile 2× büyütülmüştür.

### Karşılaştırma geçmişi

1. İlk cradle denemesi fazla opak ve tam çevre stroke'lu olduğu için ikinci
   beyaz disk gibi okunuyordu; bloklu kaldı.
2. Dolgu ve stroke yumuşatılınca ayrı disk giderildi, ancak maskesiz edge
   overlay alt dış konturun kaynak kadar okunmadığını gösterdi; bloklu kaldı.
3. Alt yarıya ağırlık veren sütlü gradyan, yumuşak stroke ve ortak düşey merkez
   düzeltildi. Home'da lobe dış sınırı kaynakla aynı alt/yan bölgede birleşti;
   Hesabım'da düz bar alt sınırı seçili öğenin altında aşağı açılarak balonu
   ortak silüetin içinde tuttu.
4. Aynı `CustomerSelectedBottomCradle` Home ve Hesabım için kullanıldı. Cradle,
   balonla aynı `bubbleProgress`, scale ve alpha katmanındadır; ilk ve son öğede
   parent tarafından kırpılmaz.

### Son görsel ve davranış bulguları

- İstenen değişiklik alanında açık P0/P1/P2 kalmadı: doğal 1080 px'te yuva,
  barın devamı olarak okunuyor; ayrı ikinci balon, çift halo, dikdörtgen ripple,
  ani kontur sıçraması veya seçili öğe kırpılması gözlenmedi.
- `0/25/50/75/100` açıklamalı kanıt:
  `tur1-visual-rework-cradle-human-review-transition-4x-contact-sheet-5point-3240x500.png`.
- Normal hız kayıt:
  `tur1-visual-rework-cradle-human-review-transition-home-to-account-1x.mp4`.
- 4× tanısal kayıt 48 gerçek kare içerir; ölçülen geçiş `1483.378 ms`,
  beklenen `1400 ms`, uyarı `0`; bütün zorunlu örnekler farklı karelere düşer.
- Font/typography, ikon varlıkları, renk/cam tokenları, kaynak ürün zemini,
  görünür metin ve kabul edilmiş `110 ms exit + 240 ms enter` easing kodu bu
  düzeltmede değiştirilmedi. İstenen kapsam dışındaki eski provenance ve
  Haze `2.0.0-alpha03` release riski açık kayıtta kalır.

### Kanıt bütünlüğü

- Home kaynak/uygulama ayrı `1080 × 250`; side-by-side `2160 × 250`.
- Hesabım kaynak/uygulama ayrı `1080 × 250`; side-by-side `2160 × 250`.
- Maskesiz overlay, mutlak diff ve ısı haritası dosyaları:
  `tur1-visual-rework-cradle-human-review-manifest.json`.
- Statik manifest SHA-256:
  `d568b4decdf2d998fc84c24516ca4194532d73dddc8725e26aa366089dc7999a`.
- Beş nokta contact sheet SHA-256:
  `0963835ea111774cc26d4070360a7bcffc838c6f867301ebd3f3e4797263544b`.
- Normal hız MP4 SHA-256:
  `1017350023b57759cfb8a31880745db24a5bcef33a9715893e93e8ee17ca312d`.
- 4× tanısal MP4 SHA-256:
  `533527273fb3b8de146f6c43fa6b7b2c95218e32101421d6d524c1c8c1e61552`.

### Son teknik kapılar

- Debug unit `36/36`, failure/error/skipped `0/0/0` — PASS.
- Release unit `36/36`, failure/error/skipped `0/0/0` — PASS.
- Cihaz/Compose `6/6`, failure/error/skipped `0/0/0` — PASS.
- `assembleDebug`, `compileReleaseKotlin`,
  `bundleReleaseClassesToRuntimeJar`, `processReleaseManifest` — PASS.
- Release QA izolasyonu: 80 main/release kaynak dosyasında `0`; üç manifestte
  QA/cleartext `0`; üç uygulama JAR'ında 2.207 girdide QA sınıfı `0`; 112
  birleştirilmiş release resource içinde fixture/debug `0`; release BuildConfig
  içinde QA alanı `0` — PASS.
- Son cihaz logunda FATAL/ANR `0`; geçici depolama eşiği `null`, window /
  transition / animator ölçekleri `1.0 / 1.0 / 1.0` olarak geri yüklendi.
- `git diff --check` ve cached diff check PASS; staging alanı `0`.
- Git kökü güvenli repo, branch `codex/android-customer-theme-integration`,
  HEAD `cdcd579e185f3f78640cee94b59dabc5648bacb7`, tree
  `95f9681404b3482290ab9f2ae6aa9264fe7ed111`; dirty WIP korundu.

İç tasarım-QA bu dar `selected-item cradle` değişiklik setinde geçti. Bu sonuç
insan görsel kapısının yerine geçmez ve Tur 1 PASS ilanı değildir.

Tur 1 gate status: READY FOR HUMAN VISUAL REVIEW

final result: passed

## Son bağlayıcı painted-composite dikiş düzeltmesi — 2026-07-28

Bu bölüm, yukarıdaki tarihsel `final result: passed` satırının yerine geçen
güncel insan kapısı kaydıdır. Tur 1 insan görsel onayı PASS değildir. Tur 2
başlatılmadı. Dirty WIP korundu; stage, commit, push, PR, merge veya deploy
yapılmadı.

### Dar kapsamlı üretim düzeltmesi

- `CustomerBottomBarSurfaceShape`, 74 dp kurucu daire, ortak Cy/core merkezi,
  radyal simetri, tek birleşik binary geometri, tek koyu balon ve
  `110 ms exit + 240 ms enter` akışı değiştirilmedi.
- İç dikişin kesin kaynağı, birleşik shape içinde eski temel kapsülün üst
  sınırını `baseTop + 1 dp` konumunda ayrıca çizen yatay iç-parlaklık çizgisiydi.
  Bu çizgi 420 dpi kanonik cihazda yaklaşık üç fiziksel piksel kalınlığında
  Home şişkinliğine sağdan, Account şişkinliğine soldan giriyordu.
- Bağımsız yatay çizgi kaldırıldı. Alt cam gövde tek üretim compositor’ına
  taşındı: Haze/backdrop blur ve cam fill birleşik shape ile bir kez maskelenir;
  pus ve iki dış gölge aynı birleşik dış shape’i kullanır; stroke yalnız nihai
  dış kontura bir kez çizilir. Ayrı base-capsule stroke’u, selected-circle
  fill/stroke’u veya ikinci Haze/cam yüzeyi yoktur.
- Debug-only katman kanalları aynı üretim compositor’ını çağırır:
  çekirdek gizlenmiş final cam + blur + stroke, yalnız cam fill/blur ve yalnız
  nihai dış stroke. Debug fixture üretim yüzeyini yeniden çizmez.

### Painted-composite iç dikiş kapısı

Yeni fail-closed ölçüm, kenar sinyalini yalnız final boyanmış RGB
kompozitlerinden alır. Binary maskeler yalnız iç ROI’yi konumlandırır; ölçülen
kenar veya sayılan piksel sağlamaz.

- Luma: `L = 0.299R + 0.587G + 0.114B`
- `Gx = abs(L[y,x+1] - L[y,x-1])`
- `Gy = abs(L[y+1,x] - L[y-1,x])`
- Sayılan dikiş: `ROI AND Gy >= 8 AND Gy >= 1.25 * Gx`
- ROI:
  `erode4(selectedCircle) AND erode4(baseCapsule) AND NOT dilate3(selectedCore)
  AND inwardHalfPlane AND y in [T-1,T+9]`

Dedektörün boş bir kontrol olmadığını kanıtlayan önceki painted çıktı
kalibrasyonu:

- Önceki Home: `interiorSeamPixelCount = 21`, `y=53`, `x=189..209`.
- Önceki Account: `interiorSeamPixelCount = 21`, `y=53`, `x=877..897`.

Son üretim APK’sından alınan yeni sonuç:

- Tam final painted kompozit: Home `0`, Account `0`.
- Koyu core gizlenmiş final cam + blur + stroke: Home `0`, Account `0`.

Painted ölçüm ve bütün koordinatlar:
`tur1-painted-single-surface-v1-painted-surface-manifest.json`, SHA-256
`bce92e4d4e4e9cb7b7c1387bd58bb94ecabe7e58fbf9abc6271a3a6da1dcfa7e`.

### Yeni insan inceleme kanıtları

- Kaynak/uygulama Home ve Account:
  `tur1-painted-single-surface-v1-selected-states-source-app-2160x500.png`,
  SHA-256
  `cf252698883bc9967d1ac1ea7d8990f282144eccf80861207ef975fd79635c96`.
- Source/app 4× yakın planlar:
  `tur1-painted-single-surface-v1-source-app-home-closeup-nearest4x-2080x880.png`
  ve
  `tur1-painted-single-surface-v1-source-app-account-closeup-nearest4x-2080x880.png`.
- Dört painted kanal satırı — çekirdeksiz final, yalnız cam/blur, yalnız dış
  stroke ve tam final:
  `tur1-painted-single-surface-v1-painted-layer-stack-home-account-2160x1000.png`,
  SHA-256
  `3ac1b7364c42c5c687294d83f985cc44f81a3ba2074688b014339ed2165cb847`.
- İç/dış painted kenarlar, beyaz birleşik dış kontur konumlayıcısı, sarı yasak
  iç ROI ve sıfır kırmızı dikiş pikseli:
  `tur1-painted-single-surface-v1-painted-edge-map-home-account-2160x250.png`,
  SHA-256
  `2b0772bc1af20fd35c0af06650e6fbffcab3c6e6fc16d03ff546e43825e9632a`.
- Tam statik boyut/SHA/diff manifesti:
  `tur1-painted-single-surface-v1-manifest.json`, SHA-256
  `4cc0fd2ea764eff319e08e5f81f4b1466f28dd5c89b09720b0f449defb8e48d1`.

### Geçiş kanıtı

- Normal hızlı gerçek kayıt:
  `tur1-painted-single-surface-v1-transition-home-to-account-normal-1x.mp4`,
  1080 × 2400, SHA-256
  `4b96ecfec8fcbd4977149cf3b5d4464147573e766150ef3d0608f3cc5a8937ab`.
  Statik kanıt üreticisinin semantik doğrulaması tek `HOME -> ACCOUNT` geçişini
  ve terminal Account durumunu PASS verdi.
- 0/10/25/50/75/90/100 açıklamalı 4× contact sheet:
  `tur1-painted-single-surface-v1-transition-4x-contact-sheet-7point-3240x750.png`,
  SHA-256
  `064d8c5181eae567f72019c3e6f8e9ea43ddab252c0682ef4e21ce0fc22f3049`.
- Geçiş extractor’ı 40 gerçek video karesi kullandı, uyarı üretmedi ve P100
  alpha-mask kanıtında eski Home geometrisini sıfır gösterdi. 4× screenrecord
  VFR örneklemesinde otomatik algılanan wall-motion aralığı `1099.422 ms`,
  teorik `1400 ms` idi; kodun bağlayıcı mantıksal süresi değişmeden
  `110 + 240 = 350 ms` kaldı. Wall-time video örneklemesi tek başına hassas
  kronometre iddiası olarak kullanılmadı.
- Geçiş manifesti:
  `tur1-painted-single-surface-v1-transition-4x-manifest.json`, SHA-256
  `d13c42f731b98f7929b2c89458637c2627c87480e1279d3cffe8d942510ea32b`.

### Son teknik kapılar

- Debug unit: `41/41`, failure/error/skip `0` — PASS.
- Release unit: `41/41`, failure/error/skip `0` — PASS.
- Cihaz/Compose: `Medium_Phone_API_36.1`, Android 16, `11/11`,
  failure/error/skip `0` — PASS.
- `assembleDebug`, `compileReleaseKotlin`,
  `bundleReleaseClassesToRuntimeJar`, `processReleaseManifest` — PASS.
- Release QA izolasyonu: 89 main/release kaynak dosyasında `0`; üç release
  manifestinde `0`; üç release JAR / 2.217 girdide `0`; 112 merged release
  resource içinde ad/içerik bulgusu `0`; release BuildConfig içinde `0` — PASS.
- Cihaz test logcat’i 13.914 satırdır; FATAL `0`, uygulama ANR `0`, uygulama
  process-crash işareti `0`; `lastanr` içinde NovaStore eşleşmesi `0`.
- Teste özel depolama eşiği tekrar `null`; animator/window/transition ölçekleri
  tekrar `1.0`; emülatör kapatıldı.
- Son debug APK: 31.458.192 bayt, SHA-256
  `d0a9b389f2da7cae13cd7b4627f66736aa0c281f105b6b0085885f60538016d7`.

### Açık kalan, bu dar düzeltmede değiştirilmemiş sınırlar

- Kesin font asset’i bulunmadığı için `FONT-ASSET-BLOCKED` kaydı sürer.
- Kesin ikon vector/path asset’i bulunmadığı için `ICON-ASSET-BLOCKED` kaydı
  sürer.
- Cam altında gizli özgün ürün bitmap’i bulunmadığı için
  `SOURCE-BACKGROUND-BLOCKED` kaydı sürer.
- Haze `2.0.0-alpha03` ön sürüm bağımlılık riski sürer.

Bu tur kendiliğinden PASS ilan edilmedi. Güncel sonuç:

Tur 1 gate status: READY FOR HUMAN VISUAL REVIEW

Tur 1 human approval: NOT YET GRANTED

Tur 2 status: NOT STARTED

final result: READY FOR HUMAN VISUAL REVIEW

## Bağlayıcı insan görsel kapısı onayı — 2026-07-28

Kullanıcı, son `READY FOR HUMAN VISUAL REVIEW` teslimini bağlayıcı insan görsel
kapısı kararıyla onayladı. Önceki `CHANGES REQUESTED` kararı kapanmıştır.

Onaylanan Tur 1 sonucu:

- Home ve Hesabım durumlarında eski yatay temel-kapsül stroke’u seçili dairesel
  şişkinliğin içinden geçmez.
- Bar, ayrı şeffaf disk/lens gibi okunmaz; seçili bölgede yukarı, aşağı ve
  yanlara dairesel biçimde genişleyen tek birleşik dış Shape’tir.
- Cam, pus, blur, gölge ve stroke aynı birleşik dış Shape üzerinden boyanır.
- Painted final ve core-hidden final için `interiorSeamPixelCount = 0` sonucu
  kabul edilmiştir.
- Home ve Hesabım aynı 74 dp geometri ve ortak merkez formülünü kullanır.
- P100 sonunda eski Home geometrisi ve görsel izi sıfırlanır.
- `110 ms exit + 240 ms enter`, dinamik blur ve tek koyu balon korunur.

İnsan kapısında PASS verilen kanıtlar:

- Statik Home ve Hesabım
- Painted katman ayrıştırması
- Final edge-map
- Normal hızlı geçişin görsel davranışı
- Son teknik kapılar

Kayıtlı ve bu onayı geçersiz kılmayan sınırlar:

- VFR video hassas kronometre kanıtı değildir; zamanlama otomatik kapılarla
  korunur.
- Kesin font, ikon ve gizli özgün bitmap kaynakları bulunmamıştır.
- Haze `2.0.0-alpha03` riski açıktır.
- Dokunma hedefleri, TalkBack ve azaltılmış hareket bu görsel onayın kapsamında
  değildir.

Bu onay yalnız mevcut Tur 1 kapsamını kapatır. Tur 2 kendiliğinden
başlatılmamıştır; ayrı kullanıcı talimatı beklenmektedir. Dirty WIP korunmuştur;
stage, commit, push, PR, merge veya deploy yapılmamıştır.

Tur 1 gate status: PASS

Tur 1 human approval: GRANTED

Tur 2 status: NOT STARTED — AWAITING USER INSTRUCTION

final result: PASS

## Radyal birleşik bar geometrisi — son bağlayıcı düzeltme — 2026-07-26

Bu bölüm, yukarıdaki tarihsel sonuç işaretçisinin yerine geçen son Tur 1
kaydıdır. Tur 1 insan görsel kapısı PASS ilan edilmemiştir ve Tur 2
başlatılmamıştır.

### Üretim geometrisi

- Ayrı cradle/disk/lens yüzeyi yoktur. Bar gövdesi, seçili öğe şişkinliği,
  stroke, gölge ve blur tek `CustomerBottomBarSurfaceShape` maskesini kullanır.
- Kurucu selected-circle gerçek `74 dp` dairedir. Dairenin merkezi her durumda
  temel kapsülün `Cy=(T+B)/2` düşey merkezi ve koyu core ile aynı authoritative
  öğe merkezidir.
- Ham Boolean birleşimde görülen sert omuzları kaldırmak için kapsül–daire
  kesişiminde üst ve alta aynı `7 dp` smooth-union filleti uygulanır. Bu fillet
  ayrı bir yüzey değildir; tek dış konturun parçasıdır. Manifest, fillet
  bölgesindeki raw-Boolean farkını Home için 427, Account için 444 piksel olarak
  ayrıca ve saklamadan kaydeder.
- Home ve Account bar maskesinde özel düşey ofset yoktur. Account ikon/etiket/
  gösterge optik ofsetleri core merkezini veya birleşik maskeyi değiştirmez.
- `progress=0` tam düz kapsüldür. Eski merkez 110 ms exit sonunda maskeden
  tamamen çıkar; yeni merkez 240 ms enter ile aynı shape durumundan büyür.

### 1080 px ölçüm sonucu

- Temel kapsül: `T=49`, `B=202`, `Cy=125.5`.
- Home selected-circle: bbox `[56,28,250,222]`, `194×194`, `Cx=153.0`,
  `R=97.0`; yukarı/aşağı genişleme `21/20 px`.
- Account selected-circle: bbox `[836,28,1031,222]`, `195×194`, `Cx=933.5`,
  `R=97.25`; yukarı/aşağı genişleme `21.25/20.25 px`.
- Her iki durumda circle–core merkez farkı `x=0`, `y=0 px`.
- Her iki binary birleşik maske yalnız `0/255` değerlerinden, tek bağlı
  bileşenden ve sıfır delikten oluşur; ilk ve son öğede kırpılma yoktur.
- Home ve Account için kare bbox, radyal simetri ve circle–core merkez kapıları
  ayrı ayrı `<=1 px` ile PASS verdi.
- Gerçek Home→Account geçişinin p100 alpha maskesinde eski Home bölgesi, statik
  Account düz-bar baseline'ıyla `0` farklı binary piksele sahiptir.

### Son kanıt seti

- Statik manifest:
  `tur1-radial-symmetric-74dp-v1-manifest.json`, SHA-256
  `10e6f1a5b20716562a4ecc3d2d47d677f7952de8e800eefb430f0665c97a3dd7`.
- Kaynak yanında Home/Account:
  `tur1-radial-symmetric-74dp-v1-selected-states-source-app-2160x500.png`,
  SHA-256
  `161ffe584460850734866dcbb00b5099e4342adc1b4df40ad706e24214921403`.
- Ölçülendirilmiş Home ve Account maskeleri:
  `tur1-radial-symmetric-74dp-v1-radial-geometry-measured-*-1080x320.png`.
- Circle/core 4× yakın planları:
  `tur1-radial-symmetric-74dp-v1-radial-circle-core-closeup-*-nearest4x-1040x880.png`.
- İzole birleşik bar/core konturu:
  `tur1-radial-symmetric-74dp-v1-radial-contour-overlay-home-account-2160x250.png`,
  SHA-256
  `8ffb3e631692ca2e5a8c05f86d304da12bef6bb9483f56360b84f8fb59e3813c`.
- 0/10/25/50/75/90/100 contact sheet:
  `tur1-radial-symmetric-74dp-v1-transition-4x-contact-sheet-7point-3240x750.png`,
  SHA-256
  `31d7161558fdfac8e7242632c8ac73bb51d173352b45e8748c2fe29b75a368e4`.
- Transition manifest:
  `tur1-radial-symmetric-74dp-v1-transition-4x-manifest.json`, SHA-256
  `4f2f638c63440db7321b0612fbfbf5d08e1bf4855ecbc1a421eac40dcad787b9`.
- P100 eski Home alpha/final-composite 4× panosu:
  `tur1-radial-symmetric-74dp-v1-transition-4x-p100-home-old-region-alpha-composite-nearest4x-2080x880.png`,
  SHA-256
  `3a88e30c442096fa2939fb71ba014edb18889cd5861573a8fc08093aff5cb31f`.
- Normal hız 1080×2400 MP4:
  `tur1-radial-symmetric-74dp-v1-transition-home-to-account-normal-1x.mp4`,
  SHA-256
  `7f8853f3e737e2ea330a1481459d111712a8176909d88591d4f1d44d3eabd9e1`.
- 4× tanısal 1080×2400 MP4:
  `tur1-radial-capture-74dp-v2-transition-home-to-account-4x.mp4`, SHA-256
  `37d2e11c315774104cb159ec892e867d998b35141c75d2aa66537f97ee0546cc`.

Kanonik source/app PNG'ler, overlay, maskesiz mutlak diff ve maskesiz heatmap
otomatik resize edilmeden üretildi. Normal MP4 semantik doğrulaması sekiz
decoded frame üzerinde yalnız `HOME → ACCOUNT` kararlı durum sırasını ve terminal
Account durumunu doğruladı. 4× kayıtta 21 frame çözüldü; contact sheet'te
zorunlu yedi yüzde noktasında yinelenen kare yoktur.

### Son teknik kapılar

- Debug unit: `41/41`, failure/error/skipped `0` — PASS.
- Release unit: `41/41`, failure/error/skipped `0` — PASS.
- Cihaz/Compose: `Medium_Phone_API_36.1`, Android 16, `8/8`, failure/error/
  skipped `0` — PASS.
- `assembleDebug`, `compileReleaseKotlin`,
  `bundleReleaseClassesToRuntimeJar`, `processReleaseManifest` — PASS.
- Debug APK: 31.456.799 byte, SHA-256
  `8e38a4db72cc4b7ed9a0e202ec611bd810f507c8d0a2fad600e6fc47dfe0428d`.
- Release QA izolasyonu: 80 main/release kaynak dosyasında `0`; release
  source-map'te `0`; üç manifestte `0`; üç JAR / 2.213 girdide `0`; 112 merged
  release resource içinde `0`; release BuildConfig içinde `0` — PASS.
- Son çalışan uygulama sürecinin 42 log satırında FATAL/ANR `0`;
  `lastanr` paket eşleşmesi `0`.
- Geçici depolama eşiği yeniden `null`; animator/window/transition ölçekleri
  yeniden `1.0`.

Kesin font, kesin ikon vektörleri ve cam altında gizli özgün ürün bitmap'i
pakette bulunmadığı için önceki `FONT-ASSET-BLOCKED`, `ICON-ASSET-BLOCKED` ve
`SOURCE-BACKGROUND-BLOCKED` kayıtları dürüst kaynak sınırları olarak kalır.
Haze `2.0.0-alpha03` ön-sürüm bağımlılık riski de kapanmamıştır.

Tur 1 gate status: READY FOR HUMAN VISUAL REVIEW

Tur 1 human approval: NOT YET GRANTED

Tur 2 status: NOT STARTED

## Ayrı cradle yüzeyinin kaldırılması ve tek bar maskesi — 2026-07-26

Bu bölüm, `Selected-item cradle / birleşik silüet yeniden incelemesi` başlıklı
önceki uygulama notunun katman modelini ve 2026-07-25 tarihli güncel sonuç
işaretçisini geçersiz kılar. Tur 1 insan görsel kapısı PASS değildir ve Tur 2
başlatılmamıştır.

### Uygulanan bağlayıcı düzeltme

- Balon çevresindeki bağımsız dairesel cradle fill, stroke, cam disk/lens ve
  ikinci dış gölge tamamen kaldırıldı.
- Temel kapsül ile seçili öğenin yerel alt/yan şişkinliği artık aynı
  `Shape`/`Path` ve aynı alfa maskesidir. Birleşim yaklaşık iki fiziksel piksel
  örnekleme aralığıyla yumuşatılmış tek konturdur; matematiksel C1 eğri iddiası
  yapılmaz.
- Dış pus, gölge, dinamik Haze camı, tint, iç parlaklık ve dış stroke aynı
  birleşik şekli kullanır; birleşik dış sınırdan yalnız bir kez geçer.
- `progress=0` dalı tam temel `RoundRect` üretir. Eski merkez 110 ms exit
  sonunda bu düz geometriye döner; kalan circular alpha, stroke, blur, gölge
  veya halo katmanı yoktur.
- Bar geometrisi ve tek koyu balon aynı `displayedSelectedId` ile aynı
  `bubbleProgress` durumunu kullanır. Ana Sayfa ve Hesabım için aynı yeniden
  kullanılabilir sistem çalışır; ilk ve son öğe taşmaları ortak yüzey alanı
  içinde tutulur.
- Kabul edilmiş 110 ms exit + 240 ms enter, dinamik blur, ikon/font varlıkları
  ve genel yerleşim yeniden kurulmadı.

### Son kanıt seti

Nihai ve çakışmayan prefix:
`tur1-visual-rework-unified-smooth-verified-human-review`.

- Statik manifest 37 kayıt içerir; byte, gerçek piksel boyutu, renk modu ve
  SHA-256 bağımsız yeniden hesaplamada 0 hata verdi:
  `tur1-visual-rework-unified-smooth-verified-human-review-manifest.json`,
  SHA-256
  `107355c977ae931ae05d0aa21f65118d1cb5ce944278c01330ff0cb702df968e`.
- Geçiş manifesti 25 kayıt içerir; byte, gerçek piksel boyutu ve SHA-256
  bağımsız yeniden hesaplamada 0 hata verdi:
  `tur1-visual-rework-unified-smooth-verified-human-review-transition-4x-manifest.json`,
  SHA-256
  `e7c03260483336b4d8252131dffccfbfdc40eeca3169c19631db56305409f79e`.
- Ana Sayfa ve Hesabım kaynak/uygulama panoları ayrı 1080 × 250 PNG'lerden
  oluşan gerçek 2160 × 250 dosyalardır; SHA-256 değerleri sırasıyla
  `5853abeedc16f5227130f0d536a31b1f513f36f70c305b56f57649dd6ea10541`
  ve
  `ee41ef39656502f47c7e7c7b9d1fe51e2b974fe2d4fc84155f780cfc35b04dd6`.
- Birleşik seçili durum panosu 2160 × 500'dür; SHA-256
  `f71e6156f65e57c935324171c9f473cfed9517a4355d94038245435a13770f7c`.
- Bar-only Home ve Account RGBA alfa maskeleri 1080 × 250'dir. `alpha>0`,
  `alpha>127` ve `alpha=255` eşiklerinin tamamında her maske bir bağlı bileşen
  ve sıfır iç delik üretir. SHA-256 değerleri
  `06fe4b37515ba354a4263a982be7fc78dd0cdbeaf301e94edf09c9c34fcd49af`
  ve
  `c1b61711cd912a3c8fef8258bbc984823fe0b5ba38e4c5c0858904ad14a3f913`.
- Bar + şişkinlik + balon birleşik kontur overlay'i 2040 × 880'dir; SHA-256
  `8aa540c80ed6c68b0119134aa50caee12bd65fd52fc80b62248e03aeac29b4a8`.
- 0/10/25/50/75/90/100 panosu 3240 × 750'dir; SHA-256
  `20ee3f639e3aaa6a68e2ceaa37796c3fb9851806d04335332d5643db1a7ed37f`.
- Yüzde 100 Hesabım karesindeki eski Home bölgesinin exact 260 × 220 kırpımı
  `4b049179395eea689e22843495cc7a5bbe7cec65b11f30e9ade3e48d948875e8`;
  4× nearest-neighbor 1040 × 880 inceleme çıktısı
  `1559cce22a5bd2c051500cc0b1080074ab04aed45cf46626f26659d7752f5a4f`.
  Eski cradle/lens/halo hayaleti yoktur.
- Normal hız gerçek cihaz kaydı 1080 × 2400, 2.95 saniye ve 9 VFR karedir:
  `tur1-visual-rework-unified-smooth-verified-human-review-transition-home-to-account-1x.mp4`,
  SHA-256
  `a36f339000b74445ba77ae52ee4a7df0d1d8624e37ea281cf81d421612af4eea`.
  Bağımsız kare denetimi yerleşmiş Ana Sayfa ile başlayıp yalnız bir
  Ana Sayfa → Hesabım geçişinden sonra yerleşmiş Hesabım ile bittiğini; başka
  sekmeye ikinci geçiş veya ikinci koyu balon olmadığını doğruladı.
- 4× tanısal kayıt 1080 × 2400 ve 19 karedir; SHA-256
  `ce7cace9ab23100e476894a443d7b627d8e80e888a8ff9a6507de85a7a10ca3d`.
  Ölçülen 1489.167 ms, beklenen 1400 ms; manifest uyarısı yoktur.

### Son teknik kapılar

- Debug unit: 40/40; release unit: 40/40 — PASS.
- `Medium_Phone_API_36.1` cihaz/Compose: 8/8 — PASS.
- `assembleDebug`, `compileReleaseKotlin`,
  `bundleReleaseClassesToRuntimeJar`, `processReleaseManifest` — PASS.
- Release QA sızıntısı: 80 kaynak dosyasında 0; 3 release manifestinde 0;
  3 JAR / 2.213 girdide 0; 112 birleştirilmiş release resource içinde 0;
  release BuildConfig içinde 0 — PASS.
- Son cihaz oturumunun 3.526 log satırında FATAL 0 ve ANR 0.
- Geçici emulator depolama eşiği silinerek `null`, animasyon ölçekleri 1.0
  durumuna geri döndürüldü.

### Açık ve saklanmayan farklar

- Ana Sayfa dış konturunda yaklaşık 1–2 px düşey fark, uygulamada daha keskin
  stroke ve kaynakta daha yaygın alt pus görünür.
- Hesabım kaynak rasterının seçili öğeden uzaktaki genel bar yüksekliği/y
  normalizasyonu Home kaynağıyla aynı değildir; uygulama tek ortak geometriyi
  korur.
- Kesin kaynak fontu, kesin ikon vector/path'leri ve camın altında gizli
  ön-kompozit ürün bitmap'i pakette yoktur. İlgili
  `FONT-ASSET-BLOCKED`, `ICON-ASSET-BLOCKED` ve
  `SOURCE-BACKGROUND-BLOCKED` sınırlamaları sürer.
- Haze `2.0.0-alpha03` çalışan dinamik blur sağlar; ön sürüm bağımlılık riski
  release öncesinde ayrıca kabul edilmelidir.

İç tasarım-QA, bu son dar bar–şişkinlik–balon katman düzeltmesinde ve kanıt
bütünlüğünde geçmiştir. Bu sonuç insan görsel onayı değildir:

Tur 1 gate status: READY FOR HUMAN VISUAL REVIEW

final result: passed

## Human-review adayı — 2026-07-23

Bu bölüm, yukarıdaki Gate 3 terminal `ASSET-BLOCKED` sonucunun yerine geçen son
bağlayıcı uygulama kararına göre hazırlanmıştır. Özgün font/vector/gizli ürün
katmanı eksikliği provenance kaydı olarak korunur; Tur 1'i tek başına durduran
terminal blok değildir. Tur 2 başlatılmadı.

### Son görsel düzeltmeler

- Alt navigasyon gerçek Haze backdrop blur'u, sütlü tint'i, geniş beyaz alt
  pusunu ve tek balonlu sıralı geçişi korur.
- Font bake-off; Platform Sans, Poppins, Inter, Roboto, Lato ve Manrope
  adaylarıyla kilitli 1080 × 2400 / 420 dpi cihazda tamamlandı. Alt etiketler
  ve rozet yerel Inter 4.001; `Siparişlerim` başlığı yerel Lato 2.015
  SemiBold kullanır. Sistem fontuna sessiz fallback ve bitmap metin yoktur.
- Phosphor, Iconoir, Lucide, Tabler, Material Rounded ve Heroicons adayları
  karşılaştırıldı. Kategoriler Phosphor regular `circles-four`, Favoriler
  Iconoir regular `heart`, Sepetim Phosphor regular `handbag-simple`, Destek
  Phosphor light `chat-circle`, Hesabım Lucide `user`; seçili Hesabım Tabler
  filled `user` olarak kilitlendi.
- Hesabım seçili yüzeyi içerikten ayrılarak kendi kanonik geometri ve
  merkezine taşındı. Koyu balon bağlı-kutu ölçümü kaynakta
  `855,55–1014,218`, uygulamada `854,55–1013,218` oldu.
- Üst bar geri ikonunun görünür kutusu kaynak ve uygulamada
  `102,70–122,109`; başlık koyu piksel sayısı kaynak `2656`, uygulama `2593`
  oldu. Önceki Medium adayında uygulama değeri `2421` idi.
- Font/ikon sürüm, commit, lisans, viewBox, optik ölçek/ofset ve SHA-256
  kayıtları `docs/licenses/android-customer-theme-assets.md` dosyasındadır.

### Human-review kanıt seti

- Tam manifest:
  `C:\Users\kusay\source\NovaStore-Codex\android-customer-theme-20260722\evidence\tur1\tur1-visual-rework-human-review-manifest.json`
  — 29 dosya, SHA-256
  `545df99023ae422283f1244c1af311edb3b7138a2a8b752fd44d73887ceef3c6`.
- Okunabilir manifest:
  `tur1-visual-rework-human-review-manifest.md`, SHA-256
  `7e9bc5bfb230f5d1f922515469e8c0a879b2b2b66a60937a7f0885c291a28020`.
- Ana Sayfa side-by-side gerçek `2160 × 250`, overlay ve maskesiz diff/ısı
  haritası gerçek `1080 × 250` boyutundadır. Hesabım için aynı ayrı kaynak,
  uygulama, side-by-side, overlay ve maskesiz diff seti; üst bar için gerçek
  `1080 × 180` / `2160 × 180` seti üretildi.
- Ana Sayfa, Hesabım ve üst bar için doğal ölçekte 260 ms kaynak/uygulama
  hızlı-geçiş GIF'leri ayrıca üretildi. GIF yalnız insan hızlı incelemesidir;
  kanonik renk/piksel dosyaları ayrı PNG'lerdir.
- Isı haritası maskesizdir ve
  `D=max(abs(Rs-Ra),abs(Gs-Ga),abs(Bs-Ba))` formülünü kullanır. Renk
  aralıkları ve her dosyanın gerçek boyut/bayt/SHA-256 değeri manifesttedir.
- Ana Sayfa tanısal değerleri `MAE=9.568`, `RMSE=20.978`; üst bar
  `MAE=2.460`, `RMSE=10.547` oldu. Bunlar insan kabul skoru değildir.
- Görünür ortak ürün şeridi debug asset ile piksel eşittir. Render edilmiş
  görünür bölge medyan mutlak hata `1`, MAE `1.918` oldu.

### Seçili durum ve hareket kanıtı

- Ana Sayfa/Hesabım kaynak yanında uygulama panosu:
  `tur1-visual-rework-human-review-selected-states-source-app-2160x500.png`,
  SHA-256
  `7b80a633e0032ca98481fbfd77bbaf383077946e6dc227f50097e2800633f7c4`.
- Normal hız gerçek MP4:
  `tur1-visual-rework-human-review-transition-home-to-account-1x.mp4`,
  SHA-256
  `28bdf6f23a3260400f5e9762f4464baa95d46d856ac294569df7e605504704f1`.
- 4× tanısal gerçek MP4:
  `tur1-visual-rework-human-review-transition-home-to-account-4x-diagnostic.mp4`,
  SHA-256
  `ffed7de7d9d5bb893ad52dbc5887af47d40185295ce6045f6cfc671e9f458aae`.
- 4× kayıt ölçülen `1462.455 ms`, beklenen `1400 ms`; uyarı yoktur. Zorunlu
  `0/10/25/40/50/60/75/90/100%` noktaları farklı gerçek karelere düştü.
- Açıklamalı contact sheet `3240 × 1000`, SHA-256
  `5c28b54cff6426deb7ddf826eb70eca897d9e3545c96de0c19e0b1a6056ba7d4`.
  Karelerde kırpılma, dikdörtgen ripple, eşzamanlı çift balon, merkez sıçraması
  veya halo kopması gözlenmedi.

### Son teknik kapılar

- Debug unit: `36/36`, failure/error/skipped `0/0/0` — PASS.
- Release unit: `36/36`, failure/error/skipped `0/0/0` — PASS.
- Cihaz/Compose: `Medium_Phone_API_36.1 (Android 16)`, `6/6`,
  failure/error/skipped `0/0/0` — PASS.
- `assembleDebug`, `compileReleaseKotlin`,
  `bundleReleaseClassesToRuntimeJar`, `processReleaseManifest` — PASS.
- Release QA izolasyonu: release source-map `0`, üç manifestte QA/cleartext
  marker `0`, üç uygulama JAR'ında `2207` girdide QA sınıfı `0`, `138`
  release resource dosyasında fixture/debug sızıntısı `0`, release
  BuildConfig QA alanı `0` — PASS.
- Son cihaz akışında FATAL/ANR `0`.
- Geçici depolama eşiği `null`; animator/window/transition ölçekleri
  `1.0/1.0/1.0` değerlerine geri döndü.
- Release APK paketlenmedi: gerçek release signing bilgisi sağlanmadı ve bu
  tur gerçek imzalama/paketleme yetkisi vermiyor.

### İnsan incelemesine açık kalan farklar ve riskler

- Kesin özgün font/vector provenance'i teslim edilmedi. Açık lisanslı
  bake-off kazananları doğal 1080 px hedefe göre seçildi; büyütülmüş
  edge-overlay'de kaynak raster anti-aliasing ve kitaplık path ayrıntıları
  hâlâ görülebilir.
- Hesabım referansının ortak seçili olmayan ikonları ve arka planı Ana Sayfa
  kanoniğiyle çelişir. Bağlayıcı hiyerarşiye göre ortak bar Ana Sayfa'dan,
  yalnız seçili Hesabım balonu/ikonu Hesabım referansından alınmıştır. Bu
  nedenle maskesiz tam Hesabım diff'i yüksek çıkar; alan maskelenmemiştir.
- Cam altında kaynakta gizli kalan kompozit öncesi ürün pikselleri yoktur.
  Production bileşeni dinamik kalır; debug fixture yalnız kontrollü ortak
  zemini sağlar.
- Haze `2.0.0-alpha03` gerçek dinamik blur'u sağlar fakat ön sürüm bağımlılık
  riski release öncesinde açık kalır.
- Normal hız screenrecord değişken kare zamanlıdır; dokuz tanı noktasının
  tamamı için ayrı kare garantisini 4× tanı kaydı sağlar.

İnsan görsel kapısı otomatik test veya diff skoru ile kapatılmadı. Tur 1 sonucu:

final result: READY FOR HUMAN VISUAL REVIEW

## Son bağlayıcı insan kapısı sonrası yeniden çalışma — 2026-07-23

Bu bölüm önceki `P3`, “yalnız 1–4 px raster farkı” ve görsel olarak yeterli
olduğunu ima eden bütün tarihsel ifadelerin yerine geçer. Tur 1 insan görsel
kapısı PASS değildir. Tur 2 başlatılmadı.

### Uygulanan son düzeltmeler

- Üst ve alt ortak cam bileşenleri, gerçek ekran içeriğini dinamik olarak
  örnekleyen Haze `2.0.0-alpha03` backdrop blur ile yeniden kuruldu. Blur
  yarıçapı 40 dp; ılık/soğuk yatay tint, sütlü dikey ton, iç parlaklık, kenar,
  geniş alt pus ve düşük lacivert gölge ayrı katmanlardır. Kaynak ekran
  görüntüsü üretim arayüzü olarak yapıştırılmadı.
- Ölçülen üst bar yüksekliği 47.5 dp, radius 24 dp; alt cam taban yüksekliği
  58.5 dp, seçili çekirdek 58 dp ve halo 74 dp olarak merkezî tokenlara
  taşındı. Balon çekirdek kenarı kaynak ve uygulamada yaklaşık 76 px yarıçapta
  birleşir; ikinci sert çekirdek halkası kaldırıldı.
- Balon rengi `#4B6281 → #192F51 → #152A48`, gloss alpha `0.24`, halo alpha
  `0.32`, rim alpha `0.10` oldu.
- Geçişte iki ayrı seçili balon üreten eşzamanlı içerik değişimi kaldırıldı.
  Tek balon önce 110 ms içinde küçülüp saydamlaşır; seçili kimlik bundan sonra
  değiştirilir ve yeni balon 240 ms içinde büyür. Devir noktasında alpha
  sıfırdır.
- Alt ikonlar sabit Phosphor kaynak yollarına bağlandı; kaynak konturuna daha
  yakın light varyantlar ve öğe bazlı optik ölçek/konum kullanıldı. Sepet
  rozeti ölçülen sağ üst konumunda korundu.
- Debug-only sadakat fixture’ına kaynak Home kırpmasından değişmeden alınan,
  arayüz içermeyen 1080 × 46 px görünür ürün zemini eklendi. Bu asset kaynak
  görünür şeridiyle piksel eşittir.

### Son 1:1 kanıt seti

- Statik manifest:
  `C:\Users\kusay\source\NovaStore-Codex\android-customer-theme-20260722\evidence\tur1\tur1-visual-rework-gate3-manifest.json`
  — SHA-256
  `fbbcc3d012f431ec31268cb3b7a6686b7cce3fbf086177d4af7866b139f5401c`.
- Manifestte kaynak ve uygulama kırpmaları ayrı 1080 × 250 PNG; side-by-side
  2160 × 250; yüzde 50 overlay 1080 × 250; maskesiz mutlak fark ve maskesiz
  ısı haritası 1080 × 250 olarak kayıtlıdır. Bu kanonik dosyalarda resize
  yapılmadı. Yalnız açıkça `edge-overlay` adını taşıyan inceleme kırpımları
  büyütüldü.
- Ana karşılaştırma:
  `tur1-visual-rework-gate3-home-side-by-side-2160x250.png`.
- Yüzde 50 overlay:
  `tur1-visual-rework-gate3-home-overlay-50-1080x250.png`.
- Maskesiz mutlak fark:
  `tur1-visual-rework-gate3-home-absolute-diff-maskless-1080x250.png`.
- Maskesiz ısı haritası:
  `tur1-visual-rework-gate3-home-heatmap-maskless-1080x250.png`.
- Büyütülmüş balon, ikon/yazı, rozet ve üst bar edge-overlay dosyalarının
  gerçek ölçüleri ve SHA-256 değerleri aynı manifesttedir.
- Isı haritası formülü
  `D=max(abs(Rs-Ra),abs(Gs-Ga),abs(Bs-Ba))` biçimindedir. Aralıklar:
  `0` siyah; `1–15` lacivert; `16–31` mavi; `32–63` camgöbeği; `64–95`
  yeşil; `96–127` sarı; `128–191` turuncu; `192–255` kırmızı. Hiçbir piksel
  maskelenmedi.
- Tanısal tam diff `MAE=11.614`, `RMSE=24.324` verdi. Bu değer insan görsel
  onayı veya kabul skoru değildir.
- Görünür ortak zemin bölgesinde medyan mutlak hata `0`, render MAE `1.539`;
  debug asset kaynak görünür şeridiyle piksel eşittir.

### Seçili durum ve hareket kanıtı

- Kaynak yanında Ana Sayfa/Hesabım:
  `tur1-visual-rework-gate3-selected-states-source-app-2160x500.png`.
- Normal hızdaki MP4 1080 × 2400:
  `tur1-visual-rework-gate3-transition-home-to-account-1x.mp4`, SHA-256
  `bcd08293e210c957a29019a511c1bd97f76519855b9aec8489a0db18549843fa`.
- 4× tanısal MP4 1080 × 2400:
  `tur1-visual-rework-gate3-transition-home-to-account-4x-diagnostic.mp4`,
  SHA-256
  `390fe8ca954dcc7782a91d36ab6463b0d794abcfa6543168b240e048b90ca73b`.
- Gerçek MP4 karelerinden 0/10/25/40/50/60/75/90/100 yüzde noktaları ile
  görünmez 31.4286 yüzde devir noktası çıkarıldı. Her ham ve açıklamalı kare
  1080 × 250’dir; zaman damgası, merkez, mantıksal süre, faz, scale ve alpha
  değerleri manifestte bulunur:
  `tur1-visual-rework-gate3-transition-4x-manifest.json`, SHA-256
  `cd751cb0ab045e7111868cbdee13f6726e8863579c9bf8735a58418d2f54db8b`.
- Açıklamalı contact sheet 3240 × 1000:
  `tur1-visual-rework-gate3-transition-4x-contact-sheet-3240x1000.png`,
  SHA-256
  `373e5e86ca339f393874b3d720597e8bcefdffec7ebe96abdc013c292a0e5f2f`.
- Kareler kırpılma, dikdörtgen ripple, aynı anda iki balon, ani merkez sıçraması
  veya halo kopması göstermiyor.

### Son teknik kapılar

- Debug unit: 36 test, 0 failure — PASS.
- Release unit: 36 test, 0 failure — PASS.
- Cihaz/Compose: `Medium_Phone_API_36.1`, 6 test, 0 failure — PASS.
- `assembleDebug` — PASS.
- `compileReleaseKotlin`, `bundleReleaseClassesToRuntimeJar`,
  `processReleaseManifest` — PASS.
- Release QA izolasyonu: kaynak ve release source-map taramalarında 0 bulgu;
  üç manifestte QA/cleartext bulgusu 0; 3 JAR / 2.204 girdide QA sınıfı 0;
  128 release resource içinde fixture/debug sızıntısı 0; release BuildConfig
  içinde QA işareti 0 — PASS.
- Cihaz akışında FATAL/ANR 0; geçici depolama eşiği ve animasyon ölçeği tam
  önceki değerlerine döndürüldü.
- Compose UI çözümlemesi 1.11.2 olarak kaldı; Haze bağımlılığı
  2.0.0-alpha03’tür.
- `git diff --check` ve boş staging alanı final Git denetiminde yeniden
  doğrulanacaktır.

### Açık ve saklanmayan bloklar

- Paket içinde kesin kaynak font dosyası veya font metadata’sı yoktur.
  Platform Roboto/SansSerif en yakın savunulabilir seçimdir; etiketler ve
  `Siparişlerim` için kaynakla kesin aynı font ailesi iddia edilemez.
- Paket içinde altı ikon ve geri ikonu için kesin SVG/vector/path kaynağı
  yoktur. Sabit Phosphor yolları yakınlaştırılmıştır; overlay’de kalan çift
  kenarlar kesin kaynak asset olmadan sıfırlanamaz.
- Paket, kaynak camın altında gizlenen ön-kompozit ürün bitmap’ini içermez.
  Görünür şerit eşittir; camın örttüğü zeminde aynı gizli pikseller ve dolayısıyla
  piksel-eşit blur sonucu iddia edilemez.
- Kaynak Home ve Account rasterlarında ortak alt bar geometrisi kendi içinde
  tam tutarlı değildir; uygulama tek yeniden kullanılabilir ortak bileşeni
  korur.
- Haze `2.0.0-alpha03` ön sürümdür. Dinamik Android backdrop blur çalışır;
  ancak bağımlılık kararlılığı release öncesi ayrıca kabul edilmelidir.

Bu eksikler geniş cam, ikon veya tipografi farklarını `P3` ya da yalnız raster
farkı olarak kapatmaz. Teknik kapılar PASS olsa da Tur 1 insan görsel kapısı
açıkça PASS verilene kadar sonuç BLOCKED kalır.

## Gate 3 bağlayıcı kaynak-varlık kurtarma denetimi — 2026-07-23

Son insan görsel kapısı kararı üzerine bütün handoff ve ilişkili NovaStore
ZIP'leri, güvenli repo, salt okunur ana repo, referans PNG metadata'sı, fontlar,
vector/tasarım exportları ve ürün/dekoratif bitmap'ler yeniden tarandı.

Ayrıntılı ve hash'li denetim:
`C:\Users\kusay\source\NovaStore-Codex\android-customer-theme-20260722\evidence\tur1\tur1-gate3-source-asset-recovery-report.md`.

Bağlayıcı sonuçlar:

- `FONT-ASSET-BLOCKED`: Referansın kesin font ailesi veya dosyası yoktur.
- `ICON-ASSET-BLOCKED`: Kesin SVG/vector/path yoktur; referans Home ve Account
  rasterları ortak ikon konturlarında kendi içinde de aynı değildir.
- `SOURCE-BACKGROUND-BLOCKED`: Camın örttüğü valiz–espresso zemin piksellerini
  içeren ön-kompozit bitmap yoktur.

79 PNG'nin tamamı `gpt-image 2.0` / `OpenAI Media Service API` C2PA yaratım
kaydı taşır; hiçbirinde beyan edilmiş `c2pa.ingredient` yoktur. Teslim edilen
dosyalar katmansız son rasterlardır ve metadata font, ikon path'i veya gizli
ürün katmanı sağlamaz.

Kesin kaynak varlık bulunamadığı için kör statik mikro-ayar yapılmadı; geçiş
yapısı, ortak bileşenler ve önceki kanıtlar değiştirilmedi. Güncel test
dosyalarıyla Debug unit `36/36` ve Release unit `36/36` yeniden PASS verdi.
Haze `2.0.0-alpha03` ön sürüm riski açık kalır.

Bu kapıda insan görsel onayı istenmez. Tur 1 `BLOCKED` kalır ve Tur 2
başlatılmaz.

final result: blocked

## Güncel sonuç işaretçisi — 2026-07-26

Yukarıdaki Source Asset Recovery sonucu ve ayrı cradle/lens kullanan tarihsel
katman modeli, `Ayrı cradle yüzeyinin kaldırılması ve tek bar maskesi` bölümüyle
yerine geçirilmiştir. İç tasarım-QA son dar birleşik maske değişiklik setinde ve
kanıt bütünlüğünde geçmiştir; insan görsel kapısı ayrıca açık tutulur.

Tur 1 gate status: READY FOR HUMAN VISUAL REVIEW

final result: passed

## Nihai güncel kapı işaretçisi — 2026-07-28

Kullanıcı son `READY FOR HUMAN VISUAL REVIEW` teslimine bağlayıcı insan görsel
onayı verdi. Önceki `CHANGES REQUESTED` kararı kapanmıştır. Onayın ayrıntıları
bu belgedeki `Bağlayıcı insan görsel kapısı onayı — 2026-07-28` bölümündedir.
Tur 2 kendiliğinden başlatılmamıştır; ayrı kullanıcı talimatı beklenmektedir.

Tur 1 gate status: PASS

Tur 1 human approval: GRANTED

Tur 2 status: NOT STARTED — AWAITING USER INSTRUCTION

final result: PASS
