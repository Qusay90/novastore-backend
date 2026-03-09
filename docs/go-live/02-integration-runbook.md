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
- Endpointler:
  - `POST /api/shipments/:orderId/create`
  - `GET /api/shipments/:orderId`
- UAT senaryolari:
  1. Gonderi olusturma -> takip no doner
  2. Siparis kartinda takip no + ETA goruntulenir
  3. Iptal sipariste gonderi olusturma engellenir

## 3) Iade
- Endpointler:
  - `POST /api/returns`
  - `GET /api/returns/:id`
- UAT senaryolari:
  1. Teslim edilmis sipariste iade talebi acilir
  2. Ayni siparise ikinci acik iade talebi engellenir
  3. Kullanici sadece kendi iade talebini gorebilir

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
