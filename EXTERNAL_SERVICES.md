# NovaStore Dış Servisler ve Entegrasyonlar

Son doğrulama: 29 Haziran 2026

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
| **Google Gemini API** | Aktif | NovaBot'un doğal dil yanıtlarını ve araç çağrılarını üreten birincil yapay zekâ sağlayıcısı. | `services/aiProviderService.js`; mevcut yerel yapılandırmada `AI_PROVIDER=gemini` | `AI_PROVIDER=gemini`, `GEMINI_API_KEY`, isteğe bağlı `GEMINI_MODEL` ve `GEMINI_BASE_URL` |
| **Natro DNS** | Aktif | `novastore.tr` alan adının DNS kayıtlarını yönetiyor; alan adını Render yayınına bağlıyor. | Canlı NS kayıtları `ns1.natrohost.com` ve `ns2.natrohost.com`; `www` kaydı Render'a gidiyor. | Natro panelindeki A/CNAME/MX/TXT kayıtları; SSL ve e-posta doğrulama kayıtları |
| **GitHub** | Aktif | Kaynak kodun uzak deposunu ve sürüm geçmişini tutuyor. | Git remote: `github.com/Qusay90/novastore-backend.git` | Depo erişimi, branch koruması; otomatik yayın isteniyorsa Render deploy bağlantısı |

## Ödeme Servisleri

Ödeme tarafında production için **tek bir ana sağlayıcı seçilmelidir**. PayTR ve iyzico'nun ikisini birden zorunlu kabul etmiyoruz.

| Servis | Durum | Ne işe yarıyor? | Mevcut gerçek durum | Canlı kullanım için gerekenler |
|---|---|---|---|---|
| **iyzico** | Hazır / mock | Kart ödeme başlatma, 3D yönlendirme, webhook ile ödeme sonucunu kesinleştirme | `PAYMENT_PROVIDER` tanımlı değilse kod varsayılan olarak iyzico'yu seçiyor; ancak başlatma akışı şu anda gerçek iyzico API çağrısı yapmıyor ve mock davranıyor. Production secret yapılandırması doğrulanmadı. | iyzico production hesabı ve sözleşmesi, gerçek API istemcisi/kimlik bilgileri, callback-webhook ayarları, imza doğrulaması ve uçtan uca UAT |
| **PayTR** | Hazır / staging adayı | iFrame ödeme token'ı, güvenli ödeme sayfası, callback hash doğrulaması ve başarılı/başarısız ödeme finalizasyonu | Backend, web ve Android kodu mevcut; gerekli merchant değişkenleri yerel `.env` içinde tanımlı değil. | `PAYMENT_PROVIDER=paytr`, `PAYTR_MERCHANT_ID`, `PAYTR_MERCHANT_KEY`, `PAYTR_MERCHANT_SALT`, callback/success/fail URL'leri, test sonrası production modu |

Ödeme finalizasyonunda stok, kupon kullanımı, bildirim, sipariş durumu, sahiplik kontrolü ve idempotency davranışları korunmalıdır. Kart sağlayıcısı değiştirilirken bu yan etkiler istemciye taşınmamalıdır.

## Yapay Zekâ Alternatifleri

| Servis | Durum | Ne işe yarıyor? | Not |
|---|---|---|---|
| **OpenAI API** | Hazır / seçili değil | Gemini yerine veya yedek olarak NovaBot yanıtları ve araç çağrıları üretebilir. | Kod ve yerel API anahtarı mevcut; fakat mevcut fallback listesi tanımlı olmadığından otomatik yedek olarak kullanılmıyor. Kullanmak için `AI_PROVIDER=openai` veya `AI_PROVIDER_FALLBACKS=openai,mock` gerekir. |
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
2. `PAYMENT_PROVIDER` yerel `.env` içinde tanımlı değil; kod bu nedenle iyzico varsayılanına düşüyor fakat iyzico akışı gerçek production entegrasyonu değil.
3. OpenAI anahtarı mevcut olsa da `AI_PROVIDER_FALLBACKS` tanımlı olmadığı için Gemini arızasında OpenAI'ye değil doğrudan proje içi mock sağlayıcıya geçiliyor.
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
