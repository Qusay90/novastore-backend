# NovaStore Storefront Commerce Pro

Bu klasörde çalışırken aşağıdaki kalıcı kurallar uygulanır.

## Kanonik koruma

- `canonical/NovaStore-Commerce-Pro.html` ve ondan çıkarılmış `src/App.jsx`
  bağlayıcı görsel referanstır; elle değiştirilmez.
- `src/catalog.js`, kanonik asset eşlemesi ve `src/canonical.css` exact-source
  sözleşmesinin parçasıdır. `canonical.css` yalnız `npm run sync:canonical` ile
  üretilir.
- Temel JSX yapısı, class adları, CSS, ikonlar ve 21 kanonik WebP yeniden
  tasarlanmaz veya eşdeğer görünen alternatiflerle değiştirilmez.
- Gerçek NovaStore bağlantıları yalnız `src/adapters/**` ve
  `src/integration/**` runtime sınırlarından yapılır.
- Eski yeniden yazılmış `IntegratedApp` görsel bileşenleri render yoluna geri
  alınmaz; sunum doğrudan kanonik `App.jsx` kaynağından üretilir.

## Zorunlu doğrulama kapıları

- Kanonik SHA-256 ve exact-source testleri her değişiklikten sonra geçmelidir.
- Kanonik, integration ve fixture buildleri kaynaklardan yeniden
  üretilebilmelidir.
- Paket testleri ve ilgili repository smoke testleri PASS olmadan teslim hazır
  sayılmaz.
- Desktop ve mobile browser QA; görünüm, etkileşim, console ve network
  kontrollerini kapsamalıdır. Görsel kabul ayrıca kullanıcı tarafından verilir.
- Generated preview, QA artifact, `node_modules`, `.vite`, log ve screenshot
  dosyaları kaynak commitine alınmaz.

## Yetki sınırları

- Production, uzak DB ve gerçek ödeme yalnız ayrı ve açık kullanıcı izniyle
  kullanılabilir.
- Commit, push ve deploy birbirinden bağımsız onay kapılarıdır; birinin onayı
  diğerine yetki vermez.
- İlgisiz dirty veya untracked dosyalar korunur ve açıkça kapsama alınmadıkça
  değiştirilmez ya da stage edilmez.
