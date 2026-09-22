# Özgün Studio Pro çalışma alanı

`/studio-pro/?surface=admin`, yeni sekmede özgün Studio Pro'nun bütün çalışma alanını açar. Tek `src/sandbox/studio/Studio.jsx` bileşeni kullanılır. Aynı bileşen `/theme-studio/` altındaki sunucuya bağlı mağaza modülünde de kullanılır; ikinci editör kopyası yoktur.

Özgün 16 bölüm, yerel taslak/yayın geçmişi, mağaza çalışma kopyaları, sayfa ve görsel düzenleyiciler, sezon paketleri, kampanya takvimi, web ve mevcut Android arayüzü önizlemeleri korunur. Mevcut **Satıcıya tema sun** bölümü açık bileşen portuyla `ThemePlatform embedded` içeriğini alır: gerçek sunum hazırlığı, deneyim profilleri, mağaza politikaları ve salt okunur satıcı önizlemesi burada çalışır. CommercePro kabuğu Studio'nun içine alınmaz.

Yerel tasarım araçlarının örnek katalogları ve tarayıcıdaki kayıtları sunucuya bağlı satıcı kayıtlarından ayrıdır. “Denemede yayımla” yerel kaydı değiştirir; canlı mağaza yayını, Stocky teslimi, uygulama dağıtımı veya ödeme oluşturmaz. Android görünümü özgün uygulama bileşenlerinin tarayıcıdaki önizlemesidir; APK değildir. Sunucuya bağlı bölümün ürünleri, fiyatları, rolleri ve kapsamları gerçek yetkili API'den gelir.

## Giriş ve taşıma sınırı

`src/workshop-entry.jsx`, Studio veya teklif ekranını yüklemeden önce gerçek Admin istemcisiyle `/api/admin/theme-platform/workshop-launch` çağrısını tamamlar. Beklenen descriptor tam olarak `/studio-pro/?surface=admin`, `AUTHORING_WITH_SCOPED_OFFERS`, `liveData:false`, `uiPreserved:true` ve `sellerOffers:SERVER_SCOPED` değerlerini taşımalıdır. Başarısız/eksik cevapta Studio açılmaz. Android önizleme girişi de aynı kontrolü yapar.

Özgün yerel runtime'ın global fetch/XHR engeli korunur. Yalnız yetkili AdminHttp ve görsel istemcisine özel olarak verilen taşıma fonksiyonu gerçek sunucuya erişir. Token URL'ye veya önizleme belgesine yazılmaz. Yönetici oturumunun sona ermesi kökteki mevcut giriş sayfasına yönlendirir. Her yazma işleminin asıl yetki, politika, revizyon ve kapsam denetimi sunucudadır.

Sunucuya bağlı form/editörün kirli veya bekleyen durumu Studio bölümlerinden ayrılma korumasına bağlanır. Aktif kayıt bitmeden geçiş engellenir; kaydedilmemiş değişiklikten ayrılmadan önce onay istenir. İlgili form ve iframe, `beforeunload` korumasını da kurar. Yerel Studio taslaklarının özgün otomatik tarayıcı kaydı sürer.

## Kaynak kapanışı ve köken

Korunan referans `novastore-studio-pro-expanded-20260915/studio` yalnız okunmuştur. `main.jsx` ve `android-entry.tsx` statik import kapanışı 205 dosya / 4.894.218 bayttır. Bunların 100'ü ortak core içinde zaten vardı; 105 eksik dosya / 2.847.368 bayt eklendi. Mevcut ortak dosyalar orijinal kopyayla ezilmedi.

- `workshop-source-provenance.json`: 105 kaynak, 306 özgün public dosyası (135.544.290 bayt), 2.946 browser vendor dosyası (21.494.544 bayt). Hash'ler ithal edilen referans baytlarının köken kaydıdır; `main.jsx` giriş portu gibi belgelenmiş uyarlamalar bu başlangıç hash'inden farklıdır.
- `workshop-gallery-provenance.json`: 609 dosya / 303.925.335 bayt. Özgün galeri 27 tasarımın 54 web/uygulama HTML şablonunu içerir. Bu 54 şablon çözümlenmiş bayt hash'iyle, 144 gömülü görsel orijinal bayt hash'iyle korunur.
- Galerinin 186.827.134 baytlık tek dosyasındaki veri ayrı JSON ve görsellere çıkarıldı. CSS, DOM ve düzenleme kodu yeniden tasarlanmadı. En büyük yeni dosya 32.749.611 bayttır. 737 MB'lık oluşturulmuş standalone kopyaları çoğaltılmadı; önizleme aynı özgün şablonları kullanır.
- Galeri önizlemesi normal yerel görsel URL'lerini kullanır; HTML indirme işlemi görselleri ihtiyaç anında özgün data URI'lerine geri gömer. Tek HTML dışa aktarımının taşınabilirliği korunur. Eksik görsel veya yükleme hatasında kısmi HTML üretilmez.
- `.gitattributes`, public/vendor baytlarını işletim sistemi satır sonu dönüşümünden korur. Beş özgün Lato/Inter fontu ve vendor lisansları kopyada mevcuttur.

Referanstan tekrar ithal etmeye yarayan iki `scripts/import-workshop-*.mjs` dosyası bakım araçlarıdır; normal derleme bunları çalıştırmaz. Özellikle kaynak ithalatı mevcut ortak dosyaları ezmez. Galeri ithalatı özgün kaynak dosyasından yeniden üretilmelidir; geçerli kullanıcı verisi taşımaz.

## Derleme ve statik yollar

```sh
npm --prefix studio-core ci --ignore-scripts
npm --prefix studio-core run build
npm --prefix studio-core run build:workshop
npm --prefix studio-core test
```

`dist/` yalnız `/theme-studio/` modülünü; `dist-workshop/` bütün `/studio-pro/` ağacını üretir. Derleme çıktıları ve node_modules Git'e eklenmez. Server statik mount'u ayrı sunucu özelliği bayrağına bağlıdır.

Workshop Vite yapılandırması React'i tekilleştirir. Yalnız bilinen özgün statik kökler `/studio-pro/` altına taşınır: medya, kalibrasyon/fontlar, tema galerisi, orijinal public assets, Android HTML girişi ve `/?...` bağlantıları. API ve `/theme-studio/` yolları değiştirilmez. Public HTML/JS/JSON için aynı sınırlı işlem derleme sonunda yapılır; `dist-workshop/static-relocation.json`, kaynak/çıktı hash'lerini içerir. Sunucuda global `/media` aliası gerekmez.

Özgün `/media/` yedekleri, yalnız workshop derlemesinin görsel normalleştirmesinde eşdeğer `/studio-pro/media/` yoluna taşınır. Normal modül ve sunucu native belge şeması genişletilmez. Harici URL ve traversal denetimleri korunur.

## Doğrulama kapsamı

Son yerel çalışma: **52/52 core Node testi geçti** (25 session/lifecycle, 8 kampanya, 11 çalışma önizlemesi, 8 workshop). İç döngüler ayrı test sayılmaz. Workshop testleri gerçek descriptor gerekliliğini, reddedilen/malformed cevabı, statik yol sınırını, eski yedeğin medya dönüşümünü, 54 şablon hash'ini, 144 görselin geri oluşturulmasını, font baytlarını, dışa aktarım hata durumunu ve galeri script sözdizimini kapsar.

Normal modül ve tam workshop derlemeleri geçti. Büyük özgün runtime parçaları için Vite boyut uyarısı vardır. Font URL'leri build-time çözülmedi uyarısı verse de beş dosya çıktıdaki aynı statik yolda bulunur. Bunlar performans/derleyici uyarılarıdır; tarayıcıda tüm özelliklerin kabul edildiği anlamına gelmez.

Gerçek HTTP/PostgreSQL testleri, tarayıcı kabulü ve nihai CI sonucu üst görevde ayrı raporlanır. Bu belge tam görsel/işlevsel parite sertifikası, üretim dağıtımı veya canlı kullanım onayı değildir.
