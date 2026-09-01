# First Real Payment UAT Runbook

Durum: PLAN_ONLY — EXECUTION_FORBIDDEN_IN_THIS_WAVE
Tarih: 1 Eylül 2026

REAL_CARD_USE_THIS_WAVE: FORBIDDEN

Bu belge gelecekteki yetkili provider UAT'ı ve ancak bütün kapılar kapandıktan
sonra ayrıca onaylanabilecek düşük tutarlı gerçek ödeme için plandır. Bu belge
payment, refund, deployment veya provider erişim yetkisi vermez.

## Giriş kapıları

- [ ] PayTR Pazaryeri onayı ve uygulanacak ürün modeli yazılı doğrulandı.
- [ ] Credential'lar PAYTR-CREDENTIAL-INJECTION-RUNBOOK.md ile güvenli teslim edildi.
- [ ] Public Customer/backend HTTPS deployment'ı hazır.
- [ ] Gerçek BusinessIdentity ve owner/legal onaylı 12 public metin hazır.
- [ ] pre-information ve distance-sale checkout belgeleri published.
- [ ] Approved seller public legal identity her test seller için mevcut.
- [ ] UAT veritabanı/tenant/customer/seller ürünleri kontrollü ve ayrıştırılmış.
- [ ] Gerçek production customer, order veya stok kaydı kullanılmıyor.
- [ ] Callback URL ve proxy topolojisi provider paneliyle eşleşiyor.
- [ ] Gözlemleme, redaction, kill switch, rollback ve incident sahipleri hazır.
- [ ] Finans/settlement/refund operasyon sahibi hazır.

## Zorunlu gelecek sıra

### 1. PayTR Pazaryeri approval

Beklenen kanıt: Provider'ın yetkili kanalından başvuru durumu, uygulanacak
marketplace ürünü ve gerekli seller/transfer sözleşmesinin yazılı doğrulaması.
Kod içindeki seller ledger bu kanıtın yerine geçmez.

### 2. Production/test credential'ların güvenli sağlanması

Beklenen kanıt: Secret değeri göstermeyen secret-manager field configured
kaydı, erişim politikası ve rotasyon sahibi. Git/client/log secret sayısı sıfır.

### 3. Provider test mode

Kontrollü ortamda provider'ın izin verdiği test modu kullanılır.
PAYTR_LIVE_REQUESTS_ALLOWED yalnız onaylı test penceresinde açılır. Production
runtime'da PAYTR_TEST_MODE=true init'i reddetmeye devam etmelidir.

### 4. Başarılı test ödeme

Ön koşul:

- owner-bound address,
- server-priced stoklu ürün,
- geçerli seller public identity,
- güncel iki agreement snapshot kabulü.

Beklenen:

- client kart verisi toplamaz,
- provider iframe session oluşur,
- browser success return tek başına PAID yapmaz,
- geçerli success callback ödeme ve commerce finalizasyonunu bir kez yapar,
- order/payment/provider reference ve agreement snapshot izlenebilir,
- stok, kupon, seller order ve Customer/Admin/Seller görünümü tutarlıdır.

### 5. Başarısız test ödeme

Beklenen:

- provider fail callback/status server kaydına işlenir,
- sipariş PAID olmaz,
- stok/kupon/seller projection başarı yan etkileri kesinleşmez,
- UI uydurma success veya bank pending göstermez,
- retry politikası aynı siparişi çoğaltmaz.

### 6. Geçersiz callback signature

Beklenen:

- callback reddedilir,
- payment/order durumu değişmez,
- başarı yan etkisi sıfır,
- redakte edilmiş güvenlik olayı/metric oluşur,
- secret veya full callback body loglanmaz.

### 7. Duplicate callback

Beklenen:

- aynı callback idempotent no-op olur,
- ikinci order/payment/seller order/stock/notification oluşmaz,
- provider response sözleşmesi tekrar teslimi güvenle sonlandırır.

### 8. Amount mismatch

Beklenen:

- provider amount ile server expected amount uyuşmazlığı finalizasyonu engeller,
- sipariş PAID olmaz,
- finans/mutabakat eskalasyonu tetiklenir,
- client tutarı hiçbir koşulda otorite olmaz.

### 9. Order idempotency

Test:

- aynı initialize/idempotency bağlamını tekrar gönder,
- success/fail browser dönüşünü tekrar aç,
- status endpoint'i tekrar sorgula.

Beklenen:

- duplicate canonical order sıfır,
- duplicate provider payment sıfır,
- status yalnız authenticated owner'a döner.

### 10. Stock result

Başarı ve eşzamanlı stok azalması senaryoları ayrı çalıştırılır.

Beklenen:

- fiyat/stok callback öncesi son server bağlamıyla korunur,
- yetersiz stokta yanlış PAID commerce state oluşmaz,
- başarı yan etkisi yalnız bir kez,
- stok negatif olmaz,
- gerekli mutabakat durumu açık ve izlenebilir.

### 11. Seller/Admin/Customer propagation

Beklenen:

- Customer yalnız kendi order/payment durumunu görür,
- Seller yalnız organization/store kapsamında kendi seller order'ını görür,
- Admin yetkili operasyon görünümünü görür,
- başka customer veya seller'ın özel verisi sızmaz,
- bildirim target'ları typed/authorized olur,
- UI durumları aynı server truth'tan türetilir.

### 12. Refund ve partial refund

Yalnız provider sözleşmesi destekliyor ve owner ayrıca yetki veriyorsa
çalıştırılır.

Beklenen:

- refund yetkisi server/admin operasyon sınırında,
- tutar original captured amount'ı aşmaz,
- duplicate refund engellenir,
- partial refund kalan tutarı doğru izler,
- order/seller/finance/customer durumları tutarlı,
- chargeback/mutabakat sahibi bilinir.

Desteklenmiyor veya provider sözleşmesi henüz yoksa sonuç
EXTERNAL_PROVIDER_CONTRACT_REQUIRED olarak kaydedilir; kod fake refund üretmez.

### 13. Açık owner onayından sonra düşük tutarlı gerçek ödeme

Bu adım test-mode başarısından otomatik doğmaz. Ayrı owner go/no-go, finans,
güvenlik, release ve rollback onayı gerekir.

Gerekli ek koşullar:

- production config ve secret erişimi bağımsız doğrulandı,
- test mode kapalı,
- gerçek düşük tutar ve gerçek kart sahibi açık onay verdi,
- kişisel verinin kanıt/log işleme planı onaylandı,
- anlık gözlemleme ve kill switch sahibi hazır,
- refund/void yolu hazır.

Bu R3 çalışmasında bu adım çalıştırılmaz.

## Kanıt şablonu

Her senaryo için yalnız şu metadata kaydedilir:

| Alan | Kural |
|---|---|
| Scenario ID | Kişisel olmayan internal ID |
| Environment | UAT veya production; açıkça belirtilir |
| Build/commit | Exact SHA |
| Started/finished at | UTC timestamp |
| Expected/actual result | Secret/PII içermeyen özet |
| Payment reference | Gerekirse redakte edilmiş |
| DB side-effect count | Tablo/sayı; satır içeriği değil |
| Callback result | Signature/amount/idempotency sınıfı |
| Reviewer | Yetkili rol; kişisel imza public repo'ya konmaz |
| Disposition | PASS, FAIL veya EXTERNAL_GATE |

Kart numarası, CVV, tam callback payload'ı, merchant key/salt, tam müşteri
adresi ve banka verisi kanıta alınmaz.

## Stop koşulları

Aşağıdakilerden birinde test durdurulur ve kill switch kapatılır:

- credential veya kişisel veri log sızıntısı,
- callback signature doğrulamasının atlanması,
- amount/ref/provider uyuşmazlığına rağmen PAID,
- duplicate order veya duplicate finansal yan etki,
- cross-customer/cross-seller veri görünümü,
- stock negatifliği veya belirsiz commerce finalizasyonu,
- public URL/proxy/certificate uyuşmazlığı,
- owner/provider yetkisinin geri çekilmesi.

## Bu dalganın sonucu

- PROVIDER_TEST_PAYMENT: NOT_RUN
- PROVIDER_FAILED_PAYMENT: NOT_RUN
- REFUND_UAT: NOT_RUN
- LOW_VALUE_REAL_PAYMENT: NOT_AUTHORIZED
- REAL_CARD_USE_THIS_WAVE: FORBIDDEN
