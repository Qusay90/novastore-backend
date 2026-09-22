# Wave 2: kanonik tema paketi ve yerel görsel deposu

Bu modüller tema sunumunu ve güvenli görsel baytlarını taşır. Ürün, fiyat, stok,
sepet, ödeme, satıcı yetkisi veya Stocky teslimi oluşturmaz. HTTP yetkilendirmesi,
idempotency ve veritabanı işlemi Theme Experience servisinde kalır.

## Paket sözleşmesi

`services/themePlatformPackageService.js` aşağıdaki tek JSON nesnesini kabul eder:

```js
{
  format: 'novastore-theme-package', packageVersion: 1,
  theme: { slug, name, version, industry },
  renderer: { id: 'novastore-studio-core', version: '1.0.0',
    // Yalnız schema 2, isteğe bağlı ve build registry ile tam eşleşir:
    presentation: { id: 'nova-classic', version: '1.0.0', digest }
  },
  schemaVersion: 1, // veya native Studio için 2
  supportedChannels: ['web', 'app'],
  requiredCapabilities: ['theme.banner', 'theme.product_grid'],
  components: [{ id, type }],
  assets: [{ key, mimeType, sha256, width, height, bytesBase64 }],
  thumbnails: [{ channel, assetKey, documentDigest }],
  document
}
```

Schema 1, Wave 1'in typed `tokens/components/assetIds` belgesidir. Schema 2,
`{schemaVersion:2, studio:{blocks,theme,menus,pages,app,chrome,commerce,templates,savedSections,design}}`
biçimindeki gerçek Studio belgesidir; paylaşılan Studio normalizer ile doğrulanır.
Schema 2 paketleri tek kanal taşır. Native görsel bağlantıları
`package:theme-assets/<paket-slug>/<dosya>.png` biçimindedir. Ham HTML/CSS/JS,
harici görsel URL'si veya demo runtime'ı paket olarak çalıştırılmaz.

- Renderer kimliği/sürümü tam eşleşir; bilinmeyen schema reddedilir.
- Bileşen kimlikleri ve türleri manifest ile belge arasında tam eşleşir.
- Yetkiler sunucunun Experience CATALOG anahtarlarıyla doğrulanır. Desteklenmeyen
  doğrudan yayın, zamanlama, özel CSS/HTML/JS ve AI builder gerekli yetki olamaz.
- En fazla 32 görsel, her biri 5 MiB ve toplam 16 MiB; en fazla 8192 px kenar ve
  16.777.216 piksel kabul edilir. JSON taşıma limiti ayrıca route katmanındadır.
- Görsel anahtarı paketin kendi slug alanında kalır; base64, MIME, uzantı, magic,
  SHA-256 ve gerçek decode boyutları birlikte doğrulanır.
- Global paket satıcıya ait ürün/kategori/koleksiyon veya yüklenen görsel UUID'si
  içeremez. Ticaret bağları daha sonra mağaza kapsamındaki override ile kurulur.
- Her kanal için bir küçük resim gerekir. Bildirilen belge özeti mevcut belge
  özetiyle farklıysa `stale:true` saklanır. Eşitlik tek başına görüntünün gerçekten
  o belgeden çekildiğini kanıtlamaz; görsel UAT ayrıca gerekir.

`validateThemePackage(input,{capabilityCodes})` baytlara yazmadan doğrular.
`prepareThemePackage(input,{themeVersionId,storage,capabilityCodes})` gerçek baytları
hazırlar ve `{document,documentDigest,manifest,packageDigest,assets,cleanup}` döndürür.
Kalıcı manifest base64 içermez; orijinal/yeniden kodlanmış SHA, boyut ve tür içerir.
`packageDigest`, belge özetini de içeren normalize manifestin SHA-256 değeridir.

Çağıran servis aynı transaction içinde immutable version/package/asset kayıtlarını,
operation, audit ve outbox'ı yazar. Rollback durumunda `await prepared.cleanup()`
çağırır. Başarılı commit sonrasında cleanup çağrılmaz.

## Gerçek bayt deposu

`createThemeAssetStorage({rootDir})` mutlak ve açıkça yapılandırılmış özel bir yerel
dizin gerektirir. Yapılandırma yoksa 503 döner; örtülü public veya geçici dizin
varsayımı yoktur. Dosya sistemi kökü ile `public`/`static` dizinleri reddedilir.

```js
const storage = createThemeAssetStorage({rootDir: configuredPrivateDirectory});
const handle = await storage.stageOwned({serviceId, assetId, bytes});
// QUARANTINED: henüz render edilemez.
const ready = await storage.promote(handle);
// READY ancak tam decode, yeniden kodlama, dosya sync ve yeniden okuma hashinden sonra.
const buffer = await storage.readOwned({serviceId, ...ready});
```

Paketler için `stagePackage({themeVersionId,assetId,bytes})` ve
`readPackage({themeVersionId,storageKey,digest})` kullanılır. `discard(handle)` yalnız
o adaptörün ürettiği opaque handle'a ait dosyaları temizler.

PNG/JPEG/WebP gerçek piksel decoder'ından (`sharp@0.35.4`) geçer. Yeni encoding EXIF,
ICC, XMP ve eklenmiş kuyruk baytlarını taşımaz. SVG, HTML, animasyonlu çok sayfalı
görsel, bozuk decode ve limit aşımı reddedilir. Bu bir antivirüs hizmeti değildir.
Dosyalar exclusive create ve file fsync ile yazılır, SHA-256 ile geri okunur;
veritabanı READY görünürlüğü bundan sonra verilir. Hazır dosyalar public dizine
mount edilmez. Sunucu yetkilendirmesinden sonra opaque key ile okunur.

Key içinde hizmet veya tema sürümü UUID'si vardır; farklı sahip ve depo türü 404
alır. Her okumada hash yeniden denetlenir. Dizin zincirindeki symlink/junction ve
dosyadaki symlink reddedilir. Depo, uygulamanın yazabildiği ve başka OS kullanıcıların
değiştiremediği bir ACL ile işletilmelidir. Ayrı makinelerde paylaşılan depolama,
yedekleme, disk kotası, crash sonrası orphan temizliği ve sağlayıcı entegrasyonu
bu yerel adaptörün ötesindeki işletim işleridir; production hazır diye raporlanmaz.

## Örneklerin kaynağı ve kapsamı

`theme-platform/packages/` içinde dört eski şema örneği ve bir yeni sunum-kimlikli sürüm bulunur:

| Paket | Schema/kanal | Kanonik eşleme |
|---|---|---|
| nova-classic-canonical | 1 / web + app | header, hero, category_grid, product_grid, footer |
| nova-pocket-canonical | 1 / web + app | header, hero, category_grid, product_grid, footer |
| nova-classic-studio-web | 2 / web | gerçek Studio hero + products blokları |
| nova-pocket-studio-app | 2 / app | gerçek Studio hero + products blokları |
| nova-classic-studio-web-v1_1 | 2 / web | sabit Classic renderer kimliği + hero/categories/products/story düzenleme alanları |

Bu eşlemeler özgün demo HTML/CSS dosyalarının tamamını içe aktarmış değildir.
Örnekler yerel mevcut Nova sanatını ve renk karakterini typed/native belgeye taşır;
eski demolar değiştirilmez. Sahte ürün/fiyat/stok yoktur. Native iki belge aynı
Studio çekirdeği tarafından okunur; kopyalanmış ayrı bir Seller editörü yoktur.

Kaynak görsellerin salt okunur kökü:
`C:/Users/kusay/Documents/Codex/2026-09-04/gp/outputs/novastore-studio-pro-expanded-20260915`.

| Kaynak (bu köke göre) | Orijinal SHA-256 |
|---|---|
| theme-library/assets/classic/hero-chair-front.png | d55688c75c71de20ec9570f10171af519117ed903f23f87d37d060b9ad96228d |
| theme-library/previews/15-nova-classic-tile.jpg | e12390aa5c16437b8407ed2b7f36d6c57df5bff72adea27b97ab9d3b3b5235cf |
| theme-library/previews/15-nova-classic-app.png (JPEG baytları) | 9e728b5b4ce8b282e3160e08008674b852248a91c0737ae2b43af2b67796fca9 |
| studio/public/media/android-home-hero.png | 8d861e3c37f095925dc3f4754bb6faed15e7a39f5f4dae175da425896fc5bf17 |
| studio/public/media/demos/nova-pocket-web.jpg | 6807f5e564815a289f3cb693755ab14d9acb3448862d63a3599522dee6b28d53 |
| studio/public/media/demos/nova-pocket-android.jpg | 7ac6b0b1c07a79adaae56a95d741420c5f8a345f3d3986a76d32b32d964d7d66 |

Classic app kaynağının uzantısı PNG olsa da gerçek baytları JPEG'dir; paket anahtarı
`.jpg` olarak doğrulanmış MIME'a göre verilir. Kaynak dosya değiştirilmez. Eski
önizlemeler sıfır belge özetiyle **bilerek stale** olarak işaretlidir; güncel native
Studio render kanıtı sayılmazlar.

## Çalıştırılmış sınırlı test

`node --test tests/themePlatformPackageStorageSmoke.js`: 40 PASS, 0 FAIL, 0 SKIP.
Gerçek Sharp decoder ve yerel disk kullanılır; depolama mock'u yoktur. PNG/JPEG/WebP,
bozuk dosya, metadata/kuyruk temizliği, boyut/kota, sahiplik, symlink/junction,
dosya bozulması, geri alma, manifest olumsuzlukları ve beş gerçek paket dosyası test edilir.
Desteklenen 5 MiB base64 sınırı ayrıca çalıştırılır; tekrarlı regexp gruplarının
oluşturabildiği JavaScript stack taşmasına karşı bounded/canonical decoder kullanılır.
Bu sonuç tarayıcı, native Android, gerçek servis veya production UAT değildir.

`node tests/themePlatformExperiencePostgresSmoke.js --execute-disposable-db`:
49 PASS, 0 FAIL, 0 SKIP; PostgreSQL 16.15 ve 42 migration. Gerçek Admin/Seller
oturumları ve HTTP üzerinden paket içe aktarma, gerçek görsel okuma, yabancı
sahip reddi, profil/yetki değişimi, CAS, eski isteklerin yeniden gönderimi, teklif
hazırlama, kota ve transaction hata enjeksiyonu denendi. Outbox/audit hatasında
kalıcı dosyaların da geri alındığı doğrulandı. Geçici container kaldırıldı;
harici HTTP denemesi 0, kimlik bilgisi log kontrolü PASS. Test helper yalnız
kendisine ait disposable veritabanını kabul eder; gerçek veritabanı URL'si almaz.

Profil kaydetme, hizmet deneyimini değiştirme ve teklif hazırlama denetimleri,
gerçek önceki/sonraki profil kararlarını `editor_policy` altında taşır. Bu alan
yalnız doğrulanmış capability state/ALLOW-DENY map'leri ve profil revision'ını
kabul eder. Önceden kaydedilmiş konfigürasyon yoksa before_state null kalır.
Taslak metni, genel overrides, kimlik bilgileri veya görsel baytları bu alana
giremez. W39 bunu gerçek audit satırları ve reddedilen geçersiz state ile sınar.

W40, sonradan eklenen bir hero bloğunu metin bloğuna çevirerek eski blok yetkisini
atlama girişimini gerçek Seller HTTP çağrısıyla sınar. Düzeltme öncesi 200 dönen
istek, kampanya yetkisi READ_ONLY olduğunda artık 403 alır. W41, gelişmiş bölüm
yetkisi açık olsa bile READ_ONLY üst bölüm, alt bölüm ve gezinmenin gizlenmesini
reddeder. Her iki durumda da taslak sürümü ve geçmiş satırları değişmez. Aynı
alan farkı sınıflandırıcısı hem Studio arayüzü hem sunucu tarafından kullanılır.

W42, özgün Ramazan paketinin gerçek raster baytlarını yetkili Admin HTTP üzerinden
yükler, SHA değerini kontrol eder, kendi mağazasının gerçek canonical ürününü
seçerek native taslağı kaydeder ve yeniden okur. W43 başka mağazanın görseli
ve ürünü için 404 sonucunu, taslak/geçmişin değişmemesini doğrular. W44,
`/workshop-launch` için yetkili Admin 200, anonim 401, kapsamı olmayan Admin
403, Seller kimliğiyle Admin yolu 401, Seller yolu 404 ve URL query enjeksiyonu
400 sonuçlarını gerçek HTTP üzerinden sınar. Sabit giriş
`/studio-pro/?surface=admin` döner; bu, 27 yerel demo temasının sunucuya
otomatik bağlandığı anlamına gelmez. Yerel atölye kaynakları ile dört canonical
sunucu örnek paketi farklı teslim kapsamlarıdır.

## Classic sunum kimliği ve yükseltme

`theme-platform/presentations.json` yalnız incelenmiş yerel kaynakları seçen build
kaydıdır. `renderer.presentation` alanı tam olarak `{id,version,digest}` içerir.
Classic için `nova-classic/1.0.0` yalnız web kanalını destekler. Digest; özgün
`theme.js`, `theme.css`, `core.js`, `core.css`, `support-contract.js` ve
`theme-host-bridge.js` SHA kayıtlarını kapsar. Paket kendi HTML/JS/CSS kodunu,
URL'sini veya dosya yolunu veremez. Bilinmeyen kimlik, sürüm, digest ve kanal
reddedilir. Bu metadata, özgün kaynakların tüm davranışlarıyla canlı hazır olduğu
iddiası değildir; renderer eşlemesi için ayrı tarayıcı kabulü gerekir.

`node scripts/buildThemePlatformClassicPackage.js`, sabit kaynak hashlerini
doğrulayıp yeni `1.1.0-wave2` paketini ve `classic-package-provenance.json`
kaydını üretir. Eski `1.0.0-wave2` dosyası ve içe aktarılmış veritabanı sürümleri
değişmez. Yeni immutable sürüm içe aktarılıp açıkça yeni teklife bağlanır.
Klasik temel görünüm #83b735 vurgu, beyaz üst/alt alan ve Arial kullanır.
`classic-hero` varsayılan başlık/açıklama/görseli boştur; renderer bunları
seçili canonical ürünün fiyatıyla aynı kayıttan alır. Eski demo sandalye
görselinin başka gerçek ürünün fiyatıyla birleşmesi engellenir.

Catalog `presentation` ve `sourceThemeId` alanlarını sunucu kaydından türetir.
Editor context ve canonical commerce context aynı immutable descriptor'ı taşır.
Taslak, browser veya sorgu parametresi bu kimliği değiştiremez. W45 gerçek
içe aktarma/yeni sürüm ve DB immutability'yi; W46 atanmış taslak, aday önizleme,
doğrulanmış test-domain context ve başarısız kimlik override'larını doğrular.
Domain testi yalnız disposable veritabanı kaydıdır, gerçek DNS/canlı yayın değildir.

### Classic düzenleme sınırı

Özgün Classic sunumu genel amaçlı Studio renderer'ı değildir. Sunucu,
`presentation-edit-policy.json` listesini kullanarak gerçekten işlenen alanları
kabul eder: eşlenen renkler, dört yazı ailesi, köşe ölçüsü, logo/arama görünürlüğü,
üst ve alt alan renkleri, görünürlük, doğrulanmış görsel öğe ayarları ve dört sabit
bölümün başlık/açıklamaları. Hero ve hikâye görseli değiştirilebilir. Hero düğmesi
yalnız açıkça düzenlenmiş kampanya içeriği varken desteklenen hedefe bağlanır;
varsayılan ürün slaytının fiyatı ve ürün bağlantısı canonical veriye aittir.

Yeni bölüm ekleme, silme/sıralama, dönem paketi uygulama, ürün kaynağı seçimi,
menüler, özel sayfalar ve eşlenmemiş diğer alanlar bu Classic sürümünde
`THEME_PRESENTATION_EDIT_UNSUPPORTED` (400) ile reddedilir. İşlenmeyen ayarların
başarılı kaydedilmiş gibi gösterilmesi önlenir. Aynı kontrol paket içe aktarımı,
teklif/bağlam, taslak kaydı, önizleme ve yayın isteğinin yetkili akışlarında
uygulanır. Özgün yerel atölye ve descriptor içermeyen eski şema örneklerinin
sözleşmesi değiştirilmez; onların kampanya testi Classic render kabulü değildir.

`node --test tests/themePlatformPresentationEditGuardSmoke.js`: 30 PASS.
W47 gerçek HTTP'de altı desteklenmeyen değişikliğin 400 verdiğini, taslak/geçmiş,
audit ve outbox'ın değişmediğini, desteklenen metnin ise yeni sürüm olarak
kaydedildiğini doğrular. Bu testler tarayıcı görsel kabulünün yerine geçmez.

Serbest `design.elements` içerik override'ları yalnız `logoImage.imageUrl/alt`
için kabul edilir. Ürün adı, fiyat, kategori, değerlendirme veya keşfedilmiş
metin/görsel kimliği üzerinden canonical içerik değiştirilemez. Alternatif
`visual` değiştirmesi yalnız logo ve `item:*:icon` hedeflerinde kullanılabilir;
ürün ya da bölüm fotoğrafını simgeyle değiştiren yol da kapalıdır. Bölüm içeriği
yalnız yukarıdaki typed blok alanlarından düzenlenir. Doğrulanmış stil, simge
animasyonu ve dekorasyon modeli korunur. W48, native şeması geçerli üç sahte
görsel override isteğinin gerçek HTTP'de 400 verdiğini ve hiçbir kayıt/geçmiş,
audit veya outbox değişikliği bırakmadığını doğrular.

Decoder davranışı için resmi belgeler:
[Sharp constructor](https://sharp.pixelplumbing.com/api-constructor/) ve
[Sharp output](https://sharp.pixelplumbing.com/api-output/).
