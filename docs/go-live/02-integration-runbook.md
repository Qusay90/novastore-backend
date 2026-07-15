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
- Kontrollu yerel operasyon:
  - `POST /api/shipments/:orderId/manual` yalniz admin, guncel DB rolu ve `NOVASTORE_MANUAL_FULFILLMENT_WRITE_ENABLED=true` ile calisir.
  - Idempotency, beklenen durum, fiziksel handoff onayi, kilitli payment/stok kaniti ve acik reconciliation olmamasi zorunludur.
  - Bu endpoint tasiyici API'si, etiket veya dogrulanmis takip URL'si uretmez.
- Guvenlik kilidi:
  - Eski `POST /api/shipments/:orderId/create` `410 SHIPMENT_CREATE_DISABLED` donmeye devam eder.
- Mevcut UAT senaryolari:
  1. Owner/admin mevcut gonderi bilgisini gorebilir.
  2. Yetkisiz kullanici baska siparisin gonderisini goremez.
  3. Bayrak kapaliyken manuel devir current-admin/order DB sorgusundan once reddedilir.
  4. Bayrak acik fake-pool testinde ayni key/payload tekrarinda tek kayit; farkli key/payload durumunda 409 uretilir.
  5. Bildirim hatasi COMMIT edilmis shipment/order kaydini geri almaz.
- Gercek tasiyici kriteri: Saglayici sozlesmesi, staging sirri, label/tracking callback adapteri ve ayri acik UAT onayi olmadan yoktur.

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
- Acma kriteri: Tur 2C iade yazimini acmaz. Satir bazli iade, refund idempotency, stok hareketi, reconciliation ve migration tasarimi ayri onaylandiktan sonra yeni tur planlanir.

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
