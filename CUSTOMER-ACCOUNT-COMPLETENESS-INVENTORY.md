# Customer Account Completeness Inventory

Authority: `c8b454a28e53f77fae0af7cfb162cde4f38a751a` (`9d6701c440528c9a6304a76d06c4aa112a43b075`)

This inventory was completed before R2 implementation. It records the canonical
server truth and the narrow Customer Web reachability gap; it does not create a
parallel fixture or client-owned authority.

| Capability | Backend | Customer Web state | R2 classification | Canonical ownership boundary |
| --- | --- | --- | --- | --- |
| Customer product-question history | `GET /api/questions/user` exists | Product question creation exists; account history is missing | `BACKEND_EXISTS`, `UI_MISSING`, `P1_ACCOUNT_COMPLETENESS` | `authenticateCustomer` supplies `req.user.id`; the request cannot select another customer |
| Customer review/rating history | `GET /api/reviews/user/:userId` exists | Product review creation exists; account history is missing | `BACKEND_EXISTS`, `UI_MISSING`, `P1_ACCOUNT_COMPLETENESS` | `requireSelfOrAdmin("userId")` rejects a different customer id |
| Followed-store collection | Per-store `GET/POST/DELETE /api/store-follows/:storeSlug` exists; collection read is missing | Public store follow/unfollow exists; account list is missing | `CONTRACT_MISSING`, `UI_MISSING`, `P1_ACCOUNT_COMPLETENESS` | R2 must derive the customer only from `req.user.id`, expose current public stores, and reuse the accepted slug mutation contract |
| Returns | Server-owned return creation and order return state exist | Reachable from an eligible delivered order in `Hesabım > Siparişlerim`; policy route is also public | `BACKEND_EXISTS`, `UI_EXISTS_AND_REACHABLE` | Order ownership and return eligibility remain server-authoritative |
| Exchanges | No exchange mutation/workflow contract exists | The current page is informational and does not claim to create an operation | `POST_LAUNCH_ONLY` | R2 does not invent exchange authority or a placeholder mutation |
| Support history | Authenticated message history/send endpoints exist | Dedicated `#/destek` UI exists and is globally reachable, but Account navigation did not expose it | `BACKEND_EXISTS`, `UI_EXISTS_BUT_UNREACHABLE_FROM_ACCOUNT`, `P1_ACCOUNT_COMPLETENESS` | R2 adds only an Account link to the existing authenticated surface; history remains scoped to the authenticated customer |
| Notification center | Server-owned list/read/read-all and Web Push state exist | Reachable at `#/hesabim/bildirimler` | `BACKEND_EXISTS`, `UI_EXISTS_AND_REACHABLE` | Read state and subscription state remain server-owned |

## Bounded-audit result

Support history was the only additional canonical capability absent from the
Account navigation. R2 links to its existing authenticated route without adding
a second screen or contract. Returns remain part of owned order detail and
notifications are already present in Account. Wallet, loyalty, recently viewed,
recommendations, and new social features are outside this R2 scope.

## Required R2 implementation

1. Add three authenticated Account routes and accessible sidebar destinations.
2. Reuse the existing question and review history contracts without mutation authority.
3. Add only the missing followed-store collection read to the accepted follow contract.
4. Keep all loading, empty, error, retry, and safe target navigation states explicit.
5. Preserve the accepted R1 address, checkout, legal, and PayTR gates unchanged.
