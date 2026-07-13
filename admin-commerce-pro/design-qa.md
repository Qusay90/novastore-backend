# NovaStore Admin Commerce Pro — Design QA

Tarih: 2026-07-13

Hedef: `reference/admin-hybrid-target.png` (1487 × 1058)

Entegrasyon çıktısı: `../frontend/admin-commerce-pro.html`

## Bu turda tamamlanan kontroller

- Hedef görsel ile bulut tarayıcıdan alınan 1363 × 936 entegrasyon görüntüsü aynı karşılaştırma yüzeyinde incelendi. Görüntü düzeltme öncesi build'e aitti ve hedefle aynı viewport değildi; bu nedenle yalnızca sorun keşfi için kullanıldı.
- Düzeltme öncesi etkileşimli kontrolde şu hatalar yeniden üretildi:
  - Komut paleti arama alanı yerine kapatma düğmesine odaklanıyordu.
  - Kaydedilmiş görünüm seçimi tablo filtresini uygulamıyordu.
  - Sipariş dışı sekmeye geçildiğinde eski sipariş denetçisi açık kalıyordu.
  - `Teslim Edildi` siparişte “sonraki aşama” işlemi durumu geriye alıyordu.
  - Satıcı karar modalında Escape, modal ile birlikte bağlamsal menüyü de kapatıyor ve odağı kaybediyordu.
- Kaynakta bu davranışlar düzeltildi; ayrıca mobil başlık kontrolleri sarılabilir hale getirildi, bağlamsal navigasyon görünür durum değiştirecek şekilde bağlandı, filtre/görünüm durumu eşitlendi, toast/statusbar çakışması giderildi ve erişilebilir ad/aktif durumlar tamamlandı.
- Hedefteki iki serili gelir eğrisi, elde çizilmiş bir asset yerine yerel veriyle çalışan `uPlot` grafiği olarak uygulandı.
- Vite `6.4.3` sürümüne yükseltildi ve npm audit sonucu `0 vulnerabilities` oldu.

## Deterministik doğrulama

- `npm run build:integrated`: geçti; bağımsız HTML üretildi.
- `node tests/adminCommerceProPreviewSmoke.js`: geçti; üretilen HTML kaynak fingerprint'i ile eşleşiyor.
- Dokuz mevcut admin/startup smoke testi: geçti.
- `npm ls --depth=0`: geçti.
- `npm audit --omit=dev --package-lock-only`: geçti, 0 açık.
- `frontend/admin.html` inline JavaScript parse kontrolü: geçti.
- `git diff --check`: geçti.
- Kaynak ve build statik kontrollerinde uygulama kaynaklı `fetch`, XHR, WebSocket, EventSource, ödeme sağlayıcısı veya `/api` çağrısı yok; aktif haricî script, stylesheet ve görsel kaynağı bulunmuyor.
- Mevcut NovaStore PNG favicon'u gömülü veri URI'si olarak taşınıyor; bağımsız çıktıda ayrı dosya veya ağ isteği gerektirmiyor.

## Açık browser kanıtı blokeri

Bulut tarayıcı `http://terminal.local:4173/admin-commerce-pro.html` adresini açtı, ancak rebuild ve cache-busting URL sonrasında da düzeltme öncesi paketi sunmaya devam etti. Temiz `4271` portu tarayıcı katmanında `ERR_BLOCKED_BY_CLIENT` ile reddedildi. Bu yüzden güncel build için aşağıdaki zorunlu kanıtlar üretilemedi:

1. 1487 × 1058 hedef/uygulama eş-viewport ve eş-state görsel karşılaştırması.
2. 390 × 844 mobil menü, scrim, Escape, başlık kontrolleri ve denetçi alt aksiyon kontrolü.
3. Düzeltme sonrası ana navigasyon, görünüm/filtre, modal odağı, sipariş aşaması ve satıcı karar akışı.
4. Düzeltme sonrası console ve runtime network kaydı.

Düzeltme öncesi sayfada uygulamaya ait console error/warning görülmedi; tek hata tarayıcı eklentisinin `chrome-extension://...` metadata mesajıydı. Bu sonuç güncel build için devralınmamıştır.

`/admin-commerce-pro.html`, mevcut `admin.html` gibi statik bir istemci kabuğudur. Önizleme yalnızca gömülü mock veri içerir ve hiçbir API/ödeme/auth entegrasyonu yapmaz; bu nedenle mevcut mimariye göre yeni bir gerçek-veri sızıntısı olarak değerlendirilmedi. `noindex` erişim kontrolü değildir ve ileride gerçek entegrasyon eklenirse route ayrıca korunmalıdır.

Draft PR, yukarıdaki güncel desktop/mobile browser kanıtları tamamlanmadan merge-ready kabul edilmemelidir.

final result: blocked
