# NovaStore Dış Servisler ve Entegrasyonlar

Son doğrulama: 3 Eylül 2026

Bu dosya NovaStore'un kullandığı, kullanıma hazır tuttuğu veya canlıya çıkmadan önce bağlaması gereken dış servislerin tek kaynak listesidir. Anahtar, parola, token ve bağlantı şifresi gibi gizli değerler bu dosyaya **asla yazılmaz**.

## Durum Tanımları

- **Aktif:** Kodda kullanılıyor ve yerel/canlı yapılandırmada bağlantısı doğrulandı.
- **Hazır:** Entegrasyon kodu var; fakat seçili sağlayıcı veya gerekli production ayarları eksik.
- **Planlanan:** İş ihtiyacı var; gerçek servis entegrasyonu henüz yapılmadı.
- **Yardımcı:** Uygulamanın temel işlevi değil, arayüz veya geliştirme/yayın sürecini destekliyor.

## Aktif ve Gerekli Servisler

| Servis | Durum | Ne işe yarıyor? | Projedeki kullanım / kanıt | Gerekli yapılandırma |
|---|---|---|---|---|
| **Render** | Aktif | Node.js backend'i ve web arayüzünü internette yayınlıyor. | `www.novastore.tr`, `novastore-backend.onrender.com` adresine yönleniyor. `server.js` tek Express/Socket.IO servisi olarak çalışıyor. | Render servis ayarları, build/start komutu, production ortam değişkenleri ve özel alan adı |
| **Supabase (PostgreSQL)** | Aktif | Kullanıcı, ürün, sepet, sipariş, ödeme, bildirim, analitik ve diğer kalıcı verileri tutuyor. | `config/db.js`, `models/`, `DATABASE_URL`; mevcut bağlantı Supabase Session Pooler kullanıyor. | `DATABASE_URL`, `DB_SSL`; gerektiğinde `SUPABASE_USE_POOLER`, `SUPABASE_REGION`, `SUPABASE_POOLER_HOST`, `SUPABASE_PROJECT_REF`, `DB_*` |
| **Cloudinary** | Aktif | Ürün ve yorum görsellerini/videolarını yükler, saklar, dönüştürür, önizleme üretir ve siler. Android tarafı Cloudinary görsel URL'lerini optimize eder. | `config/cloudinary.js`, `routes/productRoutes.js`, `routes/reviewRoutes.js`, `controllers/productController.js`, `app/.../ImageUrls.kt` | `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` |
| **Resend** | Aktif | Şifremi unuttum akışında parola sıfırlama e-postası gönderiyor. | `controllers/authController.js`, `config/appConfig.js`, `resend` npm paketi | `RESEND_API_KEY`, doğrulanmış gönderen alan adı ve tercihen `MAIL_FROM` |
| **Google Gemini API** | Hazır / sunucu yapılandırması bekliyor | NovaBot'un doğal dil yanıtlarını ve araç çağrılarını üretebilen sunucu sağlayıcısıdır. | `services/aiProviderService.js`, `services/novabotCapabilityService.js`; bu kabul worktree'sinde provider değişkenleri ayarlı değildir ve capability ileri modları kapalı bildirir. | `AI_PROVIDER=gemini`, `GEMINI_API_KEY`; isteğe bağlı `GEMINI_MODEL`, `GEMINI_BASE_URL`, `AI_PROVIDER_FALLBACK_ENABLED`, `AI_PROVIDER_FALLBACKS` |
| **Natro DNS** | Aktif | `novastore.tr` alan adının DNS kayıtlarını yönetiyor; alan adını Render yayınına bağlıyor. | Canlı NS kayıtları `ns1.natrohost.com` ve `ns2.natrohost.com`; `www` kaydı Render'a gidiyor. | Natro panelindeki A/CNAME/MX/TXT kayıtları; SSL ve e-posta doğrulama kayıtları |
| **GitHub** | Aktif | Kaynak kodun uzak deposunu ve sürüm geçmişini tutuyor. | Git remote: `github.com/Qusay90/novastore-backend.git` | Depo erişimi, branch koruması; otomatik yayın isteniyorsa Render deploy bağlantısı |

## Ödeme Servisleri

İlk satış kart akışının tek seçilebilir sağlayıcısı **PayTR**'dır. `PAYMENT_PROVIDER=paytr` açıkça verilmelidir; eksik veya farklı değer fail-closed olur. Kart ödemesinde mock sağlayıcı ve otomatik sağlayıcı fallback'i yoktur. Kodda kalan iyzico callback uyumluluğu, bu çalışma hattında iyzico'yu seçilebilir veya mock ilk-satış sağlayıcısı yapmaz.

| Servis | Durum | Ne işe yarıyor? | Mevcut gerçek durum | Dış kapılar |
|---|---|---|---|---|
| **PayTR** | Kod tabanı review-ready; dış aktivasyon bekliyor | iFrame token isteği, yalnız izinli PayTR güvenli ödeme URL'si, callback hash doğrulaması ve idempotent ödeme/sipariş finalizasyonu | Sağlayıcı allowlist'i yalnız `paytr` kabul eder. Token hedefi kodda `https://www.paytr.com/odeme/api/get-token` olarak sabittir; `PAYTR_BASE_URL` yalnız `https://www.paytr.com` olabilir. `.env.example` gerçek değer içermez ve `PAYTR_LIVE_REQUESTS_ALLOWED=false` ile dış isteği kapalı tutar. Bu hazırlıkta gerçek credential kullanılmadı, PayTR'a istek atılmadı, ödeme veya sipariş oluşturulmadı. | Şirket sahibi tarafından doğrulanmış kimlik ve public alan adları; hukuk/şirket onaylı sürümlü checkout metinleri; PayTR başvuru ve merchant onayı; secret yöneticisinden sağlanan `PAYTR_MERCHANT_ID`, `PAYTR_MERCHANT_KEY`, `PAYTR_MERCHANT_SALT`; gerçek HTTPS callback/success/fail URL'leri; ayrıca yetkilendirilmiş provider UAT, operasyon/mutabakat ve production açılış onayı |
| **iyzico** | İlk satış için seçilemez / legacy callback sınırı | Eski iyzico ödeme kayıtlarından gelebilecek imzalı callback uyumluluğu | Aktif sağlayıcı allowlist'inde yoktur; yeni kart ödemesi başlatamaz ve PayTR için fallback değildir. Mock ödeme sağlayıcısı olarak kullanılmaz. | Bu hattın dışındadır. Ayrı bir sağlayıcı değişikliği ancak yeni kapsam, sözleşme, güvenlik incelemesi ve UAT ile ele alınabilir. |

Kart başlatma kapısı yalnız provider ayarına bakmaz. Gerçek `BusinessIdentity` alanları ile `NOVASTORE_LEGAL_PRE_INFORMATION_*` ve `NOVASTORE_LEGAL_DISTANCE_SALE_*` onay/sürüm/metin kapıları da eksiksiz olmalıdır. Checkout, istemciden serbest metin teslimat adresi değil, oturum sahibine ait gerçek `addressId` alır; backend adresi kullanıcı sahipliğiyle yeniden yükler.

PayTR `user_ip` değeri ham `X-Forwarded-For` başlığından okunmaz. Express yalnız `NOVASTORE_TRUST_PROXY_HOPS` ile açıkça güvenilen hop sayısını kullanır; doğrudan/yerel çalışmada değer `0` kalır. Render üzerinde gerçek proxy zinciri yayın ortamında gözlemlenip doğrulanmadan bu değer tahmin edilmez ve PayTR capability kapısı açılmaz. Production'da `PAYTR_TEST_MODE=true` de müşteri ödemesini fail-closed tutar.

PayTR success/fail dönüş sayfaları ödeme otoritesi değildir. Yalnız doğrulanmış provider callback'i ödeme durumunu ve buna bağlı stok, kupon, sipariş, satıcı projeksiyonu ve bildirim yan etkilerini kesinleştirir. Sonuç ekranı sahiplik kontrollü status API'sinden kaydı okur.

NovaStore içindeki satıcı sipariş projeksiyonu, ledger ve settlement kayıtları bir PayTR Pazaryeri para-transferi değildir. Alt üye işyeri modeli, komisyon/split, bloke/valör, satıcı doğrulaması, iade/chargeback etkisi ve gerçek satıcı transferi PayTR ile imzalanacak dış sağlayıcı sözleşmesinin ve ayrıca yetkilendirilecek entegrasyonun konusudur. Bu değerler veya kurallar koddan türetilmez ve belgelerde uydurulmaz.

İlk güvenli staging ile sağlayıcı UAT ortamı aynı kapı değildir. Staging güvenlik politikası dış ödeme yan etkilerini ve provider credential'larını kapalı tutar. Secret ve ödeme çağrısı yalnız ayrıca yetkilendirilmiş provider UAT/production çalışma zamanında açılabilir. Production havale/EFT de gerçek hesap, mutabakat ve yetkili onay olmadan fail-closed kalır.

## Yapay Zekâ Alternatifleri

| Servis | Durum | Ne işe yarıyor? | Not |
|---|---|---|---|
| **OpenAI API** | Hazır / seçili ve yapılandırılmış değil | Gemini yerine veya mode-capable yedek olarak NovaBot yanıtları ve araç çağrılarını üretebilir. | Kod kaynağı vardır; bu kabul worktree'sinde anahtar veya fallback yapılandırması ayarlı değildir. Kullanmak için sunucu secret yöneticisinde `OPENAI_API_KEY` ve açık provider zinciri gerekir. |
| **Ollama** | Hazır / yerel seçenek | NovaBot'u harici ücretli AI API'si olmadan yerel modelle çalıştırabilir. | `services/aiProviderService.js` içinde destek var. Ayrı bir Ollama sunucusu, `OLLAMA_BASE_URL` ve model gerekir; production için zorunlu değildir. |
| **Mock AI** | Aktif güvenlik ağı | Canlı AI sağlayıcısı hata verdiğinde NovaBot'un tamamen çökmesini engelleyen deterministik yanıt sağlar. | Dış uygulama değildir; proje içi fallback'tir. Varsayılan fallback zincirinde kullanılır. |

## Planlanan Fakat Henüz Gerçek Bağlantısı Olmayan Servisler

| İhtiyaç / aday servis | Durum | Ne işe yarayacak? | Mevcut gerçek durum |
|---|---|---|---|
| **Yurtiçi Kargo API** | Planlanan | Gönderi oluşturma, gerçek takip numarası, barkod/etiket, ETA ve iade kargosu | Şu anda yalnızca yerel takip numarası oluşturuluyor ve Yurtiçi Kargo takip sayfasına URL hazırlanıyor; gerçek kargo API çağrısı yok. |
| **e-Fatura / e-Arşiv sağlayıcısı** | Planlanan | Yasal satış, iptal ve iade belgelerini üretip saklayacak | `services/invoiceService.js` yalnızca veritabanına `provider='mock'` faturası yazıyor. Sağlayıcı henüz seçilmemiş. |
| **SMS doğrulama sağlayıcısı** | Planlanan / opsiyonel | Telefon doğrulama kodu ve güvenlik bildirimleri gönderecek | `controllers/authController.js` ilgili endpointlerde `503` döndürüyor; Twilio vb. gerçek bir servis bağlı değil. |
| **E-posta doğrulama / 2FA altyapısı** | Planlanan / opsiyonel | Hesap e-postasını doğrulayacak ve ikinci faktör sunacak | Endpointler mevcut fakat henüz yapılandırılmadığı için `503` döndürüyor. Resend e-posta kanalı ileride yeniden kullanılabilir. |
| **Google Play Console** | Planlanan / yayın için gerekli | İmzalı Android App Bundle'ı yayınlamak, test kanallarını ve mağaza sürümlerini yönetmek | Android uygulaması ve release signing yapısı mevcut; projede Play Console bağlantısı veya yayın kanıtı yok. Android'i mağazada yayınlamak için gereklidir. |
| **Google Merchant Center** | Planlanan / opsiyonel | Ürün feed'ini Google ürün listelemeleri ve reklamları için kullanacak | Backend'de `/merchant/feed.xml` üretiliyor ve go-live kontrol listesinde feed doğrulaması var; hesap bağlantısı kaynak koddan doğrulanmadı. |

## Yardımcı Dış Kaynaklar

Bunlar hesap/secret gerektiren ana backend uygulamaları değildir; web arayüzü doğrudan internetten dosya veya içerik çeker.

| Kaynak | Kullanım | Zorunluluk |
|---|---|---|
| **Google Fonts** (`fonts.googleapis.com`) | Web sayfalarında Inter yazı tipi | Yardımcı; erişilemezse sistem fontuna düşecek şekilde tasarlanmalı |
| **jsDelivr / Chart.js** | Admin panelindeki grafikler | Yalnızca admin grafikleri için gerekli |
| **Cloudflare cdnjs / Font Awesome** | Footer sosyal medya ikonları | Yardımcı |
| **Socket.IO CDN** | `profile.html` içindeki gerçek zamanlı bildirim istemcisi | Aynı projede `/socket.io/socket.io.js` de kullanılıyor; dış CDN bağımlılığı kaldırılabilir |
| **Placeholder.com ve Icons8** | Eksik ürün görselleri ve bazı bildirim ikonları | Yardımcı; üretimde yerel fallback asset tercih edilmeli |
| **Instagram ve YouTube** | NovaStore sosyal medya bağlantıları | Entegrasyon değil, dış bağlantı |

## Dış Servis Sayılmayanlar

- **Socket.IO sunucusu:** Ayrı bir SaaS değildir; `server.js` içinde kendi Render backend'imizde çalışır.
- **PostgreSQL `pg`, Retrofit, OkHttp, Coil, Room, JWT, bcrypt:** Harici uygulama değil, projede kullanılan yazılım kütüphaneleridir.
- **Cloudflare:** Şu an Render yayın zincirinde edge/CDN katmanı olarak görülüyor; projede ayrıca yönetilen bağımsız bir Cloudflare hesabı veya API entegrasyonu kanıtlanmadı.
- **Nodemailer:** `package.json` içinde kurulu fakat uygulama kodunda kullanılmıyor. Aktif servis değildir; e-posta gönderimi Resend ile yapılıyor.
- **Railway:** Önceki staging planlarında adaydı; mevcut kaynak kodda veya canlı DNS zincirinde aktif Railway bağlantısı doğrulanmadı.

## Tespit Edilen Yapılandırma Eksikleri

1. `.env.example` dosyasında kodun kullandığı `RESEND_API_KEY` değişkeni bulunmuyor; yeni ortam kurulumunda unutulabilir.
2. PayTR merchant onayı, gerçek secret'lar, HTTPS callback/success/fail URL'leri ve yetkili provider UAT kanıtı dışarıdan sağlanmadı; `PAYTR_LIVE_REQUESTS_ALLOWED=false` olarak kalmalıdır.
3. NovaBot ileri modları için bu kabul worktree'sinde Gemini/OpenAI sağlayıcı yapılandırması yoktur; temel `friendly` sohbet deterministik fallback ile çalışır, diğer modlar capability tarafından kapalı bildirilir.
4. Kargo ve fatura akışları production sağlayıcısına bağlı değil.
5. Hosting sağlayıcısına ait gizli değişkenlerin yalnızca panelde tutulduğu doğrulanmalı; hiçbir secret Git'e eklenmemeli.

## Bu Dosyayı Güncel Tutma Kuralı

Yeni bir dış servis eklendiğinde veya mevcut servis kaldırıldığında, **aynı değişiklik kapsamında bu dosya da güncellenmelidir**.

Her yeni kayıt şu bilgileri içermelidir:

1. Servisin adı.
2. Durumu: Aktif, Hazır, Planlanan veya Yardımcı.
3. NovaStore'da ne işe yaradığı.
4. Entegrasyonun bulunduğu dosyalar veya endpointler.
5. Gerekli ortam değişkenlerinin **yalnızca adları**.
6. Canlıya geçiş veya kaldırma koşulları.
7. Son doğrulama tarihinin güncellenmesi.

Kontrol noktaları:

- Yeni npm/Gradle bağımlılığı dış API kullanıyor mu?
- Yeni bir `process.env.*`, API base URL, webhook, callback veya CDN adresi eklendi mi?
- `.env.example` yalnızca boş örneklerle güncel mi?
- Secret, token, parola veya gerçek bağlantı URL'si yanlışlıkla belgeye/Git'e girdi mi?
- Mock/planlanan servis yanlışlıkla “Aktif” olarak mı gösteriliyor?
