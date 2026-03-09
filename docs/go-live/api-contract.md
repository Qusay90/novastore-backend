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
- `POST /api/shipments/:orderId/create` (admin)
- `GET /api/shipments/:orderId` (owner/admin)

## Returns
- `POST /api/returns`
  - Auth gerekli
  - Body: `order_id, reason_code, note?`
- `GET /api/returns/:id`

## Campaigns
- `POST /api/campaigns/quote`
  - Body: `cartItems[], couponCode?`

## Merchant Feed
- `GET /merchant/feed.xml`
- `GET /api/merchant/feed.xml`
