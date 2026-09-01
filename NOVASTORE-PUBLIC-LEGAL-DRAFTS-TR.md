# NovaStore Public Legal Drafts — TR

Durum: DRAFT — OWNER / PROFESSIONAL LEGAL REVIEW REQUIRED
Tarih: 1 Eylül 2026

Bu metinler teknik olarak mevcut 12 public legal route'a uyarlanmış çalışma
taslaklarıdır. Nihai hukuki tavsiye, mevzuata uygunluk görüşü veya yayın onayı
değildir. Owner ve profesyonel hukuk danışmanı; şirketin gerçek yapısı, PayTR
Pazaryeri modeli, satıcı ilişkisi, kişisel veri envanteri, çerez envanteri,
iade/teslimat operasyonu ve yürürlükteki mevzuatla birlikte her metni ayrı
onaylamalıdır.

Hiçbir taslakta gerçek şirket değeri uydurulmamıştır.

## Teknik yayın sözleşmesi

Her rota yalnız kendi üç environment alanı birlikte geçerliyse yayımlanır:

- NOVASTORE_LEGAL_<KEY>_TEXT
- NOVASTORE_LEGAL_<KEY>_VERSION
- NOVASTORE_LEGAL_<KEY>_APPROVED

APPROVED exact true, VERSION geçerli ve TEXT dolu/onaylı olmadıkça rota
owner_external_required kalır.

### İzin verilen tek platform placeholder allowlist'i

- {{business.legalCompanyName}}
- {{business.tradeName}}
- {{business.taxNumber}}
- {{business.taxOffice}}
- {{business.mersisNumber}}
- {{business.registeredAddress}}
- {{business.kepAddress}}
- {{business.phone}}
- {{business.email}}
- {{business.customerDomain}}

Bilinmeyen, bozuk veya çözülemeyen placeholder belgeyi yayımlamaz.
business.taxOffice opsiyonel BusinessIdentity alanıdır; bu token bir metinde
kullanılırsa geçerli owner değeri bulunmadan ilgili metin yayımlanmaz.

Customer, adres, ürün, fiyat, kargo, kupon, sipariş ve satıcı değerleri için
statik template placeholder'ı oluşturulmaz. Checkout'a zorunlu iki belgede bu
veriler backend tarafından server-authoritative işlem özeti olarak eklenir.
Approved seller public legal identity; organization/store bağından, sürüm/hash
snapshot'ıyla gelir. Başka Customer veya Seller'ın özel verisi kullanılmaz.

## Kanonik rota haritası

| Slug | Public path | Environment key |
|---|---|---|
| about | /hakkimizda | ABOUT |
| privacy | /gizlilik-politikasi | PRIVACY |
| kvkk | /kvkk-aydinlatma-metni | KVKK |
| cookies | /cerez-politikasi | COOKIES |
| membership-terms | /kullanim-ve-uyelik-kosullari | MEMBERSHIP_TERMS |
| pre-information | /on-bilgilendirme-formu | PRE_INFORMATION |
| distance-sale | /mesafeli-satis-sozlesmesi | DISTANCE_SALE |
| cancellation-return | /iptal-iade-cayma-politikasi | CANCELLATION_RETURN |
| delivery-shipping | /teslimat-ve-kargo-kosullari | DELIVERY_SHIPPING |
| transaction-guide | /islem-rehberi | TRANSACTION_GUIDE |
| marketplace-disclosure | /pazaryeri-bilgilendirmesi | MARKETPLACE_DISCLOSURE |
| seller-agreement | /satici-sozlesmesi | SELLER_AGREEMENT |

---

## 1. Hakkımızda

Route: /hakkimizda
Environment key: ABOUT
Durum: DRAFT — DO NOT SET APPROVED

### Taslak metin

# Hakkımızda

NovaStore, {{business.legalCompanyName}} tarafından {{business.tradeName}}
ticari adıyla işletilen, müşteriler ile bağımsız satıcıları dijital ortamda
buluşturan bir pazaryeri platformudur.

Platformun amacı; ürünlerin, satıcı ve mağaza bilgilerinin, fiyatların,
teslimat koşullarının ve müşteri değerlendirmelerinin anlaşılır biçimde
sunulmasını; sipariş ve satış sonrası süreçlerin güvenli bir teknik altyapı
üzerinden yürütülmesini sağlamaktır.

NovaStore üzerinde bir ürünün satıcısı ürün detayında, mağaza sayfasında,
sepette ve siparişe özel bilgilendirme/sözleşme içeriğinde gösterilir.
{{business.legalCompanyName}}, açıkça satıcı olarak belirtilmediği işlemlerde
pazaryeri/aracı hizmet sağlayıcı rolündedir. Tarafların kesin hukuki rol ve
sorumlulukları owner ve profesyonel hukuk tarafından onaylanan güncel metinlere
göre değerlendirilir.

Platform işletmecisi:

- Resmi unvan: {{business.legalCompanyName}}
- Ticari ad: {{business.tradeName}}
- VKN: {{business.taxNumber}}
- MERSİS: {{business.mersisNumber}}
- Kayıtlı adres: {{business.registeredAddress}}
- KEP: {{business.kepAddress}}
- Telefon: {{business.phone}}
- E-posta: {{business.email}}
- Web: {{business.customerDomain}}

NovaStore; güvenli oturum, server-authoritative fiyat ve stok, seller
yetkilendirmesi, sürümlü hukuk metni ve ödeme sağlayıcısı callback doğrulaması
gibi kontroller kullanır. Bu açıklama bir güvenlik garantisi değil, teknik
yaklaşımın genel özetidir.

Soru, talep ve şikâyetler için {{business.email}} veya {{business.phone}}
üzerinden iletişim kurulabilir.

---

## 2. Gizlilik Politikası

Route: /gizlilik-politikasi
Environment key: PRIVACY
Durum: DRAFT — DATA INVENTORY AND LEGAL REVIEW REQUIRED

### Taslak metin

# Gizlilik Politikası

Bu politika, {{business.legalCompanyName}} tarafından {{business.tradeName}}
ticari adıyla işletilen {{business.customerDomain}} üzerindeki NovaStore
hizmetlerinde kişisel verilerin işlenmesine ilişkin genel çerçeveyi açıklar.

## İşlenebilecek veri kategorileri

Hizmetin kullanımına göre kimlik ve iletişim bilgileri, hesap ve oturum
kayıtları, teslimat/adres bilgileri, sipariş ve işlem bilgileri, iade/destek
kayıtları, satıcı/mağaza etkileşimleri, soru ve değerlendirmeler, güvenlik ve
cihaz/ağ kayıtları ile tercih/çerez verileri işlenebilir.

NovaStore kart numarası, CVV veya kartın son kullanma tarihini Customer
arayüzünde toplamaz. Ödeme sağlayıcısının kendi güvenli alanında işlediği
veriler ilgili sağlayıcının süreçlerine tabidir. Bu ifade provider sözleşmesi
ve gerçek veri akışı envanteriyle yayın öncesinde doğrulanmalıdır.

## İşleme amaçları

Veriler; üyelik ve oturum yönetimi, siparişin kurulması ve ifası, teslimat,
müşteri desteği, iade/cayma süreçleri, dolandırıcılık ve hesap güvenliği,
mevzuattan doğan kayıt yükümlülükleri, hizmet kalitesi, yasal taleplere cevap
ve açık rıza gereken hallerde izin verilen iletişim/analitik amaçları için
işlenebilir.

## Hukuki sebepler

İşleme; sözleşmenin kurulması veya ifası, hukuki yükümlülük, bir hakkın tesisi,
kullanılması veya korunması, temel haklara zarar vermeyen meşru menfaat ve
gerektiğinde açık rıza hukuki sebeplerinden uygun olana dayanır. Her veri
faaliyeti için gerçek hukuki sebep veri envanteri ve profesyonel hukuk
incelemesinde ayrı doğrulanır.

## Paylaşım

Gerekli ve ölçülü olmak kaydıyla veriler; ilgili satıcı, teslimat/kargo
sağlayıcısı, ödeme kuruluşu, e-posta/bildirim ve altyapı sağlayıcıları, destek
ve güvenlik hizmetleri, muhasebe/hukuk danışmanları ve yetkili kamu kurumlarıyla
paylaşılabilir. Satıcı yalnız kendi sipariş/mağaza kapsamındaki verilere
erişmelidir.

Yurt dışı aktarım olup olmadığı, kullanılan gerçek provider ve veri merkezi
envanterine göre ayrıca açıklanmalı; gerekli hukuki mekanizma sağlanmadan
varsayım yapılmamalıdır.

## Saklama ve güvenlik

Veriler amaç ve mevzuat için gerekli süre boyunca saklanır; süre sonunda
silme, yok etme veya anonimleştirme politikası uygulanır. Erişim kontrolü,
oturum güvenliği, tenant/customer sahiplik sınırı, şifreleme ve olay kaydı gibi
idari/teknik tedbirler uygulanır. Yayın öncesinde gerçek saklama süreleri ve
tedbir envanteri onaylanmalıdır.

## Haklar ve iletişim

Kişisel verilerle ilgili başvurular {{business.registeredAddress}},
{{business.kepAddress}} veya {{business.email}} üzerinden, başvuru sahibinin
kimliğini ve talebini doğrulayacak yöntemle iletilebilir. KVKK kapsamındaki
haklar ve başvuru usulü KVKK Aydınlatma Metni'nde ayrıntılandırılır.

Bu politika güncellendiğinde onaylı yeni sürüm ve yayın tarihi kayıt altına
alınır.

---

## 3. KVKK Aydınlatma Metni

Route: /kvkk-aydinlatma-metni
Environment key: KVKK
Durum: DRAFT — VERİ SORUMLUSU/ENVANTER/HUKUK ONAYI REQUIRED

### Taslak metin

# KVKK Aydınlatma Metni

6698 sayılı Kişisel Verilerin Korunması Kanunu kapsamında veri sorumlusu
sıfatının ve kapsamının profesyonel hukuk incelemesinde doğrulanması kaydıyla,
bu aydınlatma metni {{business.legalCompanyName}} tarafından
{{business.tradeName}} hizmetleri için hazırlanmıştır.

Veri sorumlusu iletişim bilgileri:

- Unvan: {{business.legalCompanyName}}
- VKN: {{business.taxNumber}}
- MERSİS: {{business.mersisNumber}}
- Adres: {{business.registeredAddress}}
- KEP: {{business.kepAddress}}
- E-posta: {{business.email}}
- Telefon: {{business.phone}}

## Kişisel veri kategorileri

Kimlik, iletişim, müşteri işlem, sipariş/teslimat, finansal işlem referansı,
talep/şikâyet, değerlendirme/soru, pazarlama tercihi, işlem güvenliği ve
teknik kullanım verileri hizmetin gerçek akışına göre işlenebilir. Özel
nitelikli kişisel veri işleniyorsa ayrı envanter, hukuki sebep ve tedbir
belirlenmeden bu metin onaylanmamalıdır.

## Amaçlar ve hukuki sebepler

Veriler üyeliğin ve siparişin yürütülmesi, ödeme/teslimat koordinasyonu,
satış sonrası destek, iade/cayma, güvenlik, sahteciliğin önlenmesi, muhasebe ve
mevzuat yükümlülükleri, uyuşmazlıkların yönetimi ve gerekli izinlere bağlı
iletişim için işlenebilir.

İşleme şartları; sözleşmenin kurulması/ifası, hukuki yükümlülük, hakkın tesisi,
meşru menfaat ve gerektiğinde açık rıza olabilir. Amaç-hukuki sebep eşlemesi
gerçek veri işleme envanterinde onaylanır.

## Toplama yöntemi

Veriler web/mobil arayüzler, müşteri veya satıcı beyanı, sipariş ve destek
işlemleri, ödeme/kargo sağlayıcısı dönüşleri, güvenlik kayıtları ve yetkili
entegrasyonlardan otomatik veya kısmen otomatik yöntemlerle elde edilebilir.

## Aktarım

İşlemin gerektirdiği ölçüde ilgili satıcıya, ödeme ve teslimat sağlayıcısına,
barındırma/iletişim/güvenlik hizmet sağlayıcılarına, danışmanlara ve yetkili
kamu kurumlarına aktarım yapılabilir. Aktarımın kapsamı, yeri ve hukuki
mekanizması gerçek provider sözleşmeleriyle doğrulanır.

## İlgili kişinin hakları

İlgili kişi; kişisel verisinin işlenip işlenmediğini öğrenme, bilgi talep etme,
amacına uygun kullanımı öğrenme, aktarılan üçüncü kişileri bilme, eksik/yanlış
işlemeyi düzeltme, şartları varsa silme/yok etme, bu işlemlerin aktarılan
kişilere bildirilmesini isteme, otomatik analiz sonucuna itiraz ve kanuna
aykırılık nedeniyle zararın giderilmesini talep etme haklarına sahiptir.

Başvurular {{business.registeredAddress}}, {{business.kepAddress}} veya
{{business.email}} üzerinden iletilebilir. Kimlik doğrulama ve cevap yöntemi,
yetkili makam düzenlemeleri ve onaylı başvuru prosedürüyle uygulanır.

---

## 4. Çerez Politikası

Route: /cerez-politikasi
Environment key: COOKIES
Durum: DRAFT — ACTUAL COOKIE/CMP INVENTORY REQUIRED

### Taslak metin

# Çerez Politikası

{{business.customerDomain}} üzerinde çerezler ve benzer teknolojiler, yalnız
gerçek teknik envanterde bulunan amaçlar kapsamında kullanılmalıdır. Bu taslak
yayınlanmadan önce kullanılan her çerezin adı, sağlayıcısı, amacı, süresi,
birinci/üçüncü taraf niteliği ve hukuki dayanağı doğrulanmalıdır.

## Çerez kategorileri

- Zorunlu çerezler: Oturum, güvenlik, sepet ve temel site işlevleri için
  gerekebilir.
- Tercih çerezleri: Dil, görünüm veya kullanıcı tercihlerini hatırlamak için
  kullanılabilir.
- Analitik çerezler: Site performansını ölçmek için, gerekli onay ve gerçek
  provider envanteri varsa kullanılabilir.
- Reklam/pazarlama çerezleri: Yalnız uygun açık rıza ve onaylı provider
  sözleşmesi varsa kullanılabilir.

Zorunlu olmayan çerezler, geçerli tercih/izin alınmadan etkinleştirilmemelidir.
Kullanıcı tercihini değiştirebilmeli ve izin geri alındığında yeni zorunlu
olmayan işleme durmalıdır.

Tarayıcı ayarlarından çerezler silinebilir veya engellenebilir; zorunlu
çerezlerin engellenmesi oturum, sepet veya güvenlik işlevlerini etkileyebilir.

Üçüncü taraf çerez ve yurt dışı aktarım açıklamaları gerçek provider/CMP
envanterine göre yazılmalıdır. Uydurma analitik veya reklam sağlayıcısı bu
metne eklenmez.

Sorular için {{business.email}} adresine başvurulabilir.

---

## 5. Kullanım ve Üyelik Koşulları

Route: /kullanim-ve-uyelik-kosullari
Environment key: MEMBERSHIP_TERMS
Durum: DRAFT — OWNER / LEGAL REVIEW REQUIRED

### Taslak metin

# Kullanım ve Üyelik Koşulları

Bu koşullar, {{business.legalCompanyName}} tarafından {{business.tradeName}}
adıyla işletilen {{business.customerDomain}} üzerindeki NovaStore hizmetinin
kullanımına ilişkin taslaktır.

## Hesap ve güvenlik

Kullanıcı doğru ve güncel bilgi vermeli, hesabını ve doğrulama araçlarını
korumalı, yetkisiz kullanımı gecikmeden bildirmelidir. Kullanıcı başka kişinin
hesabına, siparişine, adresine veya özel verisine erişmeye çalışamaz.

NovaStore; şüpheli kullanım, hukuka aykırı içerik, güvenlik riski veya koşul
ihlali halinde ölçülü güvenlik tedbirleri uygulayabilir. Hesap askıya
alma/kapatma usulü, itiraz kanalı ve yasal saklama yükümlülükleri yayın öncesi
onaylanmalıdır.

## Pazaryeri ve satıcı

NovaStore birden çok bağımsız satıcıyı barındırabilir. Ürünün satıcısı PDP,
mağaza ve sipariş/sözleşme bağlamında belirtilir. Fiyat, stok, teslimat, iade
ve garanti açıklamaları ürün ve satıcıya göre değişebilir. Platformun ve
satıcının sorumlulukları onaylı pazaryeri ve satış metinlerinde ayrıca
gösterilir.

## Sipariş

Sepete ekleme tek başına satış sözleşmesi kurmaz. Checkout sırasında adres,
ürün, satıcı, tutar, kargo ve zorunlu sözleşme sürümleri kullanıcıya sunulur.
Ödeme sonucu browser dönüşüyle değil, yetkili ödeme sağlayıcısından doğrulanan
server kaydıyla belirlenir.

## Kullanım kuralları

Kullanıcı hukuka aykırı, yanıltıcı, zararlı, otomatik kötüye kullanım veya
başkalarının haklarını ihlal eden faaliyetlerde bulunamaz. Soru,
değerlendirme ve içerikler gerçek deneyime dayanmalı; kişisel veri, hakaret,
reklam veya yasaklı içerik taşımamalıdır.

## Fikri haklar

Platform yazılımı, marka, tasarım ve içerik üzerindeki haklar ilgili hak
sahibine aittir. Satıcıların ürün görselleri/açıklamaları için gerekli haklara
sahip olma yükümlülüğü Seller Agreement'ta düzenlenir.

## Değişiklik ve iletişim

Koşullar yalnız onaylı yeni sürümle güncellenir; gerekli durumlarda kullanıcıya
uygun bildirim yapılır. Sorular {{business.email}} adresine iletilebilir.
Uygulanacak hukuk ve uyuşmazlık merciine ilişkin hüküm profesyonel hukuk
incelemesinde eklenmelidir.

---

## 6. Ön Bilgilendirme Formu

Route: /on-bilgilendirme-formu
Environment key: PRE_INFORMATION
Durum: DRAFT — CHECKOUT REQUIRED — DO NOT APPROVE WITHOUT LEGAL REVIEW

### Taslak metin

# Ön Bilgilendirme Formu

Bu form, mesafeli işlem kurulmadan önce müşteriye sunulacak genel hükümler için
taslaktır. İşleme özel müşteri, teslimat adresi, ürün, adet, satıcı/mağaza,
fiyat, indirim, kargo ve toplam tutar bilgileri backend tarafından bu metnin
sonuna server-authoritative işlem özeti olarak eklenir.

## Aracı hizmet sağlayıcı

- Resmi unvan: {{business.legalCompanyName}}
- Ticari ad: {{business.tradeName}}
- VKN: {{business.taxNumber}}
- MERSİS: {{business.mersisNumber}}
- Adres: {{business.registeredAddress}}
- KEP: {{business.kepAddress}}
- Telefon: {{business.phone}}
- E-posta: {{business.email}}

İşleme özel satıcı veya satıcılar, approved public legal identity ve mağaza
adıyla işlem özetinde gösterilir. NovaStore'un aracı hizmet sağlayıcı rolü ile
satıcının satıştan doğan rolü owner/profesyonel hukuk onaylı metinle
netleştirilmelidir.

## Ürün ve toplam bedel

Ürünlerin temel nitelikleri, adetleri, birim/satır fiyatları, indirimler,
kargo bedeli ve ödenecek toplam işlem özetinde gösterilir. Client tarafından
gönderilen fiyat değil backend'in güncel fiyatlandırması esas alınır.

## Ödeme

Kart bilgileri NovaStore Customer arayüzünde toplanmaz. Ödeme, etkin ve
yetkilendirilmiş provider'ın güvenli alanında yürütülür. Browser success/fail
dönüşü ödeme otoritesi değildir; kesin durum doğrulanmış provider callback ve
server sipariş kaydıdır.

## Teslimat

Teslimat adresi ve mevcut kargo/tahmini süre işlem özetinde veya sipariş
ekranında gösterilir. Yasal azami süre, ürün niteliği, stok ve satıcı taahhüdü
onaylı teslimat politikasıyla birlikte açıklanmalıdır.

## Cayma, iade ve istisnalar

Müşterinin cayma hakkı, kullanım süresi, bildirim yöntemi, iade masrafı,
bedel iadesi zamanı ve mevzuattaki istisnalar ürün niteliğine göre açıkça
sunulmalıdır. Kişiye özel, hızlı bozulan, hijyen koruması açılmış veya dijital
içerik gibi olası istisnalar yalnız ilgili ürün ve hukuken uygulanabilir durum
için gösterilmelidir.

## Şikâyet ve başvuru

Müşteri {{business.email}}, {{business.phone}} veya hesap destek akışı üzerinden
başvurabilir. Tüketici hakem heyeti/mahkeme bilgisi ve parasal sınırlar
yayın tarihinde profesyonel hukuk tarafından güncellenmelidir.

Müşteri, ödeme başlatmadan önce bu formun tam metnini ve aynı snapshot'a bağlı
işlem özetini görüp sürüm/hash ile kabul eder.

---

## 7. Mesafeli Satış Sözleşmesi

Route: /mesafeli-satis-sozlesmesi
Environment key: DISTANCE_SALE
Durum: DRAFT — CHECKOUT REQUIRED — DO NOT APPROVE WITHOUT LEGAL REVIEW

### Taslak metin

# Mesafeli Satış Sözleşmesi

Bu sözleşme taslağı, işlem özetinde kimliği belirtilen müşteri ile ilgili
ürünün approved public legal identity ile belirtilen satıcısı veya satıcıları
arasındaki mesafeli satışa uygulanacak genel hükümleri içerir. NovaStore'un
aracı hizmet sağlayıcı kimliği:

- {{business.legalCompanyName}}
- {{business.tradeName}}
- VKN {{business.taxNumber}}
- MERSİS {{business.mersisNumber}}
- {{business.registeredAddress}}
- {{business.kepAddress}}
- {{business.phone}}
- {{business.email}}

## Konu ve sözleşme bilgileri

Sözleşmenin konusu; işlem özetinde adı, adedi, birim/satır bedeli, satıcısı,
teslimat adresi, indirimleri, kargo ve toplam bedeli belirtilen ürünlerin
satışı ve teslimidir. İşlem özeti bu metnin ayrılmaz server snapshot'ıdır.

## Kuruluş ve kabul

Müşteri, ödeme öncesinde Ön Bilgilendirme Formu ile bu sözleşmenin sürümünü,
tam metnini ve işlem özetini görür. Kabul, aynı snapshot hash'iyle server
kaydına bağlanır. Eski veya değiştirilmiş kabul ödeme başlatmaz.

## Ödeme ve sipariş durumu

Ödeme provider güvenli alanında yapılır. Client dönüş URL'si siparişi ödenmiş
saymaz; yalnız doğrulanmış callback ve server finalizasyonu ödeme durumunu
kesinleştirir. Başarısız veya doğrulanamayan işlem satışın başarıyla
tamamlandığı anlamına gelmez.

## Teslimat

Satıcı ürünü, onaylı teslimat koşulları ve işlem özetindeki adrese uygun
biçimde gönderir. Stok/tahmini süre ve gecikme bildirimi gerçek operasyon
sözleşmesiyle uyumlu olmalıdır. İmkânsızlık halinde bildirim ve bedel iadesi
usulü profesyonel hukuk tarafından onaylanır.

## Cayma ve iade

Müşteri, uygulanabilir tüketici mevzuatındaki şart ve sürelerde cayma hakkını
kullanabilir. Bildirim kanalları, iade adresi, taşıyıcı, masraf, değer azalması
ve bedel iadesi İptal, İade ve Cayma Politikası ile işlem özelindeki satıcı
bilgisinde gösterilir.

Cayma hakkı istisnaları yalnız mevzuata ve ürünün gerçek niteliğine uygunsa
uygulanır; genel ve belirsiz bir istisna kabulü oluşturulmaz.

## Ayıp, garanti ve destek

Ayıplı mal, garanti veya satış sonrası taleplerinde müşterinin emredici
hakları saklıdır. Ürün/satıcı bazlı garanti bilgisi ve başvuru kanalı PDP,
sipariş veya destek akışında gösterilir.

## Kişisel veri ve delil

Kişisel veriler onaylı KVKK/Gizlilik metinleri ve gerçek veri envanterine göre
işlenir. Server kayıtları, agreement version/hash, provider referansı ve
işlem olayları yürürlükteki delil/saklama kuralları ölçüsünde tutulur.

## Uyuşmazlık

Tüketici başvuru mercileri, uygulanacak hukuk ve güncel parasal sınırlar
yayın tarihinde owner/profesyonel hukuk tarafından eklenip doğrulanmalıdır.
İletişim: {{business.email}} ve {{business.phone}}.

---

## 8. İptal, İade ve Cayma Politikası

Route: /iptal-iade-cayma-politikasi
Environment key: CANCELLATION_RETURN
Durum: DRAFT — RETURNS OPERATIONS / LEGAL REVIEW REQUIRED

### Taslak metin

# İptal, İade ve Cayma Politikası

Bu taslak, NovaStore siparişlerinde iptal, cayma ve iade taleplerinin genel
akışını açıklar. Ürünün satıcısı, ürün niteliği, teslim durumu ve uygulanabilir
mevzuat işlem bazında dikkate alınır.

## Sipariş iptali

Sipariş henüz satıcı tarafından işleme alınmamış veya kargoya verilmemişse
hesap/sipariş ekranındaki uygun akıştan iptal talebi oluşturulabilir. İptal
olanağı, siparişin gerçek server durumu ve satıcı operasyonuna göre belirlenir.

## Cayma bildirimi

Uygulanabilir tüketici işlemlerinde cayma hakkı, mevzuattaki süre ve koşullara
göre hesaplanır. Owner/profesyonel hukuk aksi onaylamadıkça taslak operasyon
hedefi teslimden itibaren 14 günlük başvuru penceresidir; nihai metin ürün
kategorisi ve mevzuatla doğrulanmalıdır.

Başvuru hesap destek akışı, {{business.email}}, {{business.kepAddress}} veya
onaylı diğer kalıcı veri saklayıcısı kanalıyla alınabilir.

## İade

İade edilecek ürünün, mevzuat ve olağan kullanım sınırı saklı kalmak üzere,
aksesuarları ve varsa ambalajıyla güvenli şekilde gönderilmesi istenebilir.
İade adresi ve taşıyıcı, işleme özel satıcı bilgisiyle verilir; statik başka
satıcının adresi kullanılmaz.

## İstisnalar

Kişiye özel, çabuk bozulabilen, hijyen koruması açılmış, teslimiyle ifa edilen
dijital içerik/hizmet gibi olası istisnalar yalnız yürürlükteki mevzuat,
önceden açık bilgilendirme ve ürünün gerçek niteliği birlikte karşılıyorsa
uygulanır.

## Bedel iadesi

İade/iptal onaylandığında bedel, ödeme sağlayıcısının ve mevzuatın izin verdiği
usul/süreyle aynı ödeme aracına yönlendirilir. Banka/provider yansıma süresi
ayrı olabilir. Refund sonucu client tarafından uydurulmaz; server/provider
kaydıyla izlenir.

## Hasarlı veya ayıplı ürün

Hasar, eksik ürün veya ayıp iddiası hesap destek akışından belge ve açıklamayla
iletilebilir. Müşterinin emredici seçimlik hakları bu politika ile
sınırlandırılmaz.

İletişim: {{business.email}} · {{business.phone}}.

---

## 9. Teslimat ve Kargo Koşulları

Route: /teslimat-ve-kargo-kosullari
Environment key: DELIVERY_SHIPPING
Durum: DRAFT — SHIPPING OPERATIONS / LEGAL REVIEW REQUIRED

### Taslak metin

# Teslimat ve Kargo Koşulları

Sipariş, müşterinin checkout sırasında seçtiği ve server tarafından sahipliği
doğrulanan teslimat adresine gönderilir. Müşteri adres ve iletişim bilgisini
güncel tutmalıdır.

Ürün bazlı satıcı, stok durumu, hazırlama süresi, tahmini teslimat ve kargo
bedeli PDP/checkout/sipariş ekranında gösterilir. Genel metin, işlem özelindeki
daha açık taahhüdü ortadan kaldırmaz.

Satıcı, siparişi onaylı operasyon süresinde taşıyıcıya teslim eder. Mevzuattaki
azami ifa süresi ve olası istisnalar profesyonel hukuk tarafından yayın
tarihinde doğrulanmalıdır; owner tarafından ayrıca daha kısa süre taahhüt
edilmişse bu taahhüt esas alınır.

Kargo takip bilgisi provider entegrasyonu mevcut olduğunda sipariş ekranında
server kaydından gösterilir. Gerçek tracking/provider kaydı olmadan sentetik
gönderi durumu oluşturulmaz.

Teslim sırasında görünür hasar varsa taşıyıcı prosedürüne uygun tutanak veya
kanıt oluşturulması önerilebilir. Tutanak bulunmaması müşterinin emredici
haklarını otomatik olarak ortadan kaldırdığı şeklinde yorumlanmaz.

Teslimatın imkânsızlaşması, kayıp veya önemli gecikmede müşteri bilgilendirilir;
iptal/iade ve bedel iadesi onaylı politika ile yürütülür.

Destek: {{business.email}} · {{business.phone}}.

---

## 10. İşlem Rehberi

Route: /islem-rehberi
Environment key: TRANSACTION_GUIDE
Durum: DRAFT — CUSTOMER FLOW / LEGAL REVIEW REQUIRED

### Taslak metin

# İşlem Rehberi

## Sipariş adımları

1. Ürün, satıcı/mağaza, fiyat, stok ve teslimat bilgilerini inceleyin.
2. Ürünü sepete ekleyin; adet, indirim ve kargo özetini kontrol edin.
3. Hesabınızla giriş yapın veya izin verilen müşteri akışını tamamlayın.
4. Size ait kayıtlı teslimat adresini seçin.
5. Ön Bilgilendirme Formu ve Mesafeli Satış Sözleşmesi'nin tam metnini,
   sürümünü ve işleme özel özetini okuyup onaylayın.
6. Etkin provider varsa güvenli ödeme alanına geçin.
7. Sipariş ve ödeme durumunu yalnız NovaStore hesap/sipariş ekranındaki
   server kaydından takip edin.

## Veri giriş hatalarının düzeltilmesi

Sepet adedi, adres ve izin verilen hesap bilgileri checkout tamamlanmadan
değiştirilebilir. Ödeme başlatıldıktan sonra eski agreement snapshot'ı veya
değişmiş sepet/adres yeniden doğrulanır; uyuşmazlıkta yeni özet/onay gerekir.

## Sözleşmenin saklanması ve erişim

Kabul edilen checkout belgelerinin sürüm, tam metin, context ve hash snapshot'ı
server payment/order kaydına bağlanır. Müşteriye sunulacak erişim/indirme ve
saklama süresi, profesyonel hukuk ve veri saklama politikasıyla onaylanmalıdır.

## Dil ve teknik koruma

Customer arayüzünün ve sözleşmelerin temel dili Türkçedir. Oturum, owned
address, server pricing, provider callback ve idempotency kontrolleri işlem
güvenliği için kullanılır.

## Satıcı ve pazaryeri

Ürünün satıcısı PDP, mağaza ve checkout sözleşme özetinde gösterilir.
NovaStore'un pazaryeri/aracı hizmet sağlayıcı rolü ile satıcının ürün/satış
yükümlülüğü ayrı açıklanır.

Destek: {{business.email}} · {{business.phone}} · {{business.customerDomain}}.

---

## 11. Pazaryeri ve Aracı Hizmet Sağlayıcı Bilgilendirmesi

Route: /pazaryeri-bilgilendirmesi
Environment key: MARKETPLACE_DISCLOSURE
Durum: DRAFT — MARKETPLACE MODEL / LEGAL / PAYTR REVIEW REQUIRED

### Taslak metin

# Pazaryeri ve Aracı Hizmet Sağlayıcı Bilgilendirmesi

NovaStore, {{business.legalCompanyName}} tarafından {{business.tradeName}}
ticari adıyla işletilen çok satıcılı bir elektronik ticaret pazaryeri
platformudur.

Platform kimliği:

- VKN: {{business.taxNumber}}
- MERSİS: {{business.mersisNumber}}
- Adres: {{business.registeredAddress}}
- KEP: {{business.kepAddress}}
- İletişim: {{business.phone}} · {{business.email}}
- Web: {{business.customerDomain}}

## Satıcının kimliği

Her ürünün satışını yapan bağımsız satıcı/mağaza PDP, mağaza sayfası ve
checkout'a özel işlem özetinde gösterilir. Checkout snapshot'ı yalnız
organization-bound, admin-approved, versioned public seller legal identity
kullanır. Seller application beyanı, private belge veya payout verisi doğrudan
Customer disclosure kaynağı değildir.

## Platformun rolü

NovaStore ürünlerin listelenmesi, müşteri ve satıcı akışlarının teknik olarak
buluşturulması, sepet/checkout bağlamının oluşturulması, payment provider
handoff'ı ve destek koordinasyonu için altyapı sağlar. NovaStore'un ödeme
tahsilatı, aracı hizmet sağlayıcı yükümlülükleri ve satıcı adına hareket ettiği
alanlar gerçek PayTR Pazaryeri sözleşmesi ve profesyonel hukuk incelemesinde
kesinleştirilmelidir.

## Fiyat ve sipariş

Fiyat, indirim, stok ve seller dağılımı backend tarafından doğrulanır. Client
fiyatı veya browser result route ödeme otoritesi değildir. Siparişin satıcı
bazlı operasyonu server order/seller projection kayıtlarına dayanır.

## Sorumluluk ve başvuru

Satıcı; ürünün hukuka uygunluğu, açıklaması, stok, teslimat, garanti ve satış
sonrası yükümlülüklerinden onaylı sözleşmeler kapsamındaki ölçüde sorumludur.
NovaStore'un emredici mevzuattan doğan sorumlulukları bu metinle kaldırılamaz.

Müşteri önce hesap/support akışından veya {{business.email}} üzerinden talep
iletebilir. Talep ilgili seller ve yetkili NovaStore operasyonuna tenant/customer
sınırları korunarak yönlendirilir.

## Sıralama, yorum ve ticari iletişim

Ürün sıralama, sponsorlu içerik, yorum doğrulaması, tavsiye sistemi ve varsa
ticari iletişim davranışı gerçek ürün tasarımı/veri envanterine göre ayrı ve
şeffaf açıklanmalıdır. Bu taslak mevcut olmayan özellik iddiası oluşturmaz.

---

## 12. Satıcı Sözleşmesi

Route: /satici-sozlesmesi
Environment key: SELLER_AGREEMENT
Durum: DRAFT — SELLER-FACING OWNER / LEGAL / OPERATIONS REVIEW REQUIRED

### Taslak metin

# Satıcı Sözleşmesi

Bu taslak, {{business.legalCompanyName}} tarafından {{business.tradeName}}
adıyla işletilen NovaStore pazaryerine kabul edilen satıcılarla kurulacak
ilişkinin genel çerçevesini oluşturur. Satıcıya özel şirket, yetkili kişi,
banka/KYC ve ücret bilgileri bu public genel metne hard-code edilmez; yetkili
Seller/Admin sözleşme ve onboarding kaydında tutulur.

## Başvuru ve kimlik doğrulama

Satıcı doğru, güncel ve doğrulanabilir şirket/iletişim bilgisi sunar.
Başvurunun alınması otomatik kabul, yayın veya merchant/PayTR onayı değildir.
NovaStore gerekli inceleme ve admin onayı olmadan mağazayı aktif etmez.

Customer'a gösterilecek seller public legal identity; organization'a bağlı,
versioned ve admin-approved kayıttan gelir. Private belgeler, payout bilgileri
ve başvuru içeriği public disclosure olarak kullanılmaz.

## Ürün ve içerik

Satıcı listelediği ürünün hukuka uygunluğu, gerçek nitelikleri, fiyatı, stok
durumu, görselleri, fikri hakları, garanti ve zorunlu açıklamalarından
sorumludur. Yasaklı, yanıltıcı, sahte veya hak ihlali oluşturan ürün/içerik
yayınlanamaz.

## Sipariş ve ifa

Satıcı kendi organization/store kapsamındaki seller order'ları görür ve
yalnız yetkili durum geçişlerini yapar. Hazırlama, kargo, takip, teslimat,
iptal, iade ve müşteri desteği onaylı SLA/operasyon kurallarına uygun
yürütülür. Başka seller veya Customer'ın özel verisine erişilemez.

## Fiyat, komisyon ve settlement

Komisyon oranı, hizmet bedeli, vergi, valör, bloke, mahsup, refund/chargeback
ve ödeme takvimi satıcıya özel onaylı ticari ek ve gerçek provider sözleşmesinde
belirlenir. Kod içindeki seller ledger/settlement kaydı PayTR'ın gerçek para
transferi veya alt üye işyeri onayı değildir.

## İade ve müşteri hakları

Satıcı, uygulanabilir tüketici mevzuatı, onaylı cayma/iade politikası ve
ürünün niteliğine göre müşteri taleplerini zamanında işler. Emredici müşteri
hakları sözleşmeyle daraltılamaz.

## Veri koruma ve güvenlik

Satıcı müşteri verisini yalnız ilgili siparişin ifası, destek ve yasal
yükümlülük için kullanır; yetkisiz paylaşım, pazarlama veya başka amaçla
kullanamaz. Erişim hesapları kişiseldir; güvenlik olayı derhal bildirilir.
Tarafların veri sorumlusu/veri işleyen rolleri profesyonel hukuk ve gerçek veri
akışına göre ayrıca düzenlenir.

## Denetim, askıya alma ve fesih

Hukuk/güvenlik riski, sahtecilik, müşteri zararı, gecikme veya sözleşme ihlali
halinde ölçülü listeleme durdurma, mağaza askıya alma, inceleme ve fesih
mekanizması uygulanabilir. Savunma/itiraz, kayıt saklama ve settlement sonucu
onaylı prosedürde açıklanır.

## Bildirim ve değişiklik

Platform bildirimleri onaylı Seller kanalları üzerinden yapılır. Sözleşme
değişiklikleri versioned/published revision ve uygulanabilir bildirim/kabul
mekanizmasıyla yürütülür. NovaStore iletişimi:
{{business.registeredAddress}}, {{business.kepAddress}},
{{business.email}}, {{business.phone}}.

Uygulanacak hukuk, uyuşmazlık çözümü, yetkili merci, ücret eki, SLA, KYC ve
provider transfer eki profesyonel hukuk/finans/operasyon tarafından gerçek
modelle tamamlanmadan bu taslak APPROVED yapılmamalıdır.

---

## Owner ve hukuk onay kontrolü

Her 12 rota için ayrı ayrı:

- [ ] Gerçek BusinessIdentity alanları doğrulandı.
- [ ] Metin gerçek iş modeli ve veri/çerez/provider envanteriyle karşılaştırıldı.
- [ ] Satıcı/pazaryeri rolü ve PayTR modeli doğrulandı.
- [ ] Süre, istisna, merci ve operasyon vaatleri güncellendi.
- [ ] Sürüm kimliği belirlendi.
- [ ] Owner onayı kaydedildi.
- [ ] Profesyonel hukuk onayı kaydedildi.
- [ ] TEXT, VERSION ve APPROVED aynı release değişikliğinde yetkili runtime'a verildi.
- [ ] Public rota ve footer/header bağlantısı doğrulandı.
- [ ] Eski sürüm/snapshot saklama ve erişim politikası doğrulandı.

Bu kontroller tamamlanana kadar LEGAL_DRAFT_CONTENT_READY yalnız DRAFT_READY,
OWNER_LEGAL_REVIEW_REQUIRED ise YES durumundadır.
