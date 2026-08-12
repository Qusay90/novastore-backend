# NovaStore yerel insan inceleme rotaları

Bu sayfa yalnızca `http://127.0.0.1:5273` üzerindeki resmî entegre yerel inceleme runtime'ı içindir. Veriler sentetiktir, istekler loopback ile sınırlıdır; sepet, favori, checkout özeti, profil, adres, bildirim, ürün sorusu ve destek mesajı yalnız token'a bağlı review süreci RAM'inde tutulur. Parola, gerçek ödeme ve sipariş oluşturma işlemleri reddedilir.

| Rota | Oturum | Deterministik durum | İncelenecek yüzey |
| --- | --- | --- | --- |
| `/#/` | Gerekmez | Yerel katalog | Ana sayfa, tipografi ve kart ağırlıkları |
| `/#/kategori/elektronik` | Gerekmez | Yerel katalog | Liste kartı, sepet ekleme ve karşılaştırma |
| `/#/koleksiyon/firsatlar` | Gerekmez | İndirimli yerel katalog | Fırsatlar listesi ve filtreler |
| `/#/arama?q=iphone` | Gerekmez | Yerel katalog araması | Arama sonucu ve boş sonuç yönlendirmesi |
| `/#/urun/apple-iphone-15-128-gb` | Gerekmez | Yerel review ürünü | Dört tutarlı yerel görsel, küçük görseller, seçim ve lightbox |
| `/#/sepet` | Gerekmez | Tarayıcı yerel sepeti | Sepet satırları ve ödeme yönlendirmesi |
| `/#/yardim` | Gerekmez | Yerel yardım içeriği | Yeni NovaStore yardım simge ailesi |
| `/#/iade-degisim` | Gerekmez | Bilgilendirme | Dürüst iade/değişim kapsamı |
| `/__review/customer` | Yerel oturumu başlatır | Sentetik müşteri, yalnızca loopback | Hesabım'a doğrudan geçiş |
| `/#/hesabim` | Yerel review oturumu | Sentetik müşteri | Profil ve hesap özeti |
| `/#/hesabim/adresler` | Yerel review oturumu | Bir sentetik adres | Adresler |
| `/#/hesabim/siparisler` | Yerel review oturumu | Bir sentetik sipariş | Sipariş listesi |
| `/#/hesabim/siparisler/7002` | Yerel review oturumu | Sipariş `7002` | Sipariş ayrıntısı |
| `/#/favoriler` | Yerel review oturumu | Tarayıcı yerel favorileri | Favoriler |
| `/#/hesabim/kuponlar` | Yerel review oturumu | `LOCAL10` | Kuponlar |
| `/#/hesabim/bildirimler` | Yerel review oturumu | Bir sentetik bildirim | Bildirimler |
| `/#/hesabim/guvenlik` | Yerel review oturumu | Sentetik müşteri | Gerçek parola işleminin açıkça devre dışı bırakıldığı güvenlik sınırı |
| `/#/siparis-takibi` | Yerel review oturumu | Sipariş `7002` | Hesaba bağlı teslimat araması |
| `/#/iletisim` | Yerel review oturumu | Sentetik destek geçmişi | Destek/iletişim ve yerel, RAM'de yaşayan mesaj gönderimi |
| `/#/odeme/teslimat` | Yerel review oturumu + sepette ürün | Yerel fiyatlandırma | Teslimat ve checkout yerleşimi; ödeme başlatma bu review runtime'ında kapalıdır |
| `/#/odeme/sonuc?paymentRef=LOCAL-REVIEW-NONPAYMENT&orderId=7002` | Yerel review oturumu | Ödeme yok sınırı | Sağlayıcı veya ödeme durumu sorgusu yapmadan dürüst review açıklaması |

## Girişli inceleme akışı

1. `http://127.0.0.1:5273/__review/customer` adresini açın.
2. Sayfa yalnızca loopback review sunucusunda, her girişte rastgele üretilen ve 30 dakika geçerli sentetik oturumu izole bir tarayıcı anahtar alanına yazar ve `/#/hesabim` rotasına yönlendirir.
3. Yukarıdaki girişli rotaları inceleyin. Bu bir üretim hesabı, üretim parolası veya üretimde etkinleşebilen bir mekanizma değildir.
4. Checkout rotasını incelemek için önce ürün rotasında `Sepete ekle` düğmesini kullanın; review fiyatlandırması yalnız RAM'dedir ve sunucu kapanınca silinir.

## Drawer kontrolü

Liste sayfasında bir ürünü sepete ekleyin, sağ üst sepet düğmesini açın; adet düğmeleri, ürün bağlantısı, kaldır, kapat, backdrop ve Escape davranışlarını hem masaüstünde hem mobil genişlikte doğrulayın.
