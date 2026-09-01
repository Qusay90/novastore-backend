# PayTR Pazaryeri Application Packet

Durum: CHECKLIST_ONLY — NOT_SUBMITTED
Tarih: 1 Eylül 2026

Bu dosya PayTR başvurusu değildir ve PayTR'ın güncel gereksinimlerini onun
adına tanımlamaz. Form alanları, belge kapsamı, ürün modeli ve Pazaryeri
transfer sözleşmesi yalnız yetkili PayTR kanalıyla doğrulanır. Gerçek şirket,
banka veya credential değeri bu dosyaya yazılmaz.

## 1. Owner şirket kimliği

- [ ] Resmi şirket unvanı doğrulandı.
- [ ] Ticari ad doğrulandı.
- [ ] VKN doğrulandı.
- [ ] MERSİS numarası doğrulandı.
- [ ] Kayıtlı adres doğrulandı.
- [ ] KEP adresi doğrulandı.
- [ ] Şirket telefonu ve e-postası doğrulandı.
- [ ] Vergi dairesi bilgisinin provider/public hukuk gereksinimi teyit edildi.
- [ ] Yetkili kişi ve başvuru yetkisi, PayTR'ın güvenli kanalında doğrulandı.
- [ ] İstenen resmi belgeler yalnız provider'ın yetkili yükleme kanalına hazırlandı.

Kaynak sözleşmesi: OWNER-BUSINESS-IDENTITY-INPUT.md. Repo içindeki boş
environment alanları gerçek değer değildir.

## 2. Site ve public review URL'si

- [ ] Customer review URL'si owner tarafından doğrulandı.
- [ ] HTTPS ve alan adı sahipliği doğrulandı.
- [ ] Home, kategori/arama, PDP, mağaza, sepet, hesap ve checkout çalışıyor.
- [ ] Hakkımızda, iletişim ve 12 hukuk rotası doğrudan erişilebilir.
- [ ] Legal footer/header bağlantılarında ölü # link yok.
- [ ] Provider config yokken checkout doğru aktivasyon bekliyor durumunu gösteriyor.
- [ ] Production bundle localhost, fixture, demo credential ve secret içermiyor.
- [ ] Public backend origin, callback path ve proxy topolojisi kayıt altına alındı.

Planlanan Customer origin: owner/deployment tarafından sağlanacak gerçek
https://novastore.tr origin'i. PUBLIC_NOVASTORE_TR_DEPLOYMENT bu çalışmada
NOT_DONE durumundadır.

## 3. Public iletişim

- [ ] Telefon BUSINESS_PHONE kaynağından gösteriliyor.
- [ ] E-posta BUSINESS_EMAIL kaynağından gösteriliyor.
- [ ] Kayıtlı adres BUSINESS_REGISTERED_ADDRESS kaynağından gösteriliyor.
- [ ] KEP BUSINESS_KEP_ADDRESS kaynağından gösteriliyor.
- [ ] İletişim verileri owner tarafından public gösterim için onaylandı.
- [ ] İletişim sayfası kimlik eksikken uydurma fallback göstermiyor.

## 4. Banka ve işletme hesabı

- [ ] PayTR'ın istediği işletme hesabı/IBAN formatı yetkili kanaldan teyit edildi.
- [ ] Hesap sahibi ile resmi şirket kimliği eşleşmesi doğrulandı.
- [ ] Banka belgesi yalnız PayTR'ın güvenli yükleme kanalına hazırlandı.
- [ ] Banka bilgisi Git, client bundle, genel log veya bu Markdown'a yazılmadı.
- [ ] NovaStore seller ledger kayıtlarının gerçek provider transferi olmadığı açıklandı.

Customer card checkout public IBAN göstermez. Production havale/EFT akışı
ayrı mutabakat ve owner yetkisi olmadan fail-closed kalır.

## 5. Pazaryeri iş modeli özeti

Başvuruda owner tarafından onaylanacak teknik olarak doğru özet:

> NovaStore, birden çok bağımsız satıcının ürünlerini müşterilere sunduğu bir
> pazaryeri/aracı hizmet sağlayıcı uygulamasıdır. Ürünün satıcısı PDP,
> mağaza ve siparişe özel sözleşme bağlamında belirtilir. Sepet fiyatı,
> indirim, stok ve satıcı dağılımı backend tarafından yeniden hesaplanır.
> NovaStore'un aracı rolü ile satıcının ürün/satış yükümlülükleri onaylı
> public hukuk metinlerinde ayrı gösterilir.

Bu metin hukuki rol tespiti değildir; owner/profesyonel hukuk ve PayTR ürün
modeli onayına tabidir.

## 6. Seller ve komisyon modeli

- [ ] Seller onboarding/KYC sahibi belirlendi.
- [ ] Her seller organization için approved public legal identity mevcut.
- [ ] Store ile organization bağının server-authoritative olduğu doğrulandı.
- [ ] Komisyon modeli ve oranları owner/finans tarafından belirlendi.
- [ ] Komisyon, valör, bloke, transfer ve settlement davranışı PayTR ile yazılı teyit edildi.
- [ ] Alt üye işyeri veya uygulanacak başka PayTR Pazaryeri modeli yazılı teyit edildi.
- [ ] Seller payout verisi Customer/API/public hukuk içeriğine sızmıyor.
- [ ] İade/chargeback halinde seller hesaplaşma politikası belirlendi.

Kodda bulunan seller order/finance ledger, PayTR'ın gerçek para transferi veya
merchant onayı değildir.

## 7. İptal, iade ve refund akışı

- [ ] Public iptal/iade/cayma taslağı hukuk tarafından onaylandı.
- [ ] Sipariş iptali ve return request sahiplik kontrolleri doğrulandı.
- [ ] Ürün niteliğine göre cayma hakkı istisnaları onaylı metinde açıklandı.
- [ ] Refund/partial refund'ın PayTR contract desteği teyit edildi.
- [ ] Refund yetki matrisi ve çift işlem önleme kuralı belirlendi.
- [ ] Seller/Admin/Customer durum yayılımı UAT senaryosuna alındı.
- [ ] Mutabakat ve chargeback operasyon sahibi belirlendi.

Bu R3 çalışması gerçek refund göndermez.

## 8. Ödeme güvenlik mimarisi özeti

- Kart numarası, CVV ve son kullanma tarihi NovaStore Customer arayüzünde toplanmaz.
- Client fiyat, stok, seller veya ödeme sonucu otoritesi değildir.
- Backend owned address, server pricing, kupon ve seller projection'ını yeniden kurar.
- Config, BusinessIdentity ve zorunlu hukuk belgeleri eksikken init 503 fail-closed olur.
- Dış PayTR token isteği açık kill switch olmadan gönderilmez.
- Provider success/fail return URL'leri ödeme sonucu değildir.
- Tek finalizasyon otoritesi imza/tutar/ref/provider doğrulanmış callback'tir.
- Callback idempotenttir; duplicate/contradictory olaylar siparişi tekrar üretmez.
- Payment status sorgusu yalnız authenticated owner'ın siparişini döndürür.
- Merchant key/salt yalnız server secret manager'da tutulur.

## 9. PayTR iframe durumu

- [x] Kodda tek kart provider allowlist'i paytr.
- [x] Token endpoint resmi https://www.paytr.com origin'ine sabit.
- [x] Client yalnız resmi PayTR güvenli iframe URL sözleşmesini kabul eder.
- [x] Fake card form yok.
- [x] Config absent akışı fail-closed.
- [ ] Merchant aktivasyonu mevcut.
- [ ] Credential'lar güvenli runtime'a enjekte edildi.
- [ ] Public success/fail/callback URL'leri PayTR panelinde eşleştirildi.
- [ ] Yetkili provider test-mode UAT'ı tamamlandı.

## 10. Callback durumu

- [x] Callback hash doğrulaması mevcut.
- [x] Merchant OID/provider/ref eşleşmesi mevcut.
- [x] Tutar, para birimi ve test-mode uyumu kontrol ediliyor.
- [x] Transaction lock ve idempotency mevcut.
- [x] Browser result route ödeme otoritesi değil.
- [ ] Public callback erişim kanıtı mevcut.
- [ ] PayTR panel kaydı mevcut.
- [ ] Invalid signature, duplicate ve amount mismatch provider UAT kanıtı mevcut.
- [ ] Alarm, redaction, retention ve incident owner tanımlandı.

## 11. Kalan dış kapılar

| Kapı | Durum | Kapatma kanıtı |
|---|---|---|
| Gerçek şirket kimliği | OWNER_COMPANY_DATA_REQUIRED | Owner doğrulaması ve runtime yapılandırması |
| Public hukuk içeriği | OWNER_LEGAL_REVIEW_REQUIRED | 12 onaylı metin/sürüm/approval kaydı |
| Public deployment | PUBLIC_DEPLOYMENT_REQUIRED | novastore.tr HTTPS smoke ve operasyon kanıtı |
| PayTR başvurusu | EXTERNAL_PAYTR_APPLICATION | Provider başvuru/ürün modeli kaydı |
| PayTR credential | EXTERNAL_PAYTR_CREDENTIAL | Secret manager teslim kaydı; secret değeri değil |
| Provider UAT | EXTERNAL_PAYMENT_UAT | Redakte edilmiş test sonuçları |
| Production gerçek ödeme | NOT_AUTHORIZED | Ayrı açık owner go/no-go |

## Başvuru öncesi imza bölümü

- Owner şirket verisi onayı: BEKLENİYOR
- Profesyonel hukuk onayı: BEKLENİYOR
- Public deployment sahibi onayı: BEKLENİYOR
- Güvenlik/release sahibi onayı: BEKLENİYOR
- PayTR başvurusu gönderimi: NOT_SUBMITTED
