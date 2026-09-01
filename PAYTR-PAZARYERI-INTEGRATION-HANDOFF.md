# PayTR Pazaryeri Entegrasyon Handoff'u

Durum: dış sağlayıcı ve şirket sahibi girdileri bekleniyor

Bu belge kod ekibinden şirket sahibi, hukuk/finans/operasyon sorumluları ve PayTR entegrasyon yetkilisine aktarılacak sınırı tanımlar. PayTR ürün modeli, şirket bilgisi, komisyon, valör, bloke, transfer veya merchant değeri burada tahmin edilmez.

## Kod Ekibinden Teslim Edilen Taban

- Kart sağlayıcısı açıkça `PAYMENT_PROVIDER=paytr` seçilir; başka değer kabul edilmez.
- `PAYTR_LIVE_REQUESTS_ALLOWED=false` ile dış token isteği güvenli biçimde kapalıdır.
- Resmi token endpoint'i ve iFrame origin/path'i allowlist ile sabittir.
- Merchant secret'ları yalnız runtime secret sınırından okunur; response veya dokümana yazılmaz.
- Checkout gerçek customer session, server fiyatı, sahibi olunan `addressId`, idempotency ve sürümlü sözleşme kabulü kullanır.
- PayTR callback hash/tutar/provider/referans kontrolü ve transaction/idempotency finalizasyonu mevcuttur.
- Client success/fail dönüşü ödeme otoritesi değildir.
- Başarılı callback, uygun durumda canonical sipariş ve iç seller-order projeksiyonunu oluşturur.

Bu maddeler provider hesabının açıldığını veya gerçek transferin bulunduğunu göstermez.

## Dışarıdan Doldurulacak Handoff Paketi

| Paket | Sorumlu | Beklenen kanıt | Durum |
|---|---|---|---|
| Doğrulanmış tüzel/gerçek kişi işletme kimliği | Şirket sahibi | Ticari unvan, VKN, MERSİS, kayıtlı adres, KEP, telefon, e-posta için yetkili kaynak | `EXTERNAL_REQUIRED` |
| Public müşteri alan adı | Şirket sahibi / deployment | Sahipliği doğrulanmış HTTPS origin ve erişilebilir public site | `EXTERNAL_REQUIRED` |
| Hukuk metinleri | Şirket sahibi + hukuk onayı | Ön bilgilendirme ve mesafeli satış için onay kaydı, sürüm ve yayımlanacak tam metin | `EXTERNAL_REQUIRED` |
| PayTR başvuru durumu | Şirket sahibi + PayTR | Başvuru referansı/durumu ve yetkili muhatap üzerinden yazılı doğrulama | `EXTERNAL_REQUIRED` |
| Uygulanacak PayTR ürün modeli | PayTR | Standart üye işyeri/pazaryeri ayrımı ve NovaStore için geçerli teknik-sözleşmesel model | `EXTERNAL_REQUIRED` |
| Merchant credential teslimi | PayTR + secret yöneticisi | `PAYTR_MERCHANT_ID`, key ve salt'ın Git dışı secret manager'a yetkili teslimi | `EXTERNAL_REQUIRED` |
| Callback ve dönüş URL'leri | Deployment + PayTR | Public HTTPS URL'lerin PayTR panelinde doğrulanmış eşleşmesi | `EXTERNAL_REQUIRED` |
| Provider UAT | QA + PayTR | Ayrı yetkili ortamda senaryo matrisi ve redakte edilmiş işlem kanıtı | `EXTERNAL_REQUIRED` |
| Marketplace transfer sözleşmesi | Finans/hukuk + PayTR | Alt üye işyeri, KYC, split/komisyon, bloke/valör, transfer, iade ve chargeback kuralları | `EXTERNAL_REQUIRED` |
| Operasyonel sahiplik | Finans/operasyon/destek | Mutabakat, refund, chargeback, alarm ve müşteri desteği runbook'u | `EXTERNAL_REQUIRED` |
| Production açılış | Yetkili go/no-go kurulu | İmzalı/onaylı açılış kaydı, rollback sahibi ve izleme kanıtı | `EXTERNAL_REQUIRED` |

## PayTR ile Yazılı Netleştirilecek Pazaryeri Konuları

Aşağıdaki soruların yanıtı kaynak koddan çıkarılamaz:

1. NovaStore'un PayTR nezdindeki hukuki/teknik rolü nedir?
2. Satıcıların alt üye işyeri veya eşdeğer sağlayıcı kaydı gerekiyor mu; onboarding/KYC sahibi kimdir?
3. Tahsilat anında split mi uygulanır, yoksa sağlayıcı tarafından başka bir settlement/transfer modeli mi kullanılır?
4. Komisyon, hizmet bedeli, vergi ve yuvarlama kuralları hangi sözleşme sürümüne bağlıdır?
5. Bloke, valör, minimum transfer, transfer takvimi ve banka hesabı sahipliği nasıl doğrulanır?
6. İptal, kısmi/tam iade, chargeback ve başarısız/geç callback satıcı bakiyesini nasıl etkiler?
7. Provider işlem kimlikleri, settlement raporları ve mutabakat dosyaları nasıl alınır?
8. Sandbox/test modu hangi senaryoları destekler ve production'a geçiş kabul kriteri nedir?
9. Secret rotasyonu, IP/domain allowlist, callback tekrar politikası ve olay müdahale kanalı nedir?

Yanıtlar yetkili PayTR kaynağı ve imzalı sözleşmeyle eşleştirilmeden kod veya ortam değişkenine çevrilmez.

## URL Handoff'u

Kodda callback route'u `/api/payments/webhook/paytr` olarak mount edilir. Gerçek `PAYTR_CALLBACK_URL`, doğrulanmış public HTTPS origin ile bu route'un tam birleşimidir; bu belgede domain uydurulmaz. `PAYTR_SUCCESS_URL` ve `PAYTR_FAIL_URL` yalnız kullanıcıyı NovaStore sonuç akışına döndürür ve callback'in yerine geçmez.

Token isteği hedefi değiştirilemez:

```text
https://www.paytr.com/odeme/api/get-token
```

PayTR başka bir endpoint veya ürün sözleşmesi bildirirse bu, ortam değişkeniyle sessizce override edilmez; ayrı kod, güvenlik ve sözleşme incelemesi açılır.

## Yetkili Aktivasyon Sırası

1. Şirket kimliği ve public domain yetkili kaynaklarla doğrulanır.
2. Hukuk metinleri onaylanır, sürümlenir ve public sayfalarda yayımlanır.
3. PayTR başvuru/ürün modeli ve Pazaryeri transfer sözleşmesi yazılı netleşir.
4. Credential'lar yalnız secret manager'a teslim edilir; dosya, ticket, ekran görüntüsü veya loga kopyalanmaz.
5. Public callback/success/fail URL'leri deployment ve PayTR panelinde doğrulanır.
6. Ayrı provider UAT ortamında kontrollü test yapılır; production verisi kullanılmaz.
7. Callback, status, mutabakat, refund/chargeback, izleme ve rollback kanıtları gözden geçirilir.
8. Yetkili go/no-go alınır. Ancak bundan sonra ilgili runtime'da `PAYTR_LIVE_REQUESTS_ALLOWED=true` değerlendirilebilir.

Her adım bağımsız kapıdır. Bir adımın tamamlanması sonraki adıma otomatik yetki vermez.

## Acil Kapatma Sınırı

Yeni token isteklerini durdurmanın fail-closed kontrolü `PAYTR_LIVE_REQUESTS_ALLOWED=false` değeridir. Bu kontrol geçmiş tahsilatların callback, mutabakat, refund veya chargeback yükümlülüğünü ortadan kaldırmaz. Üretim acil durdurması için deployment, provider paneli ve finans/operasyon koordinasyonu ayrıca tanımlanmalıdır.

## Handoff Tamamlanma Tanımı

Handoff ancak dış paketlerin her biri gerçek yetkili kanıtla kapandığında, redakte edilmiş UAT paketi incelendiğinde ve production go/no-go ayrıca verildiğinde tamamlanır. Bu dosyanın varlığı tek başına PayTR başvurusu, merchant onayı, transfer yetkisi veya ilk satış izni değildir.
