# Customer Android / Customer Web Account Capability Parity

Authority: Customer Android R11-R4 at the checkpoint recorded by the wave and read-only PC1 Customer Web/backend at `47c085973ecd27bb3e8577b2cd48fb4d36523ffa` / `91bf3f5f4c1898e81fff300ee3506a8c6b4f64bf`.

This matrix describes capability parity, not desktop layout parity. `ANDROID_REACHABLE` means a normal signed-in customer has a discoverable native path. All private data remains server-owned and current-session scoped.

| Capability | WEB_AVAILABLE | ANDROID_AVAILABLE | ANDROID_REACHABLE | BACKEND_CONTRACT_EXISTS | PARITY_ACTION |
|---|---|---|---|---|---|
| Profile / account overview | YES | YES | YES | YES | KEEP_NATIVE_EQUIVALENT |
| Orders | YES | YES | YES | YES | KEEP_NATIVE_EQUIVALENT |
| Addresses | YES | YES | YES | YES | KEEP_NATIVE_EQUIVALENT |
| Favorites | YES | YES | YES, bottom navigation | YES | ALREADY_EQUIVALENT_ELSEWHERE |
| Coupons | YES, active campaign coupons | YES | YES | YES | ADD_REAL_SURFACE |
| Notifications / preferences | YES | YES | YES | YES | KEEP_NATIVE_EQUIVALENT |
| Privacy / security | YES | YES | YES | YES | KEEP_NATIVE_EQUIVALENT |
| Help / support | YES | YES | YES | YES | KEEP_NATIVE_EQUIVALENT |
| FAQ | YES | YES | YES | STATIC HELP CONTENT | KEEP_NATIVE_EQUIVALENT |
| Questions history | YES | YES | YES | YES, current customer only | ADD_REAL_SURFACE |
| Reviews history | YES | YES | YES | YES, self-or-admin route guard | ADD_REAL_SURFACE |
| Followed stores | YES | YES | YES | YES, current customer only | ADD_REAL_SURFACE |
| Returns / exchanges | PARTIAL: owned return UI/backend exist, but Customer Web create is blocked by its HTTP allowlist | YES | YES, through Orders and Support | YES | ALREADY_EQUIVALENT_ELSEWHERE |
| Settings | DISTRIBUTED across profile, notifications, security and support | YES | YES, account gear | PARTIAL, per capability | ADD_REAL_NAVIGATION |
| NovaBot | YES, singleton shell launcher | YES | YES on safe normal routes | YES, optional-auth assistant chat | ADD_REAL_SURFACE |
| Saved payment methods | NO | PROVIDER-GATED STATUS ONLY | NO CARD-MANAGEMENT SURFACE | NO CONFIRMED PAYTR TOKENIZATION CONTRACT | POST_LAUNCH_PROVIDER_GATE |

## Binding safety decisions

- Coupons are the authenticated, server-filtered active campaign inventory; coupon pricing/application authority remains in checkout on PC1.
- Questions, followed stores and support are derived from the authenticated customer identity. Reviews use only the verified current profile id and the server's self-or-admin guard.
- Logout, session replacement and Customer A/B switching must clear every private Account collection before another identity can render.
- Follow state changes only through the canonical `DELETE /api/store-follows/:storeSlug` contract. There is no client-only follow authority.
- NovaBot uses the existing Android help destination and the PC1 assistant contract. Its local component transcript is presentation state, not a second server conversation record; real support remains the existing support channel.
- No PAN, CVV, fake saved card or local saved-payment truth may be added. Payment Methods stays `POST_LAUNCH_PROVIDER_GATE` until a confirmed PayTR marketplace tokenization contract exists.
- Customer Web, PC1, Admin, Seller Android and Stocky are read-only/protected in this wave. The identified Customer Web returns allowlist discrepancy is recorded only; it is not changed here.
