# NovaStore Commerce API - Yeni Endpointler

## Payments
- `POST /api/payments/initialize`
  - Body: `fullName, email, phone, address, cartItems[], couponCode?, paymentMethod(card|havale)`
  - Header: `Idempotency-Key` (onerilir)
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
  - Gecici guvenlik kilidi: `503 RETURN_WRITES_DISABLED`
- `PATCH /api/returns/:id/status`
  - Gecici guvenlik kilidi: `503 RETURN_WRITES_DISABLED`
- `GET /api/returns/:id`
  - Owner/admin icin salt okunur
  - Tur 2C bu kilidi acmaz; refund/stok/reconciliation modeli ve migration icin ayri onay gerekir.

## Campaigns
- `POST /api/campaigns/quote`
  - Body: `cartItems[], couponCode?`

## Merchant Feed
- `GET /merchant/feed.xml`
- `GET /api/merchant/feed.xml`
