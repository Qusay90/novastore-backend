# Owner Business Identity Girdisi

Durum: OWNER_REAL_DATA_REQUIRED
Tarih: 1 Eylül 2026

Bu dosya veri toplama şablonudur. Gerçek değerler Git'e, bu belgeye, ekran
görüntüsüne veya genel loga yazılmaz. Owner tarafından doğrulanan değerler
yalnız yetkili runtime yapılandırma/secret kanalı üzerinden sağlanır.

## Kanonik BusinessIdentity alanları

| FIELD | REQUIRED_FOR_PUBLIC_REVIEW | CURRENT_VALUE_PRESENT | OWNER_VALUE_REQUIRED | PUBLIC_SURFACE_USING_IT |
|---|---|---|---|---|
| BUSINESS_LEGAL_COMPANY_NAME | YES | NO_VERIFIED_RUNTIME_VALUE | YES | Hakkımızda, iletişim, public hukuk sayfaları, checkout, payment identity snapshot |
| BUSINESS_TRADE_NAME | YES | NO_VERIFIED_RUNTIME_VALUE | YES | Hakkımızda, iletişim, public hukuk sayfaları, checkout |
| BUSINESS_TAX_VKN | YES | NO_VERIFIED_RUNTIME_VALUE | YES | Public şirket kimliği, hukuk sayfaları, checkout |
| BUSINESS_TAX_OFFICE | OWNER_LEGAL_CONFIRMATION_REQUIRED | NO_VERIFIED_RUNTIME_VALUE | CONDITIONAL | Yalnız onaylı metin veya provider başvurusu gerektirirse; business.taxOffice placeholder'ı kullanılırsa zorunlu olur |
| BUSINESS_MERSIS_NUMBER | YES | NO_VERIFIED_RUNTIME_VALUE | YES | Public şirket kimliği, hukuk sayfaları, checkout |
| BUSINESS_REGISTERED_ADDRESS | YES | NO_VERIFIED_RUNTIME_VALUE | YES | İletişim, KVKK başvurusu, hukuk sayfaları, checkout |
| BUSINESS_KEP_ADDRESS | YES | NO_VERIFIED_RUNTIME_VALUE | YES | İletişim, KVKK başvurusu, bildirim ve hukuk sayfaları |
| BUSINESS_PHONE | YES | NO_VERIFIED_RUNTIME_VALUE | YES | İletişim, footer, hukuk sayfaları, checkout |
| BUSINESS_EMAIL | YES | NO_VERIFIED_RUNTIME_VALUE | YES | İletişim, footer, hukuk sayfaları, checkout |
| CUSTOMER_PUBLIC_DOMAIN | YES | NO_VERIFIED_RUNTIME_VALUE | YES | Public identity endpoint, hukuk sayfaları, PayTR review URL sözleşmesi |
| ADMIN_PUBLIC_DOMAIN | PUBLIC_REVIEW_DEPLOYMENT_DEPENDENT | NO_VERIFIED_RUNTIME_VALUE | CONDITIONAL | Public işletme envanteri; Customer ödeme kapısının zorunlu alanı değildir |
| SELLER_WEB_PUBLIC_DOMAIN | MARKETPLACE_REVIEW_DEPENDENT | NO_VERIFIED_RUNTIME_VALUE | CONDITIONAL | Seller onboarding/marketplace inceleme envanteri |
| CUSTOMER_ANDROID_APP_ID | NO_FOR_CUSTOMER_WEB_REVIEW | NO_VERIFIED_RUNTIME_VALUE | CONDITIONAL | Dağıtım/app kimliği envanteri; web ödeme kapısının zorunlu alanı değildir |
| SELLER_ANDROID_APP_ID | NO_FOR_CUSTOMER_WEB_REVIEW | NO_VERIFIED_RUNTIME_VALUE | CONDITIONAL | Seller dağıtım/app kimliği envanteri; web ödeme kapısının zorunlu alanı değildir |

CURRENT_VALUE_PRESENT sütunundaki NO_VERIFIED_RUNTIME_VALUE, alanın kodda
tanımlı olmadığını değil; owner tarafından doğrulanmış production değerinin bu
çalışmada bulunmadığını ifade eder.

## Owner/hukuk/provider kararı bekleyen ek girdiler

Bu girdiler mevcut BusinessIdentity şemasında ayrı kanonik alan değildir.
Doğrulanmış gereksinim oluşmadan yeni environment key veya ikinci kimlik
kaynağı eklenmez.

| FIELD | REQUIRED_FOR_PUBLIC_REVIEW | CURRENT_VALUE_PRESENT | OWNER_VALUE_REQUIRED | PUBLIC_SURFACE_USING_IT |
|---|---|---|---|---|
| AUTHORIZED_PERSON | OWNER_LEGAL_OR_PROVIDER_CONFIRMATION_REQUIRED | NO | CONDITIONAL | PayTR başvuru paketi veya onaylı hukuk metni açıkça gerektirirse |
| BANK_OR_IBAN_DISPLAY | NO_FOR_PAYTR_CARD_REVIEW | NO | NO_IN_THIS_WAVE | Public card checkout kullanmaz; banka/IBAN yalnız ayrı, yetkili havale ürünü gerekirse |
| ETBIS_IDENTITY_OR_LINK | OWNER_LEGAL_CONFIRMATION_REQUIRED | NO | CONDITIONAL | Mevzuat/owner hukuk incelemesi public gösterimi zorunlu kılarsa |
| TRADE_REGISTRY_OFFICE_AND_NUMBER | OWNER_LEGAL_CONFIRMATION_REQUIRED | NO | CONDITIONAL | Onaylı public metin veya provider formu gerektirirse |
| MERSIS_OR_TRADE_REGISTRY_DOCUMENT | PAYTR_APPLICATION_DEPENDENT | NO | CONDITIONAL | Yalnız PayTR'ın güvenli başvuru kanalında; public repo veya logda değil |
| BUSINESS_BANK_ACCOUNT | PAYTR_APPLICATION_DEPENDENT | NO | CONDITIONAL | PayTR başvuru/settlement güvenli kanalı; public Customer sayfasında gösterilmez |
| TAX_CERTIFICATE_OR_COMPANY_DOCUMENTS | PAYTR_APPLICATION_DEPENDENT | NO | CONDITIONAL | Yalnız provider'ın yetkili belge yükleme kanalı |

## Doğrulama ve teslim kuralları

1. Owner her alanın resmi kaynağını ve güncelliğini doğrular.
2. Profesyonel hukuk incelemesi, hangi alanların hangi public metinde
   gösterileceğini onaylar.
3. Secret veya kimlik belgesi bu Markdown dosyasına yazılmaz.
4. Public alanlar runtime environment sınırında yapılandırılır; template'ler
   yalnız strict business placeholder allowlist'ini kullanır.
5. BusinessIdentity eksik/geçersizse public projection null, hukuk belgesi
   owner_external_required ve gerçek kart ödeme başlangıcı 503 kalır.
6. Tax office mevcut kodda opsiyoneldir. Bir taslak business.taxOffice
   placeholder'ını kullanırsa geçerli owner değeri olmadan o belge yayımlanmaz.
7. Banka/IBAN, authorized person veya ETBIS verisi gerekecekse önce owner,
   hukuk ve gerekiyorsa PayTR yazılı gereksinimi kayda alınır; mevcut kanonik
   şema sessizce genişletilmez.

## Owner teslim kontrol listesi

- [ ] Resmi şirket unvanı doğrulandı.
- [ ] Ticari ad doğrulandı.
- [ ] VKN ve MERSİS resmi kaynaktan doğrulandı.
- [ ] Kayıtlı adres, KEP, telefon ve e-posta doğrulandı.
- [ ] novastore.tr sahipliği ve doğru HTTPS origin doğrulandı.
- [ ] Vergi dairesinin public/hukuk/provider gereksinimi kararlaştırıldı.
- [ ] Ek başvuru belgeleri yalnız yetkili güvenli kanalda hazırlandı.
- [ ] Owner/hukuk onayı olmadan hiçbir legal APPROVED bayrağı açılmadı.
