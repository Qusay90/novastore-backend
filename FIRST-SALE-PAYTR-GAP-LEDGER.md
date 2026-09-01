# İlk Satış PayTR Gap Ledger

Güncelleme: 1 Eylül 2026

## Durum Özeti

Kod/dokümantasyon tabanı review-ready olsa da gerçek ilk satış için dış kapılar açıktır. Bu ledger gerçek PayTR credential'ı, provider çağrısı, ödeme, sipariş, deployment veya başvuru işlemi yapıldığını göstermez.

### Sınıflandırma

- `FIRST_SALE_BLOCKER`: İlk satıştan önce korunması zorunlu kod, güvenlik veya veri-bütünlüğü sözleşmesi. Kaynakta karşılanmış olması sınıfı değiştirmez; eksikliği ya da regresyonu ilk satışı durdurur.
- `EXTERNAL_PAYTR_GATE`: PayTR başvurusu, merchant/ürün modeli, credential, provider sözleşmesi veya yetkili provider UAT kanıtı gerektirir.
- `EXTERNAL_COMPANY_GATE`: Şirket sahibi, hukuk, deployment, finans/operasyon, güvenlik veya yetkili release sahibinin gerçek değer, yayın, prosedür ya da onayı gerekir.
- `POST_LAUNCH_ALLOWED`: İlk satış güvenliğini etkilemeden sonrasına bırakılabileceği açıkça kabul edilen iş.

Her finding tam olarak bir sınıfa atanır. Birden çok bağımlılığı olan satırda sınıf, kapatma kanıtının birincil yetki sahibine göre seçilir; bağımlılıklar ikinci bir sınıf oluşturmaz. Direct API ile tam etkileşimli gerçek-card Nova Kart deneyimi, ilk satış için gerekli olmadığı ve PayTR-hosted/iFrame yaklaşımı hassas veriyi NovaStore dışında tuttuğu için açıkça ilk satış sonrasına bırakılmıştır.

### Kesin Sınıf Toplamları

| Sınıf | Finding sayısı |
|---|---:|
| `FIRST_SALE_BLOCKER` | 7 |
| `EXTERNAL_PAYTR_GATE` | 3 |
| `EXTERNAL_COMPANY_GATE` | 7 |
| `POST_LAUNCH_ALLOWED` | 1 |
| Toplam | 18 |

## Ledger

| ID | Gap / karar | Sınıf | Güncel kanıt durumu | Sahip | Kapatma kanıtı |
|---|---|---|---|---|---|
| FS-PAYTR-001 | Kart provider'ı açık seçilmeli; varsayılan/mock fallback olmamalı | `FIRST_SALE_BLOCKER` | Kaynakta mevcut | Backend | `PAYMENT_PROVIDER=paytr`; allowlist yalnız `paytr`; başka/eksik değer fail-closed |
| FS-PAYTR-002 | Dış token isteği varsayılan olarak kapalı olmalı | `FIRST_SALE_BLOCKER` | Kaynakta mevcut | Backend + deployment | `PAYTR_LIVE_REQUESTS_ALLOWED=false`; ayrı aktivasyon guard'ı |
| FS-PAYTR-003 | Provider endpoint'i ortam değişkeniyle başka hosta yönlendirilememeli | `FIRST_SALE_BLOCKER` | Kaynakta mevcut | Backend/security | Sabit `https://www.paytr.com/odeme/api/get-token` ve resmi iFrame origin/path kontrolü |
| FS-PAYTR-004 | Checkout serbest metin adres yerine gerçek owned adres kullanmalı | `FIRST_SALE_BLOCKER` | Kaynakta mevcut | Customer/backend | Pozitif `addressId`; `customer_addresses.id + user_id` sahiplik sorgusu; canonical adres server'dan |
| FS-PAYTR-005 | Gerçek BusinessIdentity ödeme öncesi zorunlu olmalı | `EXTERNAL_COMPANY_GATE` | Doğrulanmış gerçek değerler bekleniyor | Şirket sahibi | Yetkili kaynaktan doğrulanmış unvan, VKN, MERSİS, adres, KEP, telefon, e-posta, public müşteri origin'i |
| FS-PAYTR-006 | Checkout metinleri sahibi/hukuk onaylı ve sürümlü olmalı | `EXTERNAL_COMPANY_GATE` | Onaylı sürüm ve metinler bekleniyor | Şirket sahibi + hukuk | Ön bilgilendirme ve mesafeli satış için `APPROVED=true`, gerçek sürüm, tam metin ve onay kaydı |
| FS-PAYTR-007 | PayTR başvuru/merchant onayı, panel kaydı ve credential teslimi | `EXTERNAL_PAYTR_GATE` | PayTR/credential kanıtı bekleniyor | Şirket sahibi + PayTR + secret yöneticisi | Yazılı başvuru/onay ve URL kayıt durumu; secret manager teslim kaydı; credential değeri ledger'a yazılmaz |
| FS-PAYTR-008 | Public HTTPS callback/success/fail rotaları yayımlanmalı | `EXTERNAL_COMPANY_GATE` | Deployment kanıtı bekleniyor | Deployment sahibi | Sahipliği doğrulanmış domain, public rota erişimi ve TLS kanıtı |
| FS-PAYTR-009 | Callback ödeme finalizasyonunun tek otoritesi olmalı | `FIRST_SALE_BLOCKER` | Kaynakta mevcut | Backend/security | Hash/ref/provider/tutar doğrulaması, idempotency, transaction lock, success/fail sayfasının write yapmaması |
| FS-PAYTR-010 | Provider callback ve commerce yan etkileri gerçek ortamda doğrulanmalı | `EXTERNAL_PAYTR_GATE` | Yetkili provider UAT kanıtı bekleniyor | QA + backend + PayTR | Yetkili UAT'ta başarı/başarısızlık/duplicate/geç/karşıt/tutar uyuşmazlığı/timeout ve stok-kupon-sipariş kanıtı |
| FS-PAYTR-011 | Provider tahsilatı ile commerce finalizasyonu ayrılmalı | `FIRST_SALE_BLOCKER` | Kaynakta mevcut | Backend + operasyon | `providerFinalized`, `commerceFinalized`, açık reconciliation ve retry engeli kaynak sözleşmesi |
| FS-PAYTR-012 | PayTR Pazaryeri satıcı transfer modeli tanımlanmalı | `EXTERNAL_PAYTR_GATE` | Yetkili PayTR sözleşmesi bekleniyor | PayTR + finans + hukuk | Uygulanacak ürün modeli; satıcı/KYC; split/komisyon; valör/bloke; transfer; iade/chargeback sözleşmesi |
| FS-PAYTR-013 | İç seller ledger/settlement gerçek provider transferi sanılmamalı | `FIRST_SALE_BLOCKER` | Kaynak sınırı mevcut | Seller/backend + finans | İç kayıtların yalnız projection/read model olduğu; provider transfer executor bulunmadığı review kaydı |
| FS-PAYTR-014 | Refund, chargeback ve mutabakat operasyonu sahiplenilmeli | `EXTERNAL_COMPANY_GATE` | Operasyon kabulü bekleniyor | Finans + operasyon + destek | Yetki matrisi, SLA, provider panel prosedürü, ledger/order reconciliation ve müşteri iletişim runbook'u |
| FS-PAYTR-015 | İzleme, alarm, secret rotasyonu ve olay müdahalesi | `EXTERNAL_COMPANY_GATE` | Operasyonel kanıt bekleniyor | SRE/security | Redakte log/metric alarmları, callback hata eşiği, rotasyon prosedürü, olay iletişim kanalı |
| FS-PAYTR-016 | Production deploy ve ilk satış için ayrı go/no-go | `EXTERNAL_COMPANY_GATE` | Yetkili onay bekleniyor | Yetkili release/işletme sahibi | Deployment kimliği, yedek/rollback, izleme, finans/operasyon nöbeti ve imzalı go/no-go |
| FS-PAYTR-017 | İlk gerçek satış ve settlement uçtan uca kanıtı | `EXTERNAL_COMPANY_GATE` | Yetkili production yürütme ve mutabakat bekleniyor | İşletme sahibi + finans + operasyon | Yetkili production işlem referansı, provider callback, order, tahsilat, settlement/transfer ve mutabakatın redakte kanıtı |
| FS-PAYTR-018 | Direct API kullanan tam etkileşimli gerçek-card Nova Kart deneyimi | `POST_LAUNCH_ALLOWED` | Bilinçli olarak uygulanmadı; ilk satış için PayTR-hosted/iFrame sınırı seçildi | Ürün + güvenlik + ödeme ekibi | İlk satış sonrasında ayrı kapsam, PCI/güvenlik incelemesi, provider desteği ve açık yetki |

## Bağımlılık Sırası

```text
Şirket kimliği + public domain + hukuk onayı
  -> PayTR başvuru ve ürün/pazaryeri sözleşmesi
  -> secret manager + public callback kaydı
  -> ayrı yetkili provider UAT
  -> operasyon/mutabakat/refund/izleme kabulü
  -> production go/no-go
  -> kontrollü ilk gerçek satış ve settlement kanıtı
```

Bir satırın kapanması sonraki satıra otomatik yetki vermez. Özellikle `PAYTR_LIVE_REQUESTS_ALLOWED=true`, yalnız provider UAT veya production çalışma zamanının ayrıca yetkilendirilmiş aktivasyon adımıdır.

## Fail-Closed Varsayılan

Aşağıdakiler sağlanmadığı sürece kart ödeme capability'si hazır görünmemelidir:

- `PAYMENT_PROVIDER=paytr`,
- eksiksiz PayTR config ve resmi endpoint,
- açıkça yetkilendirilmiş live-request bayrağı,
- eksiksiz gerçek BusinessIdentity,
- yayımlanmış ve aynı sürümde kabul edilmiş iki checkout belgesi.

İlk güvenli staging provider UAT değildir: staging politikası dış ödeme yan etkilerini ve provider credential'larını kapalı tutar. Staging görünüm/inceleme kanıtı, PayTR çağrısı veya FCM benzeri dış servis UAT'ı olarak raporlanamaz.

## Kapanış Kuralı

Bu ledger ancak tüm `FIRST_SALE_BLOCKER` sözleşmeleri doğrulanmış durumda kaldığında, tüm `EXTERNAL_PAYTR_GATE` ve `EXTERNAL_COMPANY_GATE` satırları gerçek yetkili kanıtla kapandığında ve production ilk satış için ayrı onay verildiğinde “ilk satış kapandı” durumuna geçebilir. `POST_LAUNCH_ALLOWED` sınıfına yeni bir satır eklenmesi, ertelemenin neden ilk satış güvenliğini etkilemediğini ve karar sahibini açıkça gerektirir. Doküman, örnek env veya birim/smoke test sonucu tek başına bu kapanışı sağlayamaz.
