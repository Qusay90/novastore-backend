> **KAPANDI / SUPERSEDED:** Bu pending belge 13 Ağustos 2026 tarihinde yeniden doğrulandı. Güncel otorite: `NOVASTORE_V4_12_13_REVALIDATION_AND_A_Z_AUDIT_2026-08-13.md`.

# NovaStore Müşteri Uygulaması — Yeni Sohbet İçin Bağlayıcı Devam Handoff'u

Tarih: 13 Ağustos 2026

## Bağlayıcı durum düzeltmesi

Önceki sohbetin sonunda yazılan `V4.13 PASS`, `tamamlandı`, `A–Z denetimi tamamlandı` ve benzeri ifadeler kullanıcı tarafından kabul edilmemiştir. Sohbet bağlamı şiştiği için son görevlerin fiilen tamamlanmadığı veya kullanıcıya doğru biçimde gösterilip doğrulanmadığı belirtilmiştir.

Bu nedenle:

- Son görsel/etkileşim görevlerinin tamamı `PENDING / UNVERIFIED` kabul edilecektir.
- `design-qa.md`, `NOVASTORE_A_Z_AUDIT_V4_13.md` ve `CODEX_HANDOFF_PROMPT_V4_13.md` yalnız tarihsel taslak/ön inceleme olarak kullanılabilir; tamamlanma kanıtı değildir.
- Yeni sohbet gerçek kaynak kodu, mevcut çalışma ağacını ve canlı önizlemeyi incelemeden hiçbir işi tamamlanmış saymayacaktır.
- Kullanıcı canlı önizlemede görebilmeden ve aynı durumdaki referansla karşılaştırılmadan görsel PASS verilmeyecektir.

## Yeni sohbetin rolü ve iş sırası

ChatGPT/Codex Work sohbeti burada tema ve frontend düzeltmelerini doğrudan yapacaktır. Backend, gerçek auth, ödeme, veri kalıcılığı veya production entegrasyonu gerektiren işler yalnız A–Z denetim raporunda sınıflandırılıp daha sonra Codex'e verilecektir.

Bağlayıcı sıra:

1. Çalışma alanını ve gerçek kaynak kodu aç.
2. Repository/çalışma ağacı baseline'ını ve `AGENTS.md` talimatlarını incele; mevcut kullanıcı değişikliklerini koru.
3. Aşağıdaki bekleyen görsel ve yerel etkileşim görevlerini sırayla uygula.
4. Uygulamayı canlı bulut tarayıcıda aç; referanslarla aynı ekran ve durumda görsel/etkileşim QA yap.
5. Kullanıcıya çalışan önizlemeyi göster; hiçbir görevi yalnız kaynak kod veya test çıktısıyla kapatma.
6. Görsel görevler doğrulandıktan sonra bütün uygulamayı A'dan Z'ye salt-okunur incele.
7. Ayrıntılı denetim raporunu hazırla.
8. Son olarak gerçek ana repository'de uygulanmak üzere Codex'e verilecek tek parça, kopyalanabilir promptu hazırla.

## PENDING A — Üst bar, soru-cevap ve PDP satıcı alanı

1. Genel üst barın altındaki beyaz bloom/gölge kaldırılacak. Lacivert hafif derinlik gerekiyorsa korunabilir; beyaz şerit/bloom kalmayacak.
2. Yanıtlanmış ürün sorusunda satıcı cevabı müşteri sorusuyla aynı sol eksende başlamayacak. Cevap soldan içeri alınacak ve yanında kısa lacivert dikey çizgi bulunacak. Soru ile cevap ayrı ama ilişkili bloklar olacak.
3. PDP satıcı alanı, kullanıcının verdiği `Satıcı Bilgisi` referansındaki hiyerarşiyi kullanacak:
   - mağaza avatarı/logosu;
   - tam mağaza adı ve doğrulama işareti;
   - güvenilir satıcı/hızlı gönderici gibi yalnız gerçek mock veriye dayalı özet;
   - puan yüzeyi;
   - `Mağazaya Git` ve `Satıcıya Sor` olmak üzere iki ayrı eylem.
4. PDP içinde açılıp kapanan inline mini mağaza olmayacak. `Mağazaya Git` ayrı mağaza sayfası açacak.
5. Mağaza sayfasında mağazanın ürünleri, mağaza içi arama, takip durumu, sekmeler, filtreleme, sıralama ve ortak ProductCard bulunacak. Hepsiburada referansından yalnız bilgi mimarisi/düzen fikri alınacak; marka, logo, turuncu kimlik veya görsel asset kopyalanmayacak.

## PENDING B — PDP medya, dalga, hizalama ve erişilebilir metin

1. PDP görselinin noktaları medya sınırının içinde/üzerinde görünecek; medya kutusu noktaların altına kadar devam edecek.
2. Görsel kaydırılırken görsel beyaz dalganın arkasında hareket edecek, dalga sabit kalacak ve beyaz detay yüzeyine ait olacak.
3. Medya ile beyaz detay kutusu arasında boş şerit/seam olmayacak.
4. Beyaz detay yüzeyinin sağ ve sol kenarı medya görseliyle aynı hizada olacak; yeşil işaretle gösterilen gereksiz yan boşluklar kaldırılacak.
5. Dalga tek ve sürekli responsive eğri olacak: sol taraf biraz daha yüksek başlayacak; sağa yakın daha derin, yumuşak bir çukur olacak; en sağda küçük, yuvarlak ve düzgün bir yükselişle bitecek. Sağ tarafta düz ledge, kırık/köşe, eğik yamuk çıkıntı veya polygon kinki olmayacak.
6. Açıklama ve özellikler alanında ikonlu `Yazıları büyüt` kontrolü bulunacak. Basılınca yalnız okunacak metinler reflow ile büyüyecek; kontrol `Yazıları küçült` olacak ve tekrar basılınca ilk ölçülere dönecek. Tüm arayüz zoom edilmeyecek.
7. Ürün görseline basınca viewer açılacak; swipe, önceki/sonraki ok, seçili gösterge, pinch/zoom ve pan çalışacak.
8. Viewer 1× durumundayken görsel yukarı/aşağı sürüklenip bırakıldığında tam ilk merkez konumuna dönecek. Son görsel dahil hiçbir slide dikeyde kaymış halde kalmayacak. Zoom >1 durumunda bounds içi pan çalışmaya devam edecek. Reset ve slide değişimi eski transformu temizleyecek.

## PENDING C — Mağaza hero, mağaza araması ve mağaza araçları

1. Mağaza adının yanında veya arkasında görünen çizgi tamamen kaldırılacak. Tam `Nova Audio Mağazası` adı ve doğrulama rozeti temiz, kesintisiz bir foreground katmanında olacak.
2. Mağaza kapak görselinin dalgalı alt sınırı biraz aşağı uzatılacak ve profil fotoğrafı/logosunun yaklaşık dikey merkezine ulaşacak.
3. Mağaza arama alanına mouse/touch ile odaklanıldığında raw input çevresinde sert dikdörtgen focus kutusu, outline veya beyaz ring oluşmayacak.
4. Focus sırasında placeholder/örnek yazı kaybolacak, yanıp sönen lacivert caret kalacak ve seçimi anlatmak için yalnız rounded arama yüzeyinin rengi/border'ı hafif değişecek.
5. `Filtrele` ve `Sırala` tam genişlikte büyük düğmeler olmayacak. Sonuç başlığının yanında küçük ikon kontrolleri olacak; pratik dokunma alanı, erişilebilir ad, aktif filtre sayacı ve çalışan bottom-sheet davranışı korunacak.

## PENDING D — Checkout ve genel seçim/focus davranışı

1. Turuncu sert focus/seçim halkası bu özelliği taşıyan bütün ilgili seçeneklerden kaldırılacak. Seçim, kutunun hafif yüzey rengi değişimiyle ve gerekirse ikon/check ile anlaşılacak; yalnız renge bağımlı olmayacak.
2. Checkout'ta `Havale/EFT` ve `Kapıda Ödeme` kaldırılacak; yalnız kartla ödeme kalacak.
3. Kart ödeme yönteminin simgesi çanta değil gerçek kart simgesi olacak.
4. Kart numarası alanının trailing simgesi kart numarası/kart semantiğini gösterecek ve dikeyde ortalanacak.
5. Son kullanma ve CVC/CVV alanlarındaki trailing simgeler dikeyde tam ortalanacak.
6. CVV gözü gerçekten göster/gizle işlevi yapacak.
7. CVV kalıcı olarak saklanmayacak veya kayıtlı kartta gerçek değer olarak gösterilmeyecek.

## PENDING E — Daha önce biriken uygulama geneli UI görevleri

Bu maddeler mevcut kodda gerçekten çalışıyor mu yeniden doğrulanacak; yalnız eski rapora bakılarak PASS sayılmayacak:

- Favoriler kartı Home, Favorites, kategori/PLP, arama ve önerilen ürünler için tek kanonik ProductCard olacaktır; route'a özel geometri olmayacaktır.
- Sepet düğmesi bütün kartlarda aynı oyukta, aynı merkez ve alt boşlukta olacaktır.
- Ürün kartı ve PDP carousel'i gesture başına en fazla bir komşu görsel ilerleyecek; sallanma, ters sekme veya sonradan yerine oturma olmayacaktır.
- Bütün carousel noktaları yuvarlak olacak; aktif lacivert nokta pasiflerden yalnız 1,25–1,5 kat büyük olacaktır.
- Açıklama başlığındaki döngü/refresh oku kaldırılacak veya uygun dekoratif bilgi/list simgesiyle değiştirilecektir.
- Verified buyer değerlendirmesi anında normal değerlendirme kartı olarak görünecek; `incelemeye alındı` metni olmayacaktır. Avatar solda, maskeli ad koyu, yalnız `Doğrulanmış alışveriş` yeşil olacaktır.
- Satın almayan kullanıcı değerlendirme yapamayacaktır; production yetkisi backend işidir.
- Pending soru yalnız sahibine görünür; cevaplanınca public soru-cevap olur. Production gizliliği backend işidir.
- PDP önerilen ürünler, kategori ürün sonu ve Hesabım `Çıkış Yap` ile sticky alt bar arasında yalnız güvenli 12–24 px terminal açıklık kalacak; devasa boş slab olmayacaktır.
- Filtre fiyat alanları gerçek editable min/max numeric input olacak; çalışmayan slider bulunmayacaktır.
- Sıralama ayrı sheet açacak ve standart seçenekleri gerçekten uygulayacaktır.
- Bildirim zili bulunduğu her route'tan gerçek Bildirimler ekranını açacaktır; yalnız toast vermeyecektir.
- Arama geçmişi/öneri paneli arama çubuğuna bağlı overlay olacak, ilk anlamlı dikey scroll'da kapanacak ve inputa basılınca aynı scroll konumunda açılacaktır.
- Kayıtlı kart formu dummy kart üretmeyecek; çoklu kart, isim, chip, marka/TROY logosu, gerçek kart oranı ve güvenli CVV davranışı olacaktır.
- Adreslerde ekle/düzenle/onaylı sil/tek varsayılan seçimi yerel olarak çalışacaktır.

## PENDING F — Görsel düzeltmelerden sonra A–Z uygulama denetimi

Görsel görevler tamamlanıp canlı önizlemede doğrulandıktan sonra bütün uygulamayı baştan sona incele:

1. Bütün route, tab, subview, sheet, modal ve state'leri envantere al.
2. Tıklanabilir her benzersiz kontrolü ve kritik tekrar bağlamlarını çalıştır. Her şeyi tek tek tıklamak mümkün değilse ortak component örneklerini davranış sınıfı başına test ettiğini açıkça belirt; test etmediğini test edilmiş gibi yazma.
3. Her kontrolü şu sınıflardan biriyle raporla:
   - gerçek ve çalışan yerel davranış;
   - demo/mock;
   - status-only/toast-only;
   - bozuk/no-op;
   - backend/auth/persistence/third-party entegrasyonu gerektirir.
4. Eksik sayfaları, yanlış route/kimlik taşımayı, sabit fixture sızıntısını, loading/error/offline eksiklerini, erişilebilirlik sorunlarını ve responsive boşluk/taşmaları bul.
5. Auth/session, profile/address, catalog/product/variant/store, search/filter/sort, favorite/cart, quote/coupon, inventory, PSP/3DS/webhook, order/shipment/invoice/return/refund, reviews, questions, notification, support/NovaBot, audit/idempotency/outbox/inbox alanlarını ayrı ayrı incele.
6. P0/P1/P2 önem derecesi, kaynak dosya/route/kanıt, kullanıcı etkisi, doğru üretim davranışı, frontend işi ve Codex/backend işi ayrımını yaz.
7. Gerçek production erişimi, gerçek ödeme, production DB, migration apply veya dış mutation yapma.
8. Önceki `NOVASTORE_A_Z_AUDIT_V4_13.md` raporunu ancak güncel kodla yeniden doğrulanan maddeler için kullan; körlemesine kopyalama.

## PENDING G — Codex'e verilecek son çıktı

A–Z raporundan sonra Codex için tek parça, bir tıklamayla kopyalanabilir bir prompt üret. Prompt:

- önce ana repository'de salt-okunur uzlaştırma yaptıracak;
- her yeteneği kaynak dosya, endpoint, migration ve test kanıtıyla `EXISTS / PARTIAL / ABSENT / CONFLICTING` sınıflandıracak;
- kanıtlı matris gelmeden implementation yaptırmayacak;
- mevcut sistemi kopyalamayacak veya paralel ikinci auth/order/payment sistemi kurmayacak;
- Stocky/vendor core'u mümkün olduğunca değiştirmeyecek, NovaStore bağını connector/BFF katmanında tutacak;
- fazları güvenli ama gereksiz mikro turlara bölmeden, performansı düşürmeden birleştirecek;
- test, güvenlik, commit, push, PR, merge ve deploy kapılarını ayrı yetkiler olarak koruyacak;
- production DB, gerçek payment, migration apply, push/PR/merge/deploy için ayrıca açık yetki isteyecek;
- önceki ACCEPTED/PASS/RESOLVED/COMMITTED işleri ilgili kod farkı geçersiz kılmadıkça tekrarlamayacak.

## Referans dosyalar

Yeni sohbet mümkünse aynı ChatGPT Projesinde açılmalıdır. Önceki sohbet erişilebiliyorsa yalnız ayrıntılı konuşma ve kaynak görseller için kullanılabilir. Doğrudan erişilemiyorsa erişilmiş gibi davranılmayacaktır.

Temel referans görseller:

- `e5eac520-01c2-4649-be3b-a41b59a46fa6.png` — üst bar beyaz bloom.
- `30d6c10a-37c7-4483-b75c-36ee45cb6a97.png` — soru/satıcı cevabı düzeni.
- `28b6b2de-8e46-4d23-9c38-89247245cb99.jpeg` — PDP Satıcı Bilgisi kartı.
- `8f3060da-d813-4f8d-bf8c-10a2990e483f.jpeg` ve `b543abe3-e817-43c5-9c44-086caa90307b.jpeg` — mağaza IA ve tüm ürünler araçları için yalnız düzen ilhamı.
- `16f1155f-b2e4-4a2b-8275-693a495bdb10.png` ve `704632b5-a4c6-473b-a662-8e6fff640493.png` — PDP galeri/dalga/detay yüzeyi.
- `f284b98c-5c01-4774-9bfd-2af82fd5af53.png` — checkout focus ve alan ikonları.
- `f8e64172-2e92-47a6-b529-5e3ba69f26f7.png` — mağaza çizgi, hero, arama focus ve büyük filtre/sort.
- `9bad6278-bc83-4349-8421-fbe687491ee1.png` — viewer son görsel drift.
- `d04e28ab-e70f-42c5-bf31-c05f17151730.png` — PDP sağ dalga kinki.
- `6ebcd93f-fcd5-4dea-b88e-0699aef8df99.png` — kanonik Favorites ProductCard.

## Kabul ve raporlama

- İlk çıktı kısa bir baseline ve yürütme planı olacaktır; kullanıcıdan zaten açıkça verilen görsel görevler için tekrar onay istenmeyecektir.
- Çalışma devam ederken kısa ve düzenli durum güncellemeleri verilecektir.
- Son çıktı; uygulanan değişiklikler, görsel karşılaştırma, çalışan önizleme, testler, blokajlar, değiştirilmiş dosyalar ve kalan Codex/backend işleri içerecektir.
- `PASS`, yalnız gerçekten çalıştırılmış kontrol ve kullanıcıya gösterilen canlı sonuç için kullanılacaktır.
- Commit/push/deploy yetkisi ayrıca verilmediyse yapılmayacaktır.
