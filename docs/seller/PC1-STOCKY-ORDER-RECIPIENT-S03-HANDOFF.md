# PC1 R17 — canonical order recipient handoff for Stocky S03

Status: contract handoff only. No Stocky/Seller consumer, delegated credential,
identity bridge or production activation is implemented by R17.

## Historical authority

The checkout controller loads the selected `customer_addresses` row with both
address ID and authenticated Customer ID, validates geography/mobile phone,
and formats the address. `orderService` persists copies in `orders.customer_name`,
`orders.phone` and `orders.address` when creating the order/payment intent.
The three order creation functions preserve the same columns. No read of the
Customer's current profile, default address, or saved-address table belongs in
a historical fulfillment projection.

These are persisted historical copies, not a claim that privileged SQL cannot
modify the order table. Changing/deleting a saved address must not change an
existing order's recipient. Do not backfill absent historical data from today's
Customer address. Missing required values require an operational warning and
an explicitly authorized correction workflow; R17 does not introduce one.

City/province and district are embedded in the persisted address text. There
are no separate canonical order snapshot columns for city, district, postal
code or delivery note in this accepted model. Do not split strings by commas,
slashes or address labels to invent structured historical data. Future structured
snapshots require a separately scoped write-contract/versioning change, with
truthful handling of older orders and no speculative backfill.

## Current Admin read

`GET /api/admin/orders/:id` is an exact-order, private/no-store read using the
existing current Admin principal and role middleware. `ordersRead` is supported
for the current Admin role; this model has no independently restricted Admin
order-reader permission. Demotion, revocation, expiry and non-Admin principals
remain server-enforced. The global summary does not gain phone or address.

Response fields are explicitly selected, not `orders.*`, Customer profiles or
payment raw requests. The response has order ID/status/payment/refund/shipment
state and `deliveryRecipient` with `name`, `phone`, `addressLine`, null structured
location/postal/note fields, `source: order_snapshot` and
`locationFormat: embedded_in_address_line`. `missingDeliveryFields` identifies
absent name/phone/address text. Null means not recorded, never a synthetic value.
This detail endpoint is read-only; it does not attest shipping readiness or
perform a payment, refund, shipment or delivery operation.

## Future Seller authorization — must precede disclosure

Never give Stocky the Admin endpoint or an Admin credential. A future Seller
recipient endpoint must resolve all of the following on the server for each read:

1. Authenticated, unexpired, non-revoked Seller/delegated session with the correct audience.
2. Current live membership and the required fulfillment permission.
3. Exact Seller organization and assigned store derived from the membership/session.
4. Exact canonical order assignment through the accepted Seller order/package projection.
5. Supported fulfillment state/policy, including cancelled and reassigned-order restrictions.

Client-selected Customer, organization or store IDs are not authority. An order
with unrelated seller allocations does not permit access to those sellers'
line items or other Customer addresses. HMAC connector identity and Stocky
Passport/Laravel login alone are not PC1 Seller user/session authority.

Minimal recommendation: canonical `orderId` and a `deliveryRecipient` containing
only `name`, `phone`, `addressLine`. Optional structured fields may be added only
when an accepted immutable canonical snapshot actually stores them and the
shipping workflow requires them. Omit Customer email, account ID as authority,
saved-address IDs/lists, profile metadata, identity documents, tokens, passwords,
payment raw requests and unrestricted Admin detail fields.

## Privacy and acceptance requirements for S03

- Fetch only on an authorized exact-order fulfillment view, with private/no-store responses.
- Keep recipient data out of global lists, URLs, query parameters, analytics,
  notification payloads, logs and persisted browser caches.
- Render plain text. No raw HTML, address/phone external links or implicit click-to-call integration.
- Test two orders of one Customer with different snapshots and a later address edit.
- Test other organizations/stores, revoked membership, expired/revoked session,
  missing permission, wrong audience and reassignment while the view is open.
- Test missing historical values, server/read errors, close/switch late responses,
  logout and retries without retaining another order's recipient.
- Use synthetic disposable local data; evidence contains IDs/booleans/counts,
  not recipient values. Provider/shipping activation is a separate acceptance gate.

R17 does not close Stocky S03, the interrupted Trusted Access identity bridge,
or production release convergence.
