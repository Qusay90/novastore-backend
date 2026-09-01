# PayTR Credential Injection Runbook

Durum: FUTURE_AUTHORIZED_OPERATION_ONLY
Tarih: 1 Eylül 2026

Bu runbook planlamadır. Bu çalışmada credential alınmaz, yazılmaz, enjekte
edilmez, provider'a istek gönderilmez ve deployment yapılmaz.

## Güvenlik ilkeleri

1. PAYTR_MERCHANT_KEY ve PAYTR_MERCHANT_SALT yalnız server runtime secret
   manager'da bulunur.
2. Secret değerleri Git'e, .env.example içine, Markdown'a, ticket'a, chat'e,
   terminal çıktısına, test snapshot'ına veya client bundle'a yazılmaz.
3. PAYTR_MERCHANT_ID provider tanımlayıcısıdır; secret olmamasına rağmen
   gereksiz yere client'a veya public kanıta dahil edilmez.
4. Credential teslim eden kişi ile deployment yapan kişinin yetkisi kayda alınır.
5. Secret değerleri doğrulanırken yalnız adların mevcut/eksik sonucu raporlanır.
6. PAYTR_LIVE_REQUESTS_ALLOWED ayrı kill switch'tir; credential bulunması bu
   bayrağı otomatik açmaz.
7. Production'da PAYTR_TEST_MODE=true ödeme init'ini fail-closed tutar.

## Ön koşullar

- [ ] PayTR Pazaryeri başvurusu ve uygulanacak ürün modeli yazılı doğrulandı.
- [ ] Owner şirket ve banka girdileri PayTR'ın yetkili kanalında doğrulandı.
- [ ] https://novastore.tr public deployment'ı hazır ve izlenebilir.
- [ ] APP_BASE_URL exact HTTPS origin olarak doğrulandı.
- [ ] Callback path exact /api/payments/webhook/paytr olarak public erişilebilir.
- [ ] Success/fail URL'leri /payment-result.html veya /#/odeme/sonuc sözleşmesine uyuyor.
- [ ] PayTR panelindeki URL'ler runtime URL'leriyle eşleşiyor.
- [ ] NOVASTORE_TRUST_PROXY_HOPS gerçek topolojiden gözlenerek belirlendi.
- [ ] BusinessIdentity alanları owner tarafından doğrulandı.
- [ ] pre-information ve distance-sale belgeleri owner/legal onaylı yayımlandı.
- [ ] Ayrı kontrollü provider UAT ortamı, disposable test verisi ve rollback sahibi hazır.
- [ ] Log redaction, alarm ve incident kanalı hazır.

## Runtime alanları

| Alan | Sınıf | Kaynak | Not |
|---|---|---|---|
| PAYMENT_PROVIDER | Config | Release owner | Exact paytr |
| PAYTR_MERCHANT_ID | Provider identifier | PayTR | Server only |
| PAYTR_MERCHANT_KEY | Secret | PayTR | Secret manager, never print |
| PAYTR_MERCHANT_SALT | Secret | PayTR | Secret manager, never print |
| PAYTR_BASE_URL | Pinned public URL | Code | Exact https://www.paytr.com |
| PAYTR_CALLBACK_URL | Public HTTPS URL | Deployment + PayTR panel | Same APP_BASE_URL origin, exact callback path |
| PAYTR_SUCCESS_URL | Public HTTPS URL | Deployment + PayTR panel | Browser return, not payment authority |
| PAYTR_FAIL_URL | Public HTTPS URL | Deployment + PayTR panel | Browser return, not payment authority |
| PAYTR_TEST_MODE | Provider mode | UAT/release owner | Production payment init requires false |
| PAYTR_DEBUG_ON | Logging control | Security/release owner | No secret/personal payload logging |
| PAYTR_LIVE_REQUESTS_ALLOWED | Kill switch | Explicit owner/provider UAT authority | Default false |
| NOVASTORE_TRUST_PROXY_HOPS | Security config | Observed deployment topology | Never guess |

## Yetkili injection sırası

### A. Hazırlık

1. Change kaydı açılır; ortam, zaman, rollback sahibi ve onay verenler yazılır.
2. Secret manager içinde yalnız server service'in okuyabildiği alanlar hazırlanır.
3. PAYTR_LIVE_REQUESTS_ALLOWED false bırakılır.
4. Public URL, proxy, identity ve legal readiness adları/değer biçimleri
   secret göstermeyen preflight ile doğrulanır.
5. Production/client artifact içinde PAYTR_MERCHANT_KEY veya
   PAYTR_MERCHANT_SALT adına atanmış değer bulunmadığı doğrulanır.

### B. Credential teslimi

1. PayTR credential'ları yalnız provider'ın yetkili kanalından alınır.
2. Değerler kopyalanırken ekran paylaşımı, clipboard loglama ve command history
   kapatılmış güvenli yönetim yüzeyi kullanılır.
3. PAYTR_MERCHANT_ID, PAYTR_MERCHANT_KEY ve PAYTR_MERCHANT_SALT secret manager'a
   ayrı alanlar olarak girilir.
4. Kanıt yalnız alan adlarının configured olduğunu gösterir; değer veya uzunluk
   göstermez.
5. Yetkisiz kullanıcıların secret okuma/listeme yetkisi bulunmadığı doğrulanır.

### C. Aktivasyon öncesi

1. Service yeniden yapılandırılır; ancak live kill switch false kalır.
2. GET /api/payments/capability sonucu okunur. Bu endpoint ödeme başlatmaz.
3. credentials_required dışında kalan eksik durumlar kapatılır:
   client_ip_config_required, company_identity_required,
   legal_documents_required veya production_test_mode_forbidden.
4. Database'te ödeme/sipariş oluşmadığı ve PayTR token isteği gönderilmediği doğrulanır.
5. UAT için açık owner/provider onayı alınır.

### D. Yetkili provider UAT aktivasyonu

1. Kontrollü UAT penceresinde PAYTR_LIVE_REQUESTS_ALLOWED true yapılır.
2. Provider UAT modu ve production/test-mode ilişkisi onaylı planla eşleştirilir.
3. Sadece disposable UAT customer/address/cart kullanılır.
4. FIRST-REAL-PAYMENT-UAT-RUNBOOK.md içindeki senaryolar çalıştırılır.
5. Kanıtlar payment reference gibi kişisel olmayan minimum tanımlayıcıyla
   redakte edilir; callback payload'ı veya secret kaydedilmez.

## Beklenen capability sözleşmesi

### CONFIG ABSENT

- capability ready false,
- state provider_not_configured veya credentials_required,
- initialize 503,
- PayTR token ağ isteği 0,
- payment/order DB mutation 0,
- fake success/pending sonucu 0.

### CONFIG PRESENT, AKTİVASYON KAPALI

- capability ready false,
- state activation_required,
- initialize 503,
- dış token isteği 0.

### CONFIG PRESENT, TÜM KAPILAR AÇIK

- provider paytr,
- capability ready true,
- yalnız yetkili customer ve geçerli agreement snapshot ile provider session
  initialization allowed,
- client'a credential değil yalnız güvenli iframe handoff bilgisi döner,
- ödeme sonucu yine yalnız doğrulanmış callback ile kesinleşir.

## Hata ve rollback

Herhangi bir credential sızıntısı, URL uyuşmazlığı, test-mode hatası, proxy
belirsizliği, signature/amount mismatch veya beklenmeyen DB yan etkisinde:

1. PAYTR_LIVE_REQUESTS_ALLOWED false yapılır.
2. Yeni ödeme init trafiği durdurulur.
3. Provider credential'ları yetkili kanal üzerinden rotate/revoke edilir.
4. Secret manager erişim logları incelenir; değerler kanıta kopyalanmaz.
5. Etkilenen payment/order kayıtları salt-okunur mutabakatla belirlenir.
6. Incident ve provider eskalasyon sahibi bilgilendirilir.
7. Kök neden ve düzeltme bağımsız doğrulanmadan kill switch yeniden açılmaz.

## Bu dalganın durumu

- PAYTR_CREDENTIAL_INJECTION: NOT_DONE
- PAYTR_LIVE_REQUESTS: NOT_AUTHORIZED
- PAYTR_PROVIDER_UAT: NOT_DONE
- REAL_CARD_USE_THIS_WAVE: FORBIDDEN
- DEPLOYMENT: NOT_DONE
