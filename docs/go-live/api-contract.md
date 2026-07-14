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
  - Body: `reason_code` (zorunlu), `note` (opsiyonel)

## Shipments
- `GET /api/shipments/:orderId` (owner/admin)
- `POST /api/shipments/:orderId/create` (admin)
  - Gecici guvenlik kilidi: `410 SHIPMENT_CREATE_DISABLED`
  - Kilit acilana kadar gonderi, takip numarasi veya tahmini teslim tarihi uretmez ve veri yazmaz.

## Returns
- `POST /api/returns`
  - Gecici guvenlik kilidi: `503 RETURN_WRITES_DISABLED`
- `PATCH /api/returns/:id/status`
  - Gecici guvenlik kilidi: `503 RETURN_WRITES_DISABLED`
- `GET /api/returns/:id`
  - Owner/admin icin salt okunur

## Campaigns
- `POST /api/campaigns/quote`
  - Body: `cartItems[], couponCode?`

## Merchant Feed
- `GET /merchant/feed.xml`
- `GET /api/merchant/feed.xml`
