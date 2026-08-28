# NovaStore Commerce API - Yeni Endpointler

## Payments
- `POST /api/payments/initialize`
  - Doğrulanmış Customer oturumu zorunludur; sipariş sahibi yalnız oturum kimliğinden alınır.
  - Body: `fullName, email, phone, address, cartItems[], couponCode?, paymentMethod(card|havale)`
  - Header: `Idempotency-Key` zorunlu sözleşme girdisidir; aynı sahibi ve aynı istek gövdesini tek sipariş/ödeme niyetine bağlar.
  - Ürün fiyatı, kampanya, kupon, kargo ve toplam yalnız sunucuda hesaplanır.
  - Production kart ödemesi gerçek sağlayıcı aktive edilene kadar fail-closed'dur.
  - Production havale/EFT, gerçek hesap bilgisine ek olarak mutabakat ve yetkili ödeme-onay operasyonu aktive edilene kadar fail-closed'dur.
- `POST /api/payments/webhook/iyzico`
  - Body: `eventId, paymentRef, status(SUCCESS|FAILED), providerTransactionId?, reason?`

## Orders
- `POST /api/orders/:id/cancel`
  - Auth gerekli
  - Musteri: owner kontrolu; body `reason_code` zorunlu, `note` opsiyonel.
  - Admin: guncel DB admin rolu + `NOVASTORE_ADMIN_CANCEL_WRITE_ENABLED=true` gerekir.
  - Admin header: `Idempotency-Key` zorunlu.
  - Admin body: `expected_status`, izinli `reason_code`, en fazla 300 karakter `note`.
  - Otomatik provider refund yapmaz; `refund.providerExecuted=false` doner.

## Shipments
- `GET /api/shipments/:orderId` (owner/admin)
- `POST /api/shipments/:orderId/manual` (admin)
  - Varsayilan kapali: `NOVASTORE_MANUAL_FULFILLMENT_WRITE_ENABLED=true` gerekir.
  - Header: `Idempotency-Key` zorunlu.
  - Body: `expected_status=Hazırlanıyor`, `provider`, `tracking_no`, `handoff_confirmed=true`.
  - Yalniz yerel devir kaydi olusturur; carrier API, label ve tracking URL uretmez.
- `POST /api/shipments/:orderId/create` (admin)
  - Guvenlik kilidi kalicidir: `410 SHIPMENT_CREATE_DISABLED`.
  - Dogrulanmis tasiyici adapteri icin ileride ayri endpoint/kontrat gerekir.

## Returns
- `POST /api/returns`
  - Doğrulanmış Customer oturumu ve sipariş sahipliği zorunludur.
  - Yalnız `Teslim Edildi` + `PAID` siparişte, gerçek `delivered_at` zamanından itibaren 14 gün içinde açılır.
  - Sipariş başına aynı anda yalnız bir aktif iade talebi bulunabilir.
- `PATCH /api/returns/:id/status`
  - Güncel DB Admin rolü, `returnStatusWrite` capability ve `NOVASTORE_ADMIN_RETURN_WRITE_ENABLED=true` zorunludur.
  - Body: `status`, `expected_revision`, izinli `reason_code`, müşteri-görünür `decision_note`.
  - Durum geçişi revizyon kilidi ve append-only denetim olayıyla atomiktir.
- `GET /api/returns/:id`
  - Owner/admin için salt okunur; başka müşteriye `404` güvenli geri dönüş verir.
  - Uygulama gerçek sağlayıcı iadesi yapmaz ve açıkça `refundProviderExecuted=false` bildirir. Para iadesi sağlayıcısı ayrı dış kapıdır.

## Campaigns
- `POST /api/campaigns/quote`
  - Body: `cartItems[], couponCode?`

## Merchant Feed
- `GET /merchant/feed.xml`
- `GET /api/merchant/feed.xml`
