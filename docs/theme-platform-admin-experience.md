# Wave 2 — Satıcı tema sunumu ve özgün Studio Pro

Bu çalışma geliştirme dalındaki gerçek Admin uygulamasına eklenmiştir. Üretim yayını, DNS/TLS veya Stocky teslimi yapılmaz.

## Tek özgün Studio, tek Admin menü girişi

- Mavi Admin ana menüsündeki **Studio Pro**, aynı gerçek sunucunun `/studio-pro/?surface=admin` girişini yeni sekmede açar. Özgün Studio bileşeni, menüsü ve tasarım araçları korunur; ikinci bir azaltılmış Studio kabuğu oluşturulmaz.
- Admin menüsünde ikinci bir **Satıcıya tema sun** girişi yoktur. Teklifler, profiller ve satıcı önizlemesi yalnız özgün Studio içindeki mevcut **Satıcıya tema sun** bölümündedir. Eski `#/themePlatform` adresi yalnız Studio Pro ana girişine yönlendiren açıklamalı kısayoldur; teklif UI kopyası veya ikinci menü oluşturmaz.
- Bağlantı mevcut Admin oturumuyla `/api/admin/theme-platform/workshop-launch` endpoint'inden doğrulanır. Endpoint canlı rol/oturum kontrolü için mevcut katalog okuma yetkisini kullanır, katalog içeriğini yanıtına koymaz. Yanıt kesin olarak `url:'/studio-pro/?surface=admin'`, `mode:'AUTHORING_WITH_SCOPED_OFFERS'`, `liveData:false`, `uiPreserved:true`, `sellerOffers:'SERVER_SCOPED'` biçimindedir. İstemci yalnız bu sabit göreli yolu kabul eder; harici adres, başka yol, ek token parametresi ve farklı mod reddedilir.
- Bağlantılar gerçek `target=_blank` / `rel=noopener noreferrer` anchor'dır. Localhost, eski 5538 oturumu veya bir token URL'ye sabitlenmez. Normal Commerce Pro kabuğu korunur. Yetki/bağlantı doğrulanamazsa giriş devre dışıdır.
- Özgün Studio'nun mevcut **Satıcıya tema sun** alanında `ThemePlatform embedded` kullanılır. Component CommercePro kabuğunu içermez; dış H1'i gizler ve mevcut başlığın altında bölüm olarak açılır. 8 adım, 9 hizmet sekmesi, deneyim profilleri, yetkili satıcı önizlemesi ve paket içe aktarma aynı backend işlevlerini kullanır.
- Tasarım araçlarının yerel belgeleri ile bu bölümün gerçek mağaza atamaları açık mod notuyla ayrılır. `liveData:false`, tüm teklif işlevlerinin sahte olduğu anlamına gelmez: yerel authoring otomatik canlı yayın değildir; seller-offers server scoped kayıtlardır. Fiyat, stok, domain ve komisyon otoritesi istemciye taşınmaz.

## Sunucuya bağlı işlevler

Sekiz adımlı sunum: mağaza → tema → gerçek görsel önizleme → profil → özellik kararları → satıcı görünümü → inceleme → teslime hazırlama.

Görsel önizleme bir `CONFIGURED` aday kaydı oluşturur; mağazaya tema atamaz. Son özellik seçimi yeni adayda saklanır. Sunucu görünümü yüklenmeden ilerleme kapalıdır. Kayıtlı adaylar mağazanın **Tema** sekmesinden yeniden açılabilir. Hazırlama sonucu yalnız gerçek `PREPARED_FOR_DELIVERY` yanıtında gösterilir; bunun Stocky teslim alındısı veya canlı yayın olmadığı belirtilir. Sunum oluşturma/hazırlama için gereken birleşik Admin izinleri sunucuda doğrulanır; 403 sonrasında yazma eylemleri devre dışı kalır.

Mağaza alanı dokuz sunucu bölümünü içerir: genel bakış, tema, editör özellikleri, yetkiler, sürümler, dağıtımlar, etkinlik, denetim ve ayarlar. Deneyim profili yönetimi profil kodu/adı, desteklenen yetenek seviyeleri, açık ret, özel izin ve gerekçeyi sunucuya kaydeder. Ortak profil değişikliğinin o profili kullanan mağazalara etkisi açıklanır.

Paket içe aktarma JSON dosyasını gerçek paket API'sine gönderir. Küçük resimler yetkili byte endpoint'inden Blob olarak gelir. Başarısız görsel sessizce saklanmaz: hata ve yeniden yükleme eylemi gösterilir. İstek iptali ve Object URL temizliği yapılır. Manifestin eski görseli güncel renderer kanıtı gibi sunulmaz.

## Taşıma ve güvenlik

`adminThemeClient.js`, mevcut `createAdminHttp` oturum doğrulamasını, aynı-origin isteğini, 401 durumunda girişe dönüşünü ve 403 hata davranışını kullanır. CAS revizyonu `If-Match` ile; mutasyon kimliği `Idempotency-Key` ile gönderilir. Sonucu belirsiz isteğin tekrarında aynı anahtar korunur. Başka mağaza seçildiğinde eski detay/denetim yanıtı yeni mağazanın görünümünü dolduramaz. İç içe `/studio-pro/` konumundan 401 dönüşü, yalnız mevcut `ADMIN_LOGIN_URL` sabitini origin köküne çözen dar bir location adaptörü kullanır. Global AdminHttp sabiti değiştirilmez; dış/alternatif giriş URL'si kabul edilmez. JSON ve blob taşıması aynı kurala bağlıdır. Tam atölye, açıkça verilen `fetchImpl` taşımasını backend paneline kapalı kapsamla geçirebilir; component kendi başına alternatif endpoint veya local fallback üretmez.

Studio açılışı iptal edilebilir; bölümden çıkarken istek, iframe, zamanlayıcı ve Blob URL temizliği yapılır. Satıcı yönetim galerisinden/mağaza alanından çıkma ve hizmet değiştirme gerçek iç çekirdek `getState().host.dirty` durumunu kontrol eder. Embedded bileşenin `onNavigationGuard` portu, tam Studio ana menüsüne aynı kontrolü sunar; parent bölüm değişimini bu porta bağlar. Sekiz adımlı sunum, profil ve hizmet politika alanları da anlamlı başlangıç/sunucu onaylı snapshot ile izlenir. Başarılı kayıtta yalnız ilgili form temizlenir; başarısız kayıtta değişiklik korunur. Bekleyen mutasyon varken kapanış/hizmet/profil/bölüm değişimi engellenir. Yeni sunum açılırken önceki form için onay alınır ve ayrı instance başlatılır. Kaydedilmemiş belge veya form için ayrılma onayı gerekir; sunucuda işlem sürüyorsa geçiş bekletilir. Tarayıcı yenileme/kapatma `beforeunload` ile korunur. Mevcut oturum sonlandırma akışı korunur. Yeni sekme bağlantısı mevcut Admin sekmesini kapatmaz.

Integrated Admin meta CSP yalnız gerekli aynı-origin iframe ve yerel Blob görsel iznini ekler; harici script/frame açılmaz. Preview Admin CSP aynı kalır. Normal backend sunumu harici JS'li Vite girişini kullanır; `/icons.js` ve favicon tam kendi build dizininden sunulur. Özgün Studio'nun global CSS'i Admin DOM'una ithal edilmez.

Admin kaynak parmak izi paylaşılan köprünün ve navigation-guard'ın tüm göreli import/re-export bağımlılıklarını, katalog adaptörünü, belge doğrulayıcılarını ve Studio dependency tanımlarını kapsar. Zaten kilitli Vite/Rollup AST ayrıştırıcısı yorum veya örnek metni import saymaz; eksik dosya, kapsam dışına çıkan veya hesaplanan modül yolu kimlik üretimini durdurur. Integrated-only dosyalar preview moduna karışmaz. Mevcut seal testleri kaldırılmaz.

## Temiz kurulum ve build sırası

Repo kökünde `npm ci`, ardından bağımsız kilit dosyalarından `npm ci --prefix studio-core`, `npm ci --prefix admin-commerce-pro` ve `npm ci --prefix seller-theme-web` çalıştırılır. Global veya başka checkout'un node_modules dizinine güvenilmez. Admin Vite React/React DOM dedupe kullanır; Studio dependency tanımları parmak izine dahildir.

Önce `npm run build --prefix studio-core`, sonra `npm run build --prefix seller-theme-web`; sonrasında Admin `npm run build:integrated --prefix admin-commerce-pro` ve `npm run build:live:integrated --prefix admin-commerce-pro` üretilir. Paylaşılan köprü değişirse Admin yeniden derlenmelidir. Tam Studio girişi `studio-core` içindeki özgün kaynak kopyasının ayrı build entry'sidir; orijinal bağımsız proje dosyaları değiştirilmez. Tam atölye build komutu/provenance kaydı çekirdek entegrasyon raporunda yer alır. Üretilen Admin frontend dosyaları yetkili Wave 2 kapsamındadır; müşteri storefront artefaktı değiştirilmez.

## Doğrulama ve sınırlar

Özgün galeri seçimi, yalnız authenticated catalog içindeki immutable `presentation` ve `sourceThemeId` ile, aynı kanalın gerçek sürüm UUID'sine eşlenir. Display name, thumbnail, paket slug'ı veya yerel demo kaydı çizim kimliği yerine geçmez. Eşleşme yoksa açık engel gösterilir; birden çok doğrulanmış sürüm varsa kullanıcı seçer. Başka tema otomatik seçilmez. Eski Classic/Pocket şema örnekleri ayrı uyarıyla sunuma kapalıdır; geçmiş teklif ve atama kayıtları salt okunur bilgi olarak korunur. Bu seçim kapısı bir canlı dağıtım veya görsel eşdeğerlik UAT sonucu değildir.

- `node tests/themePlatformAdminClientSmoke.mjs`: 12 kontrol PASS. Gerçek istemci/oturum yardımcısı, sahte HTTP yanıtları; testdouble imzalı backend oturum veya tarayıcı UAT kanıtı değildir. Tam atölyenin sabit aynı-origin sözleşmesi ve tehlikeli URL retleri dahildir.
- `node --test tests/themePlatformThemeSelectionSmoke.mjs`: 10 kontrol PASS. Gerçek eski/yeni paket ve build registry metadata'sı ile kaynak/kanal/UUID eşlemesi, yanlış adla eşleme reddi, Android uyuşmazlığı, belirsiz sürümde açık seçim ve geçmiş paket değişmezliği. Çizim davranışı ve görsel benzerlik kabulü ayrıca tarayıcıda doğrulanır.
- `node --test tests/themePlatformFingerprintClosureSmoke.mjs`: 5 kontrol PASS. Gerçek paylaşılan bağımlılık grafiği ve yalnız disposable geçici dizinde import/re-export/dynamic import, eksik dosya, yol dışına çıkma ve dolaylı kaynak değişiminde fingerprint yenilenmesi. Bu test tarayıcı davranışını ölçmez.
- `node tests/themePlatformStudioNavigationSmoke.mjs`: 9 kontrol PASS. Kirli/temiz/bekleyen/okunamayan kayıt durumu ve onay/ret kararları; onay kutusu testdouble'dır. Gerçek bölüm geçişi ayrıca doğrulanır.
- `node tests/themePlatformFormGuardSmoke.mjs`: 10 kontrol PASS; snapshot alan sırası, başarısız/başarılı kayıt, ret/kabul, bekleyen mutasyon ve bir formun diğerinin korumasını temizlememesi. Onay kutusu testdouble; tarayıcı kabulü ayrıca gerekir.
- `node tests/adminCommerceProHttpSmoke.mjs`: mevcut Admin HTTP/mapper kontrolleri PASS.
- Mevcut sahipli disposable HTTP server üzerinde normal ayrı Admin login → gerçek catalog → her iki JPEG endpoint → gerçek `createAdminThemeClient.blob` → Sharp decode doğrulandı: Classic 900×548 / 47.351 bayt, Pocket 390×844 / 59.771 bayt. İki yanıt da 200 image/jpeg; iki thumbnail de `stale:true`. Test oturumu mevcut logout endpoint'iyle kapatıldı. Bu sonuç tarayıcıdaki görsel yükleme kabulü değildir.
- Admin build ve final kaynak tazelik testleri ana görevdeki değişmez ağaç/son commit doğrulamasıyla birlikte raporlanır. Preview Admin raw-byte mührü eski HEAD ile yeni çalışma ağacını aynı kabul etmez.

**Tam özgün arayüzün açılması bütün yerel araçların server persistence kazanması anlamına gelmez.** Sunucu editöründe dönem paketleri gerçek orijinal 108 paket/130 raster ile ayrı kapsamlı upload-on-apply bağlanmıştır; zamanlayıcı/yayın yetkisi oluşturmaz. Özgün “yeni tema olarak kaydet” atölyesi, yerel kampanya zamanlayıcısı, eski yerel yayın geçmişi ve yedek/aktarım henüz aynı backend işlevleri olarak bağlanmadı. Sunucu paket listesi yalnız doğrulanmış içe aktarmaları gösterir; özgün atölye koleksiyonunun tamamının canlı atamaya hazır olduğu anlamına gelmez. Gerçek tarayıcı kabul kanıtı ana görev raporundadır.
