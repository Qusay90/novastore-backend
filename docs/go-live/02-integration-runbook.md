# NovaStore Entegrasyon Runbook

Bu dokuman teknik ekip ile partner teknik ekiplerinin ortak UAT ve production cutover adimlarini tanimlar.

## 1) Odeme (iyzico + Havale)
- Endpointler:
  - `POST /api/payments/initialize`
  - `POST /api/payments/webhook/iyzico`
- UAT senaryolari:
  1. Kart odemesi basarili -> siparis `Hazirlaniyor`
  2. Kart odemesi basarisiz -> siparis `Iptal Edildi` + stok geri yukleme
  3. Ayni idempotency key ile tekrar istek -> yeni siparis olusmaz
  4. Havale secimi -> odeme `WAITING_TRANSFER`

## 2) Kargo
- Aktif endpoint:
  - `GET /api/shipments/:orderId` (owner/admin, salt okunur)
- Guvenlik kilidi:
  - `POST /api/shipments/:orderId/create` gecici olarak `410 SHIPMENT_CREATE_DISABLED` doner.
  - Gercek kargo entegrasyonu, operator tarafindan girilen dogrulanmis takip numarasi ve durum gecisleri tamamlanmadan acilmaz.
- Mevcut UAT senaryolari:
  1. Owner/admin mevcut gonderi bilgisini gorebilir.
  2. Yetkisiz kullanici baska siparisin gonderisini goremez.
  3. Gonderi olusturma denemesi veri yazmadan guvenlik koduyla reddedilir.
- Acma kriteri: Tur 2C shipment mutation testleri tamamlandiktan sonra gonderi olusturma UAT'i ayrica kosulur.

## 3) Iade
- Aktif endpoint:
  - `GET /api/returns/:id` (owner/admin, salt okunur)
- Guvenlik kilitleri:
  - `POST /api/returns` gecici olarak `503 RETURN_WRITES_DISABLED` doner.
  - `PATCH /api/returns/:id/status` gecici olarak `503 RETURN_WRITES_DISABLED` doner.
  - Geri odeme, stok geri alma ve durum gecisleri atomik hale gelmeden yazma islemleri acilmaz.
- Mevcut UAT senaryolari:
  1. Kullanici yalniz kendi mevcut iade talebini gorebilir.
  2. Admin mevcut iade taleplerini salt okunur inceleyebilir.
  3. Yeni talep ve durum degisikligi veri yazmadan guvenlik koduyla reddedilir.
- Acma kriteri: Tur 2C iade uygunluk ve geri odeme zinciri testleri tamamlandiktan sonra yazma UAT'i ayrica kosulur.

## 4) Kampanya Motoru
- Endpoint: `POST /api/campaigns/quote`
- UAT senaryolari:
  1. Kupon uygulama (NOVA10)
  2. Bundle indirimi (2+ urun, 3+ adet)
  3. Ucretsiz kargo esigi

## 5) Veri Tutarliligi Kontrolu
- Siparis toplam tutari, kampanya ciktilari ve payment kaydi ayni olmalı.
- `order_events` ve `notification_audit_logs` tablolari olay denetimi icin kontrol edilmeli.
- Kritik SQL kontrolleri:
  - `orders` <-> `payments` 1:N eslesmesi
  - `orders` <-> `shipments` 1:0/1 eslesmesi
  - `returns` kayitlarinda `order_id` butunlugu
