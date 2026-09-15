# NovaStore Seller API v1 — Önerilen Sözleşme

## Durum ve normatif dil

Bu dosyadaki `/api/seller/v1/**` yolları, aksi açıkça yazılmadıkça `PROPOSED_NOT_IMPLEMENTED` durumundadır. R10 ürün sorusu REP-01/REP-02/REP-03 blokları uygulanmış ve yerel/disposable testlerden geçmiştir; her endpoint için aşağıdaki açık kapsam ve runtime notları esas alınır. Mevcut admin, customer, public veya legacy endpoint’ler seller endpoint’i yerine geçmez.

Contract status enum:

- `PROPOSED_NOT_IMPLEMENTED`: Bağlayıcı gelecek sözleşmesi; runtime’da yok.
- `EXISTING_REUSABLE`: Kaynakta doğrulanmış iç primitive; seller authorization’ı olduğu anlamına gelmez.
- `BLOCKED`: Eksik güvenlik, veri veya owner kararı nedeniyle uygulanamaz.
- `IMPLEMENTED`: Açıkça belirtilen kapsamda kod, hedefli testler ve yerel/disposable UAT doğrulanmıştır; production deployment yapıldığı anlamına gelmez.

## Ortak envelope ve güvenlik

- JSON success: `{ "data": ..., "meta": { "request_id": "...", "revision": "...", "server_time": "..." } }`
- JSON error: `{ "error": { "code": "STABLE_CODE", "message": "safe localized message", "field_errors": [], "request_id": "..." } }`
- Kimlik: seller audience access token + güncel server-side session.
- Context: server session/membership’ten organization/store çözülür. Client header/query/body tenant otoritesi değildir.
- Cross-tenant/missing/deleted: aynı `404 RESOURCE_NOT_FOUND`.
- Unknown permission/role/state: deny.
- Revision: Mutable aggregate için güçlü ETag ve `If-Match`; eksik `428 PRECONDITION_REQUIRED`, stale `409 REVISION_CONFLICT`.
- Idempotency: İş etkili POST/command için `Idempotency-Key`; aynı key + farklı payload `409 IDEMPOTENCY_KEY_REUSED`.
- Pagination: Cursor tabanlı; default/max limit endpointte; cursor tenant/filter/sort bağlamına bağlı.
- Money: `{ "amount_minor": 12345, "currency": "TRY" }`; float yok.
- Time: UTC ISO-8601; istemci timezone yalnız sunum içindir.
- Audit: Kritik allow/deny sonuçları redacted append-only event üretir.
- Cache: Sensitive mutation offline queue’ya girmez. Redacted read cache’i `stale_at` ve `as_of` ile salt okunur olabilir.
- Feature flag: Flag açık olması authorization değildir; default off.

## Stable ortak hatalar

`AUTH_REQUIRED`, `SELLER_AUDIENCE_REQUIRED`, `SESSION_REVOKED`, `SELLER_SESSION_REVOKED`, `SESSION_EXPIRED`, `STEP_UP_REQUIRED`, `STEP_UP_EXPIRED`, `PERMISSION_DENIED`, `RESOURCE_NOT_FOUND`, `VALIDATION_FAILED`, `RATE_LIMITED`, `PRECONDITION_REQUIRED`, `REVISION_CONFLICT`, `IDEMPOTENCY_KEY_REUSED`, `INVALID_STATE_TRANSITION`, `CAPABILITY_DISABLED`, `SERVICE_UNAVAILABLE`, `OFFLINE_MUTATION_NOT_ALLOWED`.

## Kaynakta doğrulanmış reusable primitive’ler

| Durum | Primitive | Seller için sınır |
| --- | --- | --- |
| EXISTING_REUSABLE | Customer/admin auth ve session primitives | Seller audience/membership değildir; doğrudan kullanılamaz. |
| EXISTING_REUSABLE | Admin first-party product revision, strict JSON allowlist ve append-only audit yaklaşımı | Admin route/store scope seller sözleşmesi değildir. |
| EXISTING_REUSABLE | Global product/category kimliği | Seller offer/store ownership ayrıca kurulmalıdır. |
| EXISTING_REUSABLE | Order/return/shipment read primitives | Seller allocation ve tenant predicate yoktur. |
| EXISTING_REUSABLE | Notification/message/analytics primitives | Seller store scope ve permission policy yoktur. |

## Endpoint kayıt formatı

Her kayıtta status, method, route, domain, auth, permission, organization/store scope, request/success schema, stable errors, pagination/filter/sort, revision, idempotency, audit, PII, offline/cache, phase ve screen IDs birlikte normatiftir.

`SCREEN-BACKEND-MATRIX.tsv` her ekran için yalnız **birincil backend interaction** çiftini (`api_method` + `api_route`) taşır. Bu belgedeki `Phase / screens` alanı ise endpoint’in birincil veya ikincil bağımlılık olarak referanslandığı bütün ekranları gösterebilir. F0B’de iki ayrı lint uygulanır:

1. Matrixteki her somut birincil method/route çifti bu endpoint registry’sinde bulunmalıdır.
2. Registry’de matrix birincil satırı olmayan bağımlılık endpoint’leri açık exception listesinde bulunmalıdır.

İkincil-bağımlılık exception’ları:

- `ORG-01 GET /api/seller/v1/context`: 024, 027, 055 ve 243 için post-auth context dependency.
- `ORG-02 GET /api/seller/v1/organizations/current`: 027 ve 243 için organization/store detail dependency.
- `OFFER-03 POST /api/seller/v1/offers`: 103–116 create flow dependency; aynı kanonik ekranlar existing-offer edit yolunda OFFER-02/OFFER-04 birincil bağını kullanabilir.
- `REP-03 GET /api/seller/v1/reputation/items/{itemId}`: R10 ürün sorusu detay/refetch bağımlılığı; `254–255` ekranlarının list/command birincil bağını değiştirmez.

Bunun dışındaki registry endpoint’leri matrixte birincil veya shared-primary olarak bulunur. Screen setlerinin birebir ters eşitliği aranmaz; primary coverage ve declared secondary dependency ayrı doğrulanır.

## Auth ve onboarding

### Seller refresh-token rotation and replay/reuse security contract

This subsection is a binding `PROPOSED_NOT_IMPLEMENTED` security contract. It defines future seller session refresh behavior only; it does not claim that a route, controller, token store or runtime capability exists.

#### One-time refresh-token rotation

- Every successful refresh MUST rotate the presented refresh token.
- Every refresh token MUST be single-use.
- A successful refresh MUST return a new short-lived seller access token and a new refresh token in the same controlled refresh family.
- Before the new token pair becomes usable, the presented refresh token MUST be atomically marked consumed or replaced.
- A consumed, replaced, revoked or expired refresh token MUST NOT produce another valid access-token and refresh-token pair.
- Raw refresh tokens MUST NOT be stored. Only cryptographic token hashes and safe metadata MAY be persisted.
- Raw refresh tokens and token hashes MUST NOT be logged, audited as plaintext or returned in diagnostic output.

#### Refresh-token replay/reuse detection

- Presentation of a consumed or replaced refresh token MUST be treated as refresh-token replay/reuse.
- Replay/reuse detection MUST fail closed and MUST NOT return a new access token or refresh token.
- Detected replay/reuse MUST revoke the affected refresh-token family.
- Detected replay/reuse MUST revoke the associated seller session or place it in a terminal denied state.
- Any other seller access governed by the compromised refresh family MUST be rejected.
- Full authentication, including required MFA, MUST be completed before a new seller session is created.
- Replay/reuse MUST produce a safe security audit event without token material.
- The audit event MUST contain only safe metadata: session ID, refresh-family identifier, user ID, detection reason, timestamp, correlation ID and privacy-policy-compliant device/network metadata.

#### Refresh concurrency and atomicity

- Refresh validation, consumed-state transition, replacement-token creation and seller session/family checks MUST execute atomically.
- Concurrent use of the same refresh token MUST result in at most one successful rotation.
- Every competing use MUST be rejected and handled under the replay/reuse policy.
- Refresh rotation MUST NOT depend on client-provided role, organization, store, permission or ownership data.
- Live seller session and DB-backed membership checks remain authoritative.

#### Proposed refresh endpoint contract

- Contract status: `PROPOSED_NOT_IMPLEMENTED`; this subsection does not mount or implement the endpoint.
- Method / route / domain: `POST` · `/api/seller/v1/auth/refresh` · `auth`.
- Authentication / scope: A valid single-use seller refresh credential bound to the live seller session and controlled refresh family; organization/store membership remains server-resolved.
- Request / success: `{refresh_token,device_proof?}` · `{access_token,access_token_expires_at,refresh_token,refresh_token_family_id}` with a new short-lived seller access token and rotated refresh token.
- Stable errors: `REFRESH_TOKEN_INVALID`, `REFRESH_TOKEN_EXPIRED`, `REFRESH_TOKEN_REVOKED`, `REFRESH_TOKEN_REPLAY_DETECTED`, `SELLER_SESSION_REVOKED`, `RATE_LIMITED`, `SERVICE_UNAVAILABLE`.
- Rotation / replay: Consumed, replaced, revoked or expired credentials never produce another token pair; replay/reuse revokes the refresh family and associated seller session and requires full reauthentication.
- Atomicity: Validation, consumption and replacement occur in one atomic security boundary; concurrent presentation allows at most one successful rotation.
- Audit / redaction: `seller.auth.refresh_rotated|refresh_replay_detected`; raw token material and token hashes are excluded.
- Offline: Refresh is not available offline and MUST NOT enter an offline queue.
- Implementation phase / canonical screens: `F2` · session lifecycle dependency; no new canonical screen or matrix row.

### AUTH-01 — Seller login

- Status / method / route / domain: `PROPOSED_NOT_IMPLEMENTED` · `POST` · `/api/seller/v1/auth/login` · `auth`
- Auth / permission / scope: Public; `PUBLIC`; login sonrası membership server-side çözülür, client tenant kabul edilmez.
- Request / success: `{identifier,password,device_proof?}` · `{challenge_id?,session?,available_contexts?}`; session yalnız doğrulanmış seller audience’dır.
- Stable errors / page-filter-sort: `VALIDATION_FAILED`, `INVALID_CREDENTIALS`, `ACCOUNT_SUSPENDED`, `MFA_REQUIRED`, `RATE_LIMITED` · N/A.
- Revision / idempotency / audit: N/A · request nonce/replay guard, `Idempotency-Key` zorunlu değil · `seller.auth.login_succeeded|failed`.
- PII / offline-cache: identifier logda maskeli; password asla loglanmaz · offline login yok, credential cache yok.
- Phase / screens: `F2` · `001–004`.

### AUTH-02 — Password reset request

- Status / method / route / domain: `PROPOSED_NOT_IMPLEMENTED` · `POST` · `/api/seller/v1/auth/password/forgot` · `auth`
- Auth / permission / scope: Public; `PUBLIC`; account enumeration üretmez.
- Request / success: `{identifier}` · `{accepted:true,retry_after_seconds}` her mevcut/yok hesap için aynı güvenli shape.
- Stable errors / page-filter-sort: `VALIDATION_FAILED`, `RATE_LIMITED`, `SERVICE_UNAVAILABLE` · N/A.
- Revision / idempotency / audit: N/A · same identifier rate window dedupe · `seller.auth.password_reset_requested`.
- PII / offline-cache: identifier maskeli; existence log/response’ta açılmaz · offline yok.
- Phase / screens: `F2` · `005`.

### AUTH-03 — Password challenge verification

- Status / method / route / domain: `PROPOSED_NOT_IMPLEMENTED` · `POST` · `/api/seller/v1/auth/password/challenges/{challengeId}/verify` · `auth`
- Auth / permission / scope: Challenge-bound; `PUBLIC`; challenge account/device/expiry server-side.
- Request / success: `{code}` · `{reset_token,expires_at}`; token tek kullanımlı.
- Stable errors / page-filter-sort: `CHALLENGE_INVALID`, `CHALLENGE_EXPIRED`, `CHALLENGE_LOCKED`, `RATE_LIMITED` · N/A.
- Revision / idempotency / audit: Challenge attempt revision · replay aynı sonucu açmaz · `seller.auth.password_challenge_verified|failed`.
- PII / offline-cache: code/token redacted · offline yok, code cache yok.
- Phase / screens: `F2` · `006–009`.

### AUTH-04 — Password reset completion

- Status / method / route / domain: `PROPOSED_NOT_IMPLEMENTED` · `POST` · `/api/seller/v1/auth/password/reset` · `auth`
- Auth / permission / scope: Seller session değildir; `RESET_TOKEN_BOUND`; pre-auth principal account/device/expiry’ye bağlı, tek kullanımlı reset token ile çözülür ve başka hesabı hedefleyemez.
- Request / success: `{reset_token,new_password}` · `{changed:true,sessions_revoked}`.
- Stable errors / page-filter-sort: `RESET_TOKEN_INVALID`, `RESET_TOKEN_EXPIRED`, `PASSWORD_POLICY_FAILED`, `IDEMPOTENCY_KEY_REUSED` · N/A.
- Revision / idempotency / audit: Token tek kullanımlı tüketilir, security stamp artırılır ve mevcut seller sessions policy’ye göre revoke edilir · `Idempotency-Key` zorunlu; replay success/session üretmez · `seller.auth.password_changed`.
- PII / offline-cache: password/token redacted · offline mutation yasak.
- Phase / screens: `F2` · `010–011`.

### AUTH-05 — Seller auth/step-up challenge command

- Status / method / route / domain: `PROPOSED_NOT_IMPLEMENTED` · `POST` · `/api/seller/v1/auth/challenges/{challengeId}/verify` · `auth`
- Auth / permission / scope: İki ayrık mod vardır: ekran 019–020 için session öncesi `LOGIN_CHALLENGE_BOUND`; hassas işlem için mevcut seller session’a bağlı `AUTHENTICATED_SELF`. Normal session başka hesabın login challenge’ını doğrulayamaz.
- Request / success: `{code,device_proof?,purpose:"login|step_up"}` · login modunda yalnız başarılı challenge sonrası `{verified:true,session}`; step-up modunda `{verified:true,step_up_token}`.
- Stable errors / page-filter-sort: `CHALLENGE_INVALID`, `CHALLENGE_EXPIRED`, `CHALLENGE_LOCKED`, `SESSION_REVOKED` · N/A.
- Revision / idempotency / audit: Challenge account/device/purpose/expiry’ye bağlıdır · replay denied; login session tek başarılı consumption sonrası üretilir · `seller.auth.challenge_verified|failed`.
- PII / offline-cache: code/device details redacted, approximate location karar otoritesi değil · offline yok.
- Phase / screens: `F2` · `019–020,182,197,290`.

### AUTH-06 — Logout

- Status / method / route / domain: `PROPOSED_NOT_IMPLEMENTED` · `POST` · `/api/seller/v1/auth/logout` · `auth`
- Auth / permission / scope: Seller session; `AUTHENTICATED_SELF`; current session only unless explicit target contract.
- Request / success: `{session_id:"current"}` · `{revoked:true}`.
- Stable errors / page-filter-sort: `AUTH_REQUIRED`, `SESSION_REVOKED` (idempotent success semantics) · N/A.
- Revision / idempotency / audit: Session revision · `Idempotency-Key` zorunlu · `seller.auth.session_revoked`.
- PII / offline-cache: session token redacted · local token silme mümkün, server revoke yeniden bağlantıda tamamlanmadan success varsayılmaz.
- Phase / screens: `F2` · `022`.

### ONB-01 — Seller application create

- Status / method / route / domain: `PROPOSED_NOT_IMPLEMENTED` · `POST` · `/api/seller/v1/applications` · `onboarding`
- Auth / permission / scope: Verified seller identity; `APPLICANT_SELF`; henüz organization seçimi istemciden alınmaz.
- Request / success: `{seller_type,terms_revision}` · `{application_id,status,revision,next_step}`.
- Stable errors / page-filter-sort: `VERIFICATION_REQUIRED`, `APPLICATION_ALREADY_EXISTS`, `TERMS_REVISION_REQUIRED`, `VALIDATION_FAILED` · N/A.
- Revision / idempotency / audit: Initial revision · `Idempotency-Key` zorunlu · `seller.application.created`.
- PII / offline-cache: legal fields bu endpointte yok · offline mutation yasak.
- Phase / screens: `F2` · `012–013`.

### ONB-02 — Current application

- Status / method / route / domain: `PROPOSED_NOT_IMPLEMENTED` · `GET` · `/api/seller/v1/applications/current` · `onboarding`
- Auth / permission / scope: Seller/applicant session; `APPLICANT_SELF`; current identity application.
- Request / success: Query yok · `{application_id,status,steps,corrections,revision,updated_at}`.
- Stable errors / page-filter-sort: `AUTH_REQUIRED`, `RESOURCE_NOT_FOUND`, `ACCOUNT_SUSPENDED`, `SERVICE_UNAVAILABLE` · N/A.
- Revision / idempotency / audit: ETag response · N/A · read audit yalnız sensitive document/status access için.
- PII / offline-cache: legal/tax/bank fields maskeli ve minimum · redacted draft/status cache, timestamped.
- Phase / screens: `F2` · `023–027,053–054`.

### ONB-03 — Application step update

- Status / method / route / domain: `PROPOSED_NOT_IMPLEMENTED` · `PATCH` · `/api/seller/v1/applications/current/steps/{step}` · `onboarding`
- Auth / permission / scope: Applicant session; `APPLICANT_SELF`; server-owned application.
- Request / success: Strict step-specific allowlist `{fields...,draft}` · `{step,status,revision,next_step,field_errors:[]}`.
- Stable errors / page-filter-sort: `VALIDATION_FAILED`, `STEP_NOT_AVAILABLE`, `PRECONDITION_REQUIRED`, `REVISION_CONFLICT`, `UPLOAD_NOT_READY` · N/A.
- Revision / idempotency / audit: `If-Match` zorunlu · `Idempotency-Key` iş etkili submit için zorunlu · `seller.application.step_saved|submitted`.
- PII / offline-cache: tax/address/bank/document content redacted; binary ayrı güvenli service · yalnız local draft queue; submit/bank/document mutation offline yasak.
- Phase / screens: `F2` · `028–052`.

### ONB-04 — Verification command

- Status / method / route / domain: `PROPOSED_NOT_IMPLEMENTED` · `POST` · `/api/seller/v1/applications/current/verifications/{channel}/commands` · `onboarding`
- Auth / permission / scope: Applicant session; `APPLICANT_SELF`; channel email/phone/tax/bank allowlist.
- Request / success: `{action:"request|verify|refresh",code?,challenge_id?}` · `{status,challenge_id?,expires_at?,retry_after_seconds?}`.
- Stable errors / page-filter-sort: `CHANNEL_NOT_ALLOWED`, `CHALLENGE_INVALID`, `CHALLENGE_EXPIRED`, `RATE_LIMITED`, `SERVICE_UNAVAILABLE` · N/A.
- Revision / idempotency / audit: Application verification revision · request dedupe/verify replay deny · `seller.application.verification_requested|verified|failed`.
- PII / offline-cache: code and bank/tax identifiers redacted · offline yok.
- Phase / screens: `F2` · `014–018,033–044`.

## Organization, stores, team ve membership

### ORG-01 — Active seller context

- Status / method / route / domain: `PROPOSED_NOT_IMPLEMENTED` · `GET` · `/api/seller/v1/context` · `organizations`
- Auth / permission / scope: Seller session; `AUTHENTICATED_SELF`; memberships server-side.
- Request / success: Optional `preferred_store_id` hint yetki değildir · `{contexts:[{organization,stores,permissions}],active_context?}`.
- Stable errors / page-filter-sort: `AUTH_REQUIRED`, `NO_ACTIVE_MEMBERSHIP`, `ACCOUNT_SUSPENDED`, `RESOURCE_NOT_FOUND` · contexts stable name/id sıralı.
- Revision / idempotency / audit: Membership revision/security stamp · N/A · sensitive context selection audit.
- PII / offline-cache: legal fields yok · last verified context yalnız navigation hint; authorization değil.
- Phase / screens: `F1` · `024,027,055,243`; `DG-001` çözülmeden multi-context selection BLOCKED.

### ORG-02 — Current organization/store read

- Status / method / route / domain: `PROPOSED_NOT_IMPLEMENTED` · `GET` · `/api/seller/v1/organizations/current` · `organizations`
- Auth / permission / scope: Seller session; `organization.read`; active organization/store.
- Request / success: Query yok · `{organization,stores,active_store,revision}`.
- Stable errors / page-filter-sort: `NO_ACTIVE_MEMBERSHIP`, `PERMISSION_DENIED`, `RESOURCE_NOT_FOUND` · stores `name,id`.
- Revision / idempotency / audit: ETag · N/A · normal read audit sampled; sensitive legal read full.
- PII / offline-cache: legal/tax fields default response’ta yok · redacted cache allowed.
- Phase / screens: `F1` · `027,243`.

### STORE-01 — Store detail/update

- Status / method / route / domain: `PROPOSED_NOT_IMPLEMENTED` · `PATCH` · `/api/seller/v1/stores/{storeId}` · `stores`
- Auth / permission / scope: Seller session + step-up for status/contact; `store.update`; organization/store route id server-side checked.
- Request / success: Strict `{display_name,description,verified_contact_visibility,shipping_policy,return_policy,operating_status,media_refs?}` · `{store,revision}`.
- Stable errors / page-filter-sort: `VALIDATION_FAILED`, `PERMISSION_DENIED`, `RESOURCE_NOT_FOUND`, `STEP_UP_REQUIRED`, `REVISION_CONFLICT`, `MEDIA_CAPABILITY_BLOCKED` · N/A.
- Revision / idempotency / audit: `If-Match` · `Idempotency-Key` status mutation için zorunlu · `seller.store.updated|operating_status_changed`.
- PII / offline-cache: yalnız verified business contact; personal/operation address public response’a girmez · draft local olabilir, publish/status offline yasak.
- Phase / screens: `F12` · `245–251`.

### STORE-00 — Store detail/read preview

- Status / method / route / domain: `PROPOSED_NOT_IMPLEMENTED` · `GET` · `/api/seller/v1/stores/{storeId}` · `stores`
- Auth / permission / scope: Seller session; `store.read`; route id active organization/store membership ile server-side doğrulanır.
- Request / success: `{preview_mode?}` · `{store,profile,policies,customer_preview,revision,as_of}`; preview satın alma/customer işlemi çalıştırmaz.
- Stable errors / page-filter-sort: `PERMISSION_DENIED`, `RESOURCE_NOT_FOUND`, `SERVICE_UNAVAILABLE` · N/A.
- Revision / idempotency / audit: ETag/projection version · N/A · sensitive contact/policy access sampled audit.
- PII / offline-cache: yalnız verified business contact; personal/operation address yok · redacted timestamped preview cache.
- Phase / screens: `F12` · `243–244,256`.

### TEAM-01 — Members and invitations list

- Status / method / route / domain: `PROPOSED_NOT_IMPLEMENTED` · `GET` · `/api/seller/v1/team/members` · `team`
- Auth / permission / scope: Seller session; `team.read`; active organization/store scope.
- Request / success: `{cursor?,limit?,status?}` · `{items:[member|invitation],next_cursor}`.
- Stable errors / page-filter-sort: `PERMISSION_DENIED`, `RESOURCE_NOT_FOUND`, `INVALID_CURSOR` · limit 50; filter status; sort role/name/id.
- Revision / idempotency / audit: List revision · N/A · team access audit.
- PII / offline-cache: email/phone minimum ve maskeli · redacted short-lived cache.
- Phase / screens: `F1` · `282,288`.

### TEAM-00 — Role and permission catalog

- Status / method / route / domain: `PROPOSED_NOT_IMPLEMENTED` · `GET` · `/api/seller/v1/team/roles` · `team`
- Auth / permission / scope: Seller session; `team.read`; active organization, server-owned role registry.
- Request / success: Query yok · `{roles:[{id,name,assignable,permissions,locked_permissions}],revision}`; owner assignable değildir.
- Stable errors / page-filter-sort: `PERMISSION_DENIED`, `RESOURCE_NOT_FOUND` · system order then stable role id; filter yok.
- Revision / idempotency / audit: Role registry revision · N/A · role matrix access audit sampled.
- PII / offline-cache: PII yok · redacted role catalog cache allowed.
- Phase / screens: `F1` · `284–285`.

### TEAM-02 — Invitation create

- Status / method / route / domain: `PROPOSED_NOT_IMPLEMENTED` · `POST` · `/api/seller/v1/team/invitations` · `team`
- Auth / permission / scope: Seller session; `team.invite`; organization/server-owned store scope.
- Request / success: `{invitee,role_id,store_scope_ids}`; owner role forbidden · `{invitation_id,status,expires_at,revision}`.
- Stable errors / page-filter-sort: `VALIDATION_FAILED`, `PERMISSION_DENIED`, `OWNER_INVITE_FORBIDDEN`, `INVITATION_EXISTS`, `RATE_LIMITED` · N/A.
- Revision / idempotency / audit: Team revision · `Idempotency-Key` zorunlu · `seller.team.invitation_created`.
- PII / offline-cache: invitee maskeli; token sadece hash · offline yasak.
- Phase / screens: `F1` · `283–285,288–289`.

### TEAM-03 — Member permission update

- Status / method / route / domain: `PROPOSED_NOT_IMPLEMENTED` · `PATCH` · `/api/seller/v1/team/members/{membershipId}` · `team`
- Auth / permission / scope: Seller session + step-up; `team.manage`; same organization.
- Request / success: `{role_id,store_scope_ids,permission_overrides?}` · `{member,revision,sessions_reevaluated}`.
- Stable errors / page-filter-sort: `PERMISSION_DENIED`, `RESOURCE_NOT_FOUND`, `STEP_UP_REQUIRED`, `OWNER_TRANSFER_REQUIRED`, `LAST_OWNER_REQUIRED`, `REVISION_CONFLICT` · N/A.
- Revision / idempotency / audit: `If-Match` · `Idempotency-Key` zorunlu · `seller.team.member_permissions_changed`.
- PII / offline-cache: permission diff only; contact redacted · offline yasak.
- Phase / screens: `F1` · `285–287,291`; owner transfer `DG-002` nedeniyle BLOCKED.

### TEAM-04 — Member revoke

- Status / method / route / domain: `PROPOSED_NOT_IMPLEMENTED` · `DELETE` · `/api/seller/v1/team/members/{membershipId}` · `team`
- Auth / permission / scope: Seller session + step-up; `team.remove`; same organization.
- Request / success: `{reason}` · `{revoked:true,sessions_revoked,revision}`.
- Stable errors / page-filter-sort: `PERMISSION_DENIED`, `RESOURCE_NOT_FOUND`, `STEP_UP_REQUIRED`, `LAST_OWNER_REQUIRED`, `REVISION_CONFLICT` · N/A.
- Revision / idempotency / audit: `If-Match` · `Idempotency-Key` zorunlu · `seller.team.member_revoked`.
- PII / offline-cache: reason redacted/length-limited · offline yasak.
- Phase / screens: `F1` · `290`.

## Dashboard

### DASH-01 — Store dashboard

- Status / method / route / domain: `PROPOSED_NOT_IMPLEMENTED` · `GET` · `/api/seller/v1/dashboard` · `dashboard`
- Auth / permission / scope: Seller session; `dashboard.read`; active organization/store.
- Request / success: `{from?,to?,timezone?}` · `{sales,orders,inventory,rating,finance,tasks,notifications,as_of}`.
- Stable errors / page-filter-sort: `PERMISSION_DENIED`, `RESOURCE_NOT_FOUND`, `INVALID_DATE_RANGE`, `SERVICE_UNAVAILABLE` · date filter; fixed card ordering.
- Revision / idempotency / audit: Projection version · N/A · normal aggregate read sampled.
- PII / offline-cache: aggregate only; customer/financial account detail yok · redacted timestamped cache allowed.
- Phase / screens: `F5` · `055–073`.

## Product offers, catalog ve inventory

### OFFER-01 — Offer list

- Status / method / route / domain: `PROPOSED_NOT_IMPLEMENTED` · `GET` · `/api/seller/v1/offers` · `offers`
- Auth / permission / scope: Seller session; `offer.read`; active organization/store.
- Request / success: `{cursor?,limit?,status?,query?,category_id?,sort?}` · `{items:[offer_summary],next_cursor,facets}`.
- Stable errors / page-filter-sort: `PERMISSION_DENIED`, `RESOURCE_NOT_FOUND`, `INVALID_CURSOR`, `VALIDATION_FAILED` · limit 50; scoped filters; allowlisted sort.
- Revision / idempotency / audit: Item revision + page snapshot · N/A · read sampled.
- PII / offline-cache: PII yok · timestamped list cache allowed.
- Phase / screens: `F3` · `074–095`.

### OFFER-02 — Offer detail

- Status / method / route / domain: `PROPOSED_NOT_IMPLEMENTED` · `GET` · `/api/seller/v1/offers/{offerId}` · `offers`
- Auth / permission / scope: Seller session; `offer.read`; route id same organization/store.
- Request / success: Query yok · `{offer,product,variants,inventory,policy_issues,revision}`.
- Stable errors / page-filter-sort: `PERMISSION_DENIED`, `RESOURCE_NOT_FOUND` · N/A.
- Revision / idempotency / audit: ETag · N/A · sensitive cost read permission-audited.
- PII / offline-cache: PII yok · redacted cache allowed.
- Phase / screens: `F3` · `096–103,114–123`.

### OFFER-03 — Offer create

- Status / method / route / domain: `PROPOSED_NOT_IMPLEMENTED` · `POST` · `/api/seller/v1/offers` · `offers`
- Auth / permission / scope: Seller session; `offer.create`; server active organization/store.
- Request / success: `{product_ref?|title,description,category_id,attributes,variants,shipping,tax}` strict allowlist; client store id ignored/rejected · `{offer,status:"draft",revision}`.
- Stable errors / page-filter-sort: `VALIDATION_FAILED`, `PERMISSION_DENIED`, `CAPABILITY_DISABLED`, `CATEGORY_NOT_ALLOWED`, `DUPLICATE_SKU` · N/A.
- Revision / idempotency / audit: Initial revision · `Idempotency-Key` zorunlu · `seller.offer.created`.
- PII / offline-cache: PII yok · local draft olabilir, submit offline yasak.
- Phase / screens: `F3` · `103–116`.

### OFFER-04 — Offer update

- Status / method / route / domain: `PROPOSED_NOT_IMPLEMENTED` · `PATCH` · `/api/seller/v1/offers/{offerId}` · `offers`
- Auth / permission / scope: Seller session; `offer.update`; server verifies offer/store before revision.
- Request / success: Strict partial `{title,description,category_id,attributes,variants,price,tax,shipping,visibility}` · `{offer,revision,policy_issues}`.
- Stable errors / page-filter-sort: `VALIDATION_FAILED`, `PERMISSION_DENIED`, `RESOURCE_NOT_FOUND`, `PRECONDITION_REQUIRED`, `REVISION_CONFLICT`, `CAPABILITY_DISABLED` · N/A.
- Revision / idempotency / audit: `If-Match` zorunlu · safe retry via `Idempotency-Key` · `seller.offer.updated`.
- PII / offline-cache: PII yok · draft cache olabilir; server mutation offline queue olmaz.
- Phase / screens: `F3` · `103,105–115,123`.

### OFFER-05 — Offer command

- Status / method / route / domain: `PROPOSED_NOT_IMPLEMENTED` · `POST` · `/api/seller/v1/offers/{offerId}/commands` · `offers`
- Auth / permission / scope: Seller session; command’a göre `offer.publish|archive|delete_draft|duplicate`; same store.
- Request / success: `{command:"publish|unpublish|archive|delete_draft|duplicate",revision,reason?}` · `{offer?,new_offer_id?,status,revision}`.
- Stable errors / page-filter-sort: `INVALID_STATE_TRANSITION`, `POLICY_FIELDS_REQUIRED`, `PERMISSION_DENIED`, `RESOURCE_NOT_FOUND`, `REVISION_CONFLICT`, `CAPABILITY_DISABLED` · N/A.
- Revision / idempotency / audit: Expected revision zorunlu · `Idempotency-Key` zorunlu · `seller.offer.command_applied|denied`.
- PII / offline-cache: PII yok · offline yasak.
- Phase / screens: `F3` · `90,97,114–122`.

### OFFER-06 — Offer batch command

- Status / method / route / domain: `PROPOSED_NOT_IMPLEMENTED` · `POST` · `/api/seller/v1/offers/batch-commands` · `offers`
- Auth / permission / scope: Seller session; batch command permission’ı; tüm offer ID’leri aynı active store.
- Request / success: `{command,items:[{offer_id,revision,value?}],reason?}` · `{results:[{offer_id,status,revision?,error?}],atomicity}`.
- Stable errors / page-filter-sort: `BATCH_SCOPE_MISMATCH`, `REVISION_CONFLICT`, `VALIDATION_FAILED`, `PERMISSION_DENIED`, `CAPABILITY_DISABLED` · N/A.
- Revision / idempotency / audit: Item revisions · `Idempotency-Key` zorunlu · `seller.offer.batch_command_applied`.
- PII / offline-cache: PII yok · offline yasak.
- Phase / screens: `F3` · `091–095`.

### OFFER-07 — Offer media

- Status / method / route / domain: `BLOCKED` · `POST` · `/api/seller/v1/offers/{offerId}/media` · `offers/media`
- Auth / permission / scope: Seller session; `offer.media.manage`; same store; güvenli upload service kararı eksik.
- Request / success: Gelecek owner kararı gerekli: content intent, size/type/hash/crop metadata · başarı schema henüz dondurulmadı.
- Stable errors / page-filter-sort: `MEDIA_CAPABILITY_BLOCKED`, `UNSAFE_MEDIA`, `PERMISSION_DENIED`, `RESOURCE_NOT_FOUND` · N/A.
- Revision / idempotency / audit: Offer/media revision gerekli · idempotent content hash gerekli · `seller.offer.media_blocked|uploaded`.
- PII / offline-cache: EXIF/PII temizliği zorunlu · offline upload queue yok.
- Phase / screens: `F3` · `029–031,104,246`.

### INV-01 — Inventory read

- Status / method / route / domain: `PROPOSED_NOT_IMPLEMENTED` · `GET` · `/api/seller/v1/inventory` · `inventory`
- Auth / permission / scope: Seller session; `inventory.read`; active organization/store.
- Request / success: `{cursor?,limit?,status?,query?,location_id?,sort?}` · `{summary,items,next_cursor,as_of}`.
- Stable errors / page-filter-sort: `PERMISSION_DENIED`, `RESOURCE_NOT_FOUND`, `INVALID_CURSOR` · limit 100; allowlisted filters/sort.
- Revision / idempotency / audit: Item revision + projection as_of · N/A · read sampled.
- PII / offline-cache: PII yok · timestamped read cache allowed.
- Phase / screens: `F3` · `124–129,135–141`.

### INV-02 — Inventory adjustment

- Status / method / route / domain: `PROPOSED_NOT_IMPLEMENTED` · `POST` · `/api/seller/v1/inventory/adjustments` · `inventory`
- Auth / permission / scope: Seller session; `inventory.adjust`; all SKU/location targets same store.
- Request / success: `{items:[{sku_id,delta|absolute,reason_code,revision}],note?}` · `{movements,items,atomicity}`.
- Stable errors / page-filter-sort: `VALIDATION_FAILED`, `PERMISSION_DENIED`, `RESOURCE_NOT_FOUND`, `REVISION_CONFLICT`, `NEGATIVE_STOCK_FORBIDDEN`, `CAPABILITY_DISABLED` · N/A.
- Revision / idempotency / audit: SKU revision zorunlu · `Idempotency-Key` zorunlu · `seller.inventory.adjusted`.
- PII / offline-cache: note redacted/length-limited · offline mutation yasak.
- Phase / screens: `F3` · `130–133`.

### INV-03 — Low-stock threshold

- Status / method / route / domain: `PROPOSED_NOT_IMPLEMENTED` · `PATCH` · `/api/seller/v1/inventory/{skuId}/threshold` · `inventory`
- Auth / permission / scope: Seller session; `inventory.threshold.update`; same store SKU.
- Request / success: `{threshold,revision}` · `{sku_id,threshold,revision}`.
- Stable errors / page-filter-sort: `VALIDATION_FAILED`, `PERMISSION_DENIED`, `RESOURCE_NOT_FOUND`, `REVISION_CONFLICT` · N/A.
- Revision / idempotency / audit: `If-Match` · safe retry idempotent · `seller.inventory.threshold_changed`.
- PII / offline-cache: PII yok · offline queue yok.
- Phase / screens: `F3` · `137–138`.

## Orders, fulfillment, returns ve customer communication

### ORD-01 — Seller order list

- Status / method / route / domain: `PROPOSED_NOT_IMPLEMENTED` · `GET` · `/api/seller/v1/orders` · `orders`
- Auth / permission / scope: Seller session; `order.read`; seller allocation same organization/store.
- Request / success: `{cursor?,limit?,status?,query?,from?,to?,sort?}` · `{items:[seller_order_summary],next_cursor,facets,as_of}`.
- Stable errors / page-filter-sort: `PERMISSION_DENIED`, `RESOURCE_NOT_FOUND`, `INVALID_CURSOR`, `VALIDATION_FAILED` · limit 50; allowlisted filters/sort.
- Revision / idempotency / audit: Allocation/page snapshot · N/A · read sampled.
- PII / offline-cache: customer identity maskeli, address yok · timestamped read-only cache.
- Phase / screens: `F4` · `142–155`.

### ORD-02 — Seller order detail

- Status / method / route / domain: `PROPOSED_NOT_IMPLEMENTED` · `GET` · `/api/seller/v1/orders/{sellerOrderId}` · `orders`
- Auth / permission / scope: Seller session; `order.read`; seller order allocation server-side.
- Request / success: Query `{include?}` allowlist · `{seller_order,items,packages,earnings_summary?,revision}`.
- Stable errors / page-filter-sort: `PERMISSION_DENIED`, `RESOURCE_NOT_FOUND` · package/item stable order.
- Revision / idempotency / audit: ETag · N/A · PII/finance detail access audit.
- PII / offline-cache: masked customer/address; full payment instrument never returned · redacted timestamped cache.
- Phase / screens: `F4` · `156–162,166`.

### ORD-03 — Order/package command

- Status / method / route / domain: `PROPOSED_NOT_IMPLEMENTED` · `POST` · `/api/seller/v1/orders/{sellerOrderId}/commands` · `orders/fulfillment`
- Auth / permission / scope: Seller session; command-specific `order.prepare|ship|cancel.respond|note.write`; seller package scope.
- Request / success: `{command,package_id?,carrier_id?,reason?,revision,step_up_token?}` · `{seller_order,package?,transition,revision}`.
- Stable errors / page-filter-sort: `INVALID_STATE_TRANSITION`, `PERMISSION_DENIED`, `RESOURCE_NOT_FOUND`, `STEP_UP_REQUIRED`, `REVISION_CONFLICT`, `SHIPMENT_PROVIDER_UNAVAILABLE` · N/A.
- Revision / idempotency / audit: Order/package revision · `Idempotency-Key` zorunlu · `seller.order.command_applied|denied`.
- PII / offline-cache: label/address ayrı kısa ömürlü secure download; logs redacted · offline mutation yasak.
- Phase / screens: `F4` · `163–175,183–184`.

### ORD-04 — Order note/message

- Status / method / route / domain: `PROPOSED_NOT_IMPLEMENTED` · `POST` · `/api/seller/v1/orders/{sellerOrderId}/messages` · `customer_communication`
- Auth / permission / scope: Seller session; `customer_message.send`; seller order/package context.
- Request / success: `{body,client_message_id}` · `{message_id,status,created_at}`.
- Stable errors / page-filter-sort: `PERMISSION_DENIED`, `RESOURCE_NOT_FOUND`, `MESSAGE_POLICY_VIOLATION`, `CONVERSATION_CLOSED`, `RATE_LIMITED` · N/A.
- Revision / idempotency / audit: Conversation revision · client_message_id + `Idempotency-Key` · `seller.customer_message.sent|blocked`.
- PII / offline-cache: phone/email/address/payment/external-link detection ve redaction/block · offline send queue yasak.
- Phase / screens: `F4` · `172–173,271–272`.

### ORD-05 — Customer conversation inbox

- Status / method / route / domain: `PROPOSED_NOT_IMPLEMENTED` · `GET` · `/api/seller/v1/customer-conversations` · `customer_communication`
- Auth / permission / scope: Seller session; `customer_message.read`; only own seller order/package conversations.
- Request / success: `{cursor?,limit?,status?,seller_order_id?}` · `{items:[conversation_summary],next_cursor,as_of}`.
- Stable errors / page-filter-sort: `PERMISSION_DENIED`, `RESOURCE_NOT_FOUND`, `INVALID_CURSOR` · limit 50; status/order filter; latest message desc.
- Revision / idempotency / audit: Conversation revisions/page snapshot · N/A · conversation access audit.
- PII / offline-cache: customer name maskeli; phone/email/address/payment/external link yok · redacted timestamped read cache.
- Phase / screens: `F13` · `271`.

### RET-01 — Return/refund request list/detail

- Status / method / route / domain: `PROPOSED_NOT_IMPLEMENTED` · `GET` · `/api/seller/v1/returns` · `returns`
- Auth / permission / scope: Seller session; `return.read`; seller allocated item/package only.
- Request / success: `{cursor?,limit?,status?,seller_order_id?}` · `{items:[return_summary],next_cursor}`.
- Stable errors / page-filter-sort: `PERMISSION_DENIED`, `RESOURCE_NOT_FOUND`, `INVALID_CURSOR` · limit 50; status/date sort.
- Revision / idempotency / audit: Return revision · N/A · evidence access audit.
- PII / offline-cache: evidence signed/redacted, customer minimum · timestamped read cache.
- Phase / screens: `F4` · `149,176–180`.

### RET-02 — Return decision command

- Status / method / route / domain: `PROPOSED_NOT_IMPLEMENTED` · `POST` · `/api/seller/v1/returns/{returnId}/commands` · `returns/refunds`
- Auth / permission / scope: Seller session + step-up where required; `return.respond`; allocated return items only.
- Request / success: `{command:"accept|contest",item_quantities?,reason?,evidence_refs?,revision,step_up_token?}` · `{return,status,platform_review?,revision}`.
- Stable errors / page-filter-sort: `INVALID_STATE_TRANSITION`, `PERMISSION_DENIED`, `RESOURCE_NOT_FOUND`, `STEP_UP_REQUIRED`, `REVISION_CONFLICT`, `REFUND_CHAIN_UNAVAILABLE` · N/A.
- Revision / idempotency / audit: Return revision · `Idempotency-Key` zorunlu · `seller.return.command_submitted|denied`.
- PII / offline-cache: evidence access controlled; client refund amount kabul edilmez · offline mutation yasak.
- Phase / screens: `F4` · `176–184`.

## Reviews ve questions

R10 REP rotaları ortak Seller aktivasyon sözleşmesini kullanır. Seller V1 varsayılan olarak kapalıdır ve `SELLER_API_V1_ENABLED=true` tek başına rota açmaz.

- Yerel geliştirme/test: `SELLER_API_V1_LOCAL_ONLY=true`, adlandırılmış loopback veritabanı, uzak DB izni kapalı ve `NOVASTORE_BIND_HOST=127.0.0.1` zorunludur. Eski yerel harness uyumluluğu için activation mode yalnız bu kesin yerel birleşimde verilmezse `local` kabul edilir.
- Tek kullanımlık yerel UAT: `SELLER_API_V1_ACTIVATION_MODE=uat`, `NODE_ENV=test` ve aynı loopback sınırlarını kullanır.
- Uzak UAT: `SELLER_API_V1_ACTIVATION_MODE=uat`, `NODE_ENV=production`, `NOVASTORE_DEPLOY_ENV=staging`, açık HTTPS Seller origin'i, tam uzak DB host/ad/TLS attestation'ı, bağımsız güvenlik sırları ve dar ingress IP/CIDR listesi ister.
- Production: `SELLER_API_V1_ACTIVATION_MODE=production`, `NODE_ENV=production`, `NOVASTORE_DEPLOY_ENV=production`, `SELLER_API_V1_LOCAL_ONLY=false`, açık HTTPS Seller origin'i, dar trusted-ingress listesi, güvenli proxy topolojisi, bağımsız Seller/JWT sırları ve attested TLS veritabanı zorunludur. Bağlanılan PostgreSQL'in gerçek `current_database()` ve sunucu portu yapılandırılan hedefle eşleşmeden Seller router doldurulmaz ve dinleyici açılmaz. Doğrudan TLS yoksa yalnız listedeki ingress peer'in tek `X-Forwarded-Proto: https` bildirimi kabul edilir.

Bu sözleşme üretimi etkinleştirmez ve deployment yapmaz; yalnız açıkça yapılandırılmış ilerideki aktivasyonun fail-closed koşullarını tanımlar. Kanonik backend kodu uygulanmıştır, production deployment `NOT_DONE`.

Doğrulama: `npm run test:seller-reputation` → `PASS`, `67` reddedilen girdi senaryosu, `3` route ve migration kontrolleri; `npm run test:seller-reputation:integration` → `PASS`, `172` gerçek HTTP kontrolü. Yerel auth/Customer-Seller-Admin akışı, dört rollback enjeksiyonu, yetki kilidi çekişmesi, eşzamanlılık, imleç/imza/kapsam ve bildirim dedupe doğrulandı. Bağımsız review: `HIGH=0`, `MEDIUM=0`.

### REP-01 — Reviews/questions inbox

- Status / method / route / domain: `IMPLEMENTED` · `GET` · `/api/seller/v1/reputation/inbox` · `reviews_questions`.
- R10 kapsamı: Yalnız `product_question`; review inbox ve report komutu bu dalgada uygulanmaz.
- Auth / permission / scope: Seller audience ve güncel server session/membership; `reputation.read`; aktif organization, aktif/açık Seller mağazası ve güncel atanmış mağaza kapsamı. Soru sahipliği `product_questions → products.store_id → seller_stores.legacy_store_id` zincirinden çözülür.
- Request / success: `{cursor?,limit?,type?,status?,offer_id?}` · ham Seller business JSON `{items,next_cursor}`. Bu REP runtime, yukarıdaki gelecek `data/meta` envelope önerisini uygulamaz.
- Filter: `type` varsayılanı ve tek desteklenen değer `product_question`; `status` yoksa tümü, varsa `unanswered|answered`; `offer_id` pozitif Seller offer kimliğidir, product kimliği değildir. Offer filtresi mevcut organization/store/product bağı içinde çözülür; yetki vermez.
- Pagination: Varsayılan limit `25`, üst sınır `50`; immutable kanonik soru kimliği `id DESC`. `next_cursor` son sayfada `null`. İmleç opaktır; version, scope/filter özeti ve son kimliği kapsayan base64url payload ile sunucunun ürettiği HMAC imzasını taşır. Organization, membership ve güncel store scope bağlamına bağlıdır; bozuk imza veya başka kapsam/filtre `400 INVALID_CURSOR`. İmza yetki vermez; her SQL sorgusu yeniden tenant filtrelidir.
- DTO: `{item_id,type,product_id,product_name,store_id,store_name,question,answer,status,revision,created_at,answered_at,can_reply}`. `item_id` kanonik `product_questions.id`, `store_id` ise Seller mağaza kimliğidir; legacy `stores.id` değildir. Kimlik/revision alanları pozitif JSON sayılarıdır. `status=unanswered|answered`; boş yanıt/tarih `null`.
- Stable errors / page-filter-sort: `403 PERMISSION_DENIED`, `404 RESOURCE_NOT_FOUND`, `400 INVALID_CURSOR`, `400 VALIDATION_FAILED`, `400 UNSUPPORTED_REPUTATION_TYPE`, geçici backend/yetki kilidi çekişmesinde `503 SELLER_BUSINESS_UNAVAILABLE`; ayrıca mevcut Seller auth/session hataları. Ham hata biçimi `{code,error}`; sayfalama/filtre/sıralama yukarıda tanımlıdır.
- Revision / idempotency / audit: Kanonik item revision · salt okunur istek için idempotency key yok · yanıt audit davranışı REP-02'de tanımlıdır.
- PII / offline-cache: Customer e-posta, telefon, adres, kimlik numarası veya auth/session bilgisi DTO'ya alınmaz. `can_reply` güncel izin ve soru durumundan hesaplanan sunum bilgisidir; mutasyon yetkisinin yerine geçmez. Yanıttan/yeniden bağlantıdan sonra server refetch gerekir.
- Phase / screens: `F12` · ürün soruları `254`; review `252` desteklenmiş sayılmaz.

### REP-02 — Public reply/report command

- Status / method / route / domain: `IMPLEMENTED` · `POST` · `/api/seller/v1/reputation/items/{itemId}/commands` · `reviews_questions`.
- Auth / permission / scope: REP-01 ile aynı canlı sahiplik zinciri; desteklenen `reply` için hem `reputation.read` hem `reputation.reply`. `report` uygulanmamıştır ve başarı döndürmez; `reputation.report` yoksa `403 PERMISSION_DENIED`, açıkça mevcutsa `400 UNSUPPORTED_COMMAND`. Bu dalga report yetkisi dağıtmaz.
- Request / success: `{command:"reply",body:"...",revision:1}` · ham `{item,status:"answered",revision}`. `{itemId}` kanonik soru kimliğidir. Yanıt, REP-01 DTO'sunu kullanır.
- Validation: Trim sonrası `1–2000` JavaScript UTF-16 karakter birimi; boş/aşırı uzun yanıt ve izin verilmeyen kontrol karakterleri `400 VALIDATION_FAILED`. Açık iletişim/URL/e-posta/telefon, ödeme aracı/IBAN, HTML işaretlemesi, adres belirteci ve sipariş referansı kalıpları `400 CONTENT_POLICY_VIOLATION`; bu deterministik sınırlı kalıp kontrolü tüm doğal dil PII'sini tespit ettiği iddiası taşımaz. Ayrıntılar [R10 handoff](PC1-SELLER-QUESTION-API-FINAL-HANDOFF.md).
- Revision: Pozitif JSON integer body `revision` zorunlu; eksik `428 PRECONDITION_REQUIRED`, bozuk `400 VALIDATION_FAILED`, stale veya zaten yanıtlı soru `409 REVISION_CONFLICT`. Bu runtime body revision kullanır; yukarıdaki gelecek `If-Match` önerisini zorunlu kılmaz. `reply`, mevcut yanıtı düzenlemez.
- Idempotency: `Idempotency-Key` zorunlu, `8–160` ASCII harf/rakam veya `._:-`; eksik `428 IDEMPOTENCY_KEY_REQUIRED`. Aynı key+aynı istek aynı sonucu döndürür ve yeni yanıt/audit/event üretmez; uyumsuz yeniden kullanım `409 IDEMPOTENCY_KEY_REUSED`. Retry sırasında da canlı auth, izin ve sahiplik kontrol edilir. Başka key ile zaten yanıtlı soruya tekrar cevap `409 REVISION_CONFLICT`.
- Transaction / audit: Kanonik `product_questions` yanıtı, `answered_at`, `answered_by`, revision artışı; Seller audit, idempotency receipt ve mevcut `QUESTION_ANSWERED` outbox olayı tek transaction içinde. Audit yalnız güvenli kimlik/aksiyon metadata taşır; ayrı Seller yanıt deposu yoktur.
- Stable errors / page-filter-sort: `403 PERMISSION_DENIED`, `404 RESOURCE_NOT_FOUND`, `400 VALIDATION_FAILED`, `400 CONTENT_POLICY_VIOLATION`, `400 UNSUPPORTED_COMMAND`, `428 PRECONDITION_REQUIRED`, `428 IDEMPOTENCY_KEY_REQUIRED`, `409 REVISION_CONFLICT`, `409 IDEMPOTENCY_KEY_REUSED`, geçici backend/yetki kilidi çekişmesinde `503 SELLER_BUSINESS_UNAVAILABLE`; mevcut auth/session hataları ayrıca geçerlidir. Ham hata biçimi `{code,error}` · page/filter/sort N/A. `503` sonrası kısa bekleme/refetch uygun olduğunda yapılır; aynı komut tekrarında aynı request/key korunur, belirsiz sonuç için yeni key üretilmez.
- Revision / idempotency / audit: Yukarıdaki body revision ve zorunlu header key · `seller.reputation.reply_published`; tam transaction ve replay kuralları yukarıda tanımlıdır.
- PII / offline-cache: Yalnız herkese açık ürün yanıtı; içerik koruması yukarıda tanımlıdır. Mutasyon offline kuyruğuna alınmaz; kesinleşmeyen ağ sonucu için aynı key ve aynı request ile retry yapılır.
- Phase / screens: `F12` · ürün sorusu yanıtı `255`; review yanıtı `253` desteklenmiş sayılmaz.

### REP-03 — Canonical product-question detail/refetch

- Status / method / route / domain: `IMPLEMENTED` · `GET` · `/api/seller/v1/reputation/items/{itemId}` · `reviews_questions`.
- Auth / permission / scope: REP-01 ile aynı canlı Seller session/membership/store sahipliği; `reputation.read`.
- Request / success: Path `{itemId}` · `{item}`; `item`, REP-01 kanonik DTO'sudur.
- Stable errors / page-filter-sort: Cross-tenant/missing/deleted/erişilemeyen kaynak `404 RESOURCE_NOT_FOUND`; izin yoksa `403 PERMISSION_DENIED`; geçici backend/yetki kilidi çekişmesinde `503 SELLER_BUSINESS_UNAVAILABLE`; mevcut auth/session hataları · page/filter/sort N/A.
- Revision / idempotency / audit: Güncel kanonik item revision · salt okunur istek için idempotency key yok · yanıt audit davranışı REP-02'de tanımlıdır.
- PII / offline-cache: REP-01 ile aynı Customer veri minimizasyonu; reply veya notification açılışından önce canlı refetch.
- Phase / screens: `F12` · ürün sorusu `254–255` detay/refetch ikincil bağımlılığı.
- Notification consumption: Mevcut target `{type:"product_question",destination:"NOTIFICATION_CENTER",questionId,productId,sellerStoreId}` değişmez. Notification çözümleyicisinin mevcut `offer.read` kontrolü REP erişimi sağlamaz; tüketici detail endpointine `questionId` ile gider, `reputation.read` ve güncel sahiplik yeniden doğrulanır. Başarısız refetch güvenli notification/inbox fallback ile sonuçlanır; payload içindeki product/store kimlikleri yetki değildir.
- Tam Android/Stocky sözleşmesi: [PC1 Seller Question API Final Handoff](PC1-SELLER-QUESTION-API-FINAL-HANDOFF.md). R10 backend sözleşmesi `GO`; Android handoff `READY`; Stocky tüketimi `BACKEND_READY`. İstemci UI/deployment tamamlandı anlamına gelmez.

## Campaigns ve coupons

### CAM-01 — Campaign list/detail

- Status / method / route / domain: `PROPOSED_NOT_IMPLEMENTED` · `GET` · `/api/seller/v1/campaigns` · `campaigns`
- Auth / permission / scope: Seller session; `campaign.read`; own organization/store and eligible offers.
- Request / success: `{cursor?,limit?,status?,campaign_id?}` · `{items,next_cursor,financing_disclosure}`.
- Stable errors / page-filter-sort: `PERMISSION_DENIED`, `RESOURCE_NOT_FOUND`, `INVALID_CURSOR` · limit 50; status/date filters.
- Revision / idempotency / audit: Campaign revision · N/A · finance disclosure access audit.
- PII / offline-cache: PII yok · timestamped cache.
- Phase / screens: `F12` · `223–226,240–242`.

### CAM-02 — Campaign draft create/update

- Status / method / route / domain: `PROPOSED_NOT_IMPLEMENTED` · `POST` · `/api/seller/v1/campaigns` · `campaigns`
- Auth / permission / scope: Seller session; `campaign.create`; own store/offers only.
- Request / success: `{type,name,offer_ids,discount,cart_rules,start_at,end_at,budget_limit,usage_limit}` · `{campaign,status:"draft",revision}`.
- Stable errors / page-filter-sort: `VALIDATION_FAILED`, `PERMISSION_DENIED`, `RESOURCE_NOT_FOUND`, `FINANCING_RULE_INVALID`, `CAPABILITY_DISABLED` · N/A.
- Revision / idempotency / audit: Initial/update revision command payload · `Idempotency-Key` zorunlu · `seller.campaign.draft_saved`.
- PII / offline-cache: PII yok · local draft olabilir, submit offline yasak.
- Phase / screens: `F12` · `227–236`.

### CAM-03 — Campaign lifecycle command

- Status / method / route / domain: `PROPOSED_NOT_IMPLEMENTED` · `POST` · `/api/seller/v1/campaigns/{campaignId}/commands` · `campaigns`
- Auth / permission / scope: Seller session; `campaign.publish|stop|delete_draft`; own store.
- Request / success: `{command,revision}` · `{campaign,status,revision}`.
- Stable errors / page-filter-sort: `INVALID_STATE_TRANSITION`, `PERMISSION_DENIED`, `RESOURCE_NOT_FOUND`, `REVISION_CONFLICT`, `CAPABILITY_DISABLED` · N/A.
- Revision / idempotency / audit: Campaign revision · `Idempotency-Key` zorunlu · `seller.campaign.published|stopped|draft_deleted`.
- PII / offline-cache: PII yok · offline yasak.
- Phase / screens: `F12` · `235–239`.

## Finance, ledger, settlements ve payout-account preparation

### FIN-01 — Finance summary

- Status / method / route / domain: `PROPOSED_NOT_IMPLEMENTED` · `GET` · `/api/seller/v1/finance/summary` · `finance`
- Auth / permission / scope: Seller session; `finance.read`; organization/store ledger scope.
- Request / success: `{from?,to?,currency?}` · `{pending,available,reserved,paid,as_of,ledger_cursor}`; settlement planı F5 response’una girmez.
- Stable errors / page-filter-sort: `PERMISSION_DENIED`, `RESOURCE_NOT_FOUND`, `RECONCILIATION_BLOCKED`, `SERVICE_UNAVAILABLE` · date/currency filter.
- Revision / idempotency / audit: Ledger cursor/projection version · N/A · finance read audit.
- PII / offline-cache: bank/account and customer PII yok · redacted timestamped read cache; stale açık.
- Phase / screens: `F5` · `185–186,201–204`; ekran 193 yalnız FIN-03/F6 reconciled settlement projection’ını kullanır.

### FIN-02 — Ledger entries

- Status / method / route / domain: `PROPOSED_NOT_IMPLEMENTED` · `GET` · `/api/seller/v1/finance/ledger` · `ledger`
- Auth / permission / scope: Seller session; `finance.read`; organization/store ledger.
- Request / success: `{cursor?,limit?,type?,from?,to?,seller_order_id?,sort?}` · `{items:[ledger_entry],next_cursor,as_of}`.
- Stable errors / page-filter-sort: `PERMISSION_DENIED`, `RESOURCE_NOT_FOUND`, `INVALID_CURSOR`, `VALIDATION_FAILED` · limit 100; allowlisted type/date/order; occurred_at sort.
- Revision / idempotency / audit: Immutable entry ids + cursor · N/A · finance detail read audit.
- PII / offline-cache: no customer/payment instrument; source refs bounded · encrypted/redacted timestamped cache.
- Phase / screens: `F5` · `187–190,199–200`.

### FIN-03 — Settlements read

- Status / method / route / domain: `PROPOSED_NOT_IMPLEMENTED` · `GET` · `/api/seller/v1/finance/settlements` · `settlements`
- Auth / permission / scope: Seller session; `settlement.read`; organization/store.
- Request / success: `{cursor?,limit?,status?,from?,to?}` · `{items:[settlement_summary],next_cursor}`.
- Stable errors / page-filter-sort: `PERMISSION_DENIED`, `RESOURCE_NOT_FOUND`, `RECONCILIATION_BLOCKED`, `INVALID_CURSOR` · limit 50; status/date.
- Revision / idempotency / audit: Settlement immutable revision/snapshot cursor · N/A · settlement read audit.
- PII / offline-cache: account only masked label/last digits · redacted timestamped cache.
- Phase / screens: `F6` · `191–193`.

### FIN-04 — Payout accounts list/create

- Status / method / route / domain: `PROPOSED_NOT_IMPLEMENTED` · `POST` · `/api/seller/v1/finance/payout-accounts` · `payout_account_preparation`
- Auth / permission / scope: Seller session + step-up; `payout_account.manage`; organization legal owner scope.
- Request / success: `{provider_setup_token,account_holder_declaration}`; raw full account persisted/logged by NovaStore değil · `{account_id,bank_name,masked_account,status,revision}`.
- Stable errors / page-filter-sort: `PERMISSION_DENIED`, `STEP_UP_REQUIRED`, `VALIDATION_FAILED`, `ACCOUNT_OWNERSHIP_FAILED`, `CAPABILITY_DISABLED`, `SERVICE_UNAVAILABLE` · N/A.
- Revision / idempotency / audit: Initial account revision · `Idempotency-Key` zorunlu · `seller.payout_account.created`.
- PII / offline-cache: provider token redacted; response maskeli · offline yasak.
- Phase / screens: `F6` · `194–196`.

### FIN-03A — Payout accounts read

- Status / method / route / domain: `PROPOSED_NOT_IMPLEMENTED` · `GET` · `/api/seller/v1/finance/payout-accounts` · `payout_account_preparation`
- Auth / permission / scope: Seller session; `payout_account.read`; current organization legal owner scope.
- Request / success: Query yok · `{items:[{account_id,bank_name,masked_account,status,is_default,revision}],set_revision}`.
- Stable errors / page-filter-sort: `PERMISSION_DENIED`, `RESOURCE_NOT_FOUND`, `CAPABILITY_DISABLED`, `SERVICE_UNAVAILABLE` · verified/default first, stable id.
- Revision / idempotency / audit: Set/account revisions · N/A · `seller.payout_account.list_viewed`.
- PII / offline-cache: tam hesap/IBAN/provider token yok; yalnız maskeli metadata · encrypted redacted cache, kısa ömürlü ve salt okunur.
- Phase / screens: `F6` · `194`.

### FIN-05 — Payout account command

- Status / method / route / domain: `PROPOSED_NOT_IMPLEMENTED` · `POST` · `/api/seller/v1/finance/payout-accounts/{accountId}/commands` · `payout_account_preparation`
- Auth / permission / scope: Seller session + step-up; `payout_account.manage`; same organization.
- Request / success: `{command:"set_default|remove",revision,step_up_token}` · `{account,status,default_account_id?,revision}`.
- Stable errors / page-filter-sort: `PERMISSION_DENIED`, `RESOURCE_NOT_FOUND`, `STEP_UP_REQUIRED`, `REVISION_CONFLICT`, `LAST_VERIFIED_ACCOUNT_REQUIRED`, `CAPABILITY_DISABLED` · N/A.
- Revision / idempotency / audit: Account/set revision · `Idempotency-Key` zorunlu · `seller.payout_account.default_changed|removed`.
- PII / offline-cache: yalnız maskeli metadata · offline yasak.
- Phase / screens: `F6` · `197–198`.

Payout release/provider money movement için seller endpoint’i tanımlanmamıştır. Manuel payout talebi `DG-003` nedeniyle `BLOCKED`; production transfer platform-only ve bu entegrasyonun dışındadır.

## Reports ve analytics

### ANA-01 — Seller analytics

- Status / method / route / domain: `PROPOSED_NOT_IMPLEMENTED` · `GET` · `/api/seller/v1/analytics` · `analytics`
- Auth / permission / scope: Seller session; `analytics.read`; own organization/store aggregate only.
- Request / success: `{from,to,metric?,category_id?,offer_id?,compare_from?,compare_to?}` · `{metrics,series,ranked_offers,sample_sizes,as_of}`.
- Stable errors / page-filter-sort: `PERMISSION_DENIED`, `RESOURCE_NOT_FOUND`, `INVALID_DATE_RANGE`, `INSUFFICIENT_SAMPLE`, `SERVICE_UNAVAILABLE` · dimension/filter allowlist; deterministic rank.
- Revision / idempotency / audit: Projection version · N/A · aggregate read sampled.
- PII / offline-cache: anonymous aggregates only; customer/device/session rows yok · timestamped cache.
- Phase / screens: `F5` · `205–217,219–222`.

### ANA-02 — Report preparation

- Status / method / route / domain: `PROPOSED_NOT_IMPLEMENTED` · `POST` · `/api/seller/v1/reports` · `reports`
- Auth / permission / scope: Seller session; `report.create`; requested report domain permission + own store.
- Request / success: `{type:"finance|analytics",filters,format}` · `{report_id,status:"preparing",expires_at}`.
- Stable errors / page-filter-sort: `PERMISSION_DENIED`, `VALIDATION_FAILED`, `INSUFFICIENT_SAMPLE`, `RECONCILIATION_BLOCKED`, `RATE_LIMITED` · report query filters frozen; sort in report manifest.
- Revision / idempotency / audit: Source projection/ledger cursor · `Idempotency-Key` zorunlu · `seller.report.requested|downloaded`.
- PII / offline-cache: customer/address/payment instrument excluded; signed short-lived download · offline create yok.
- Phase / screens: `F5` · `200,218`.

## Notifications

### NOT-01 — Notification list/detail

- Status / method / route / domain: `PROPOSED_NOT_IMPLEMENTED` · `GET` · `/api/seller/v1/notifications` · `notifications`
- Auth / permission / scope: Seller session; `notification.read`; own organization/store.
- Request / success: `{cursor?,limit?,type?,read_state?,notification_id?}` · `{items,next_cursor,unread_count,as_of}`.
- Stable errors / page-filter-sort: `PERMISSION_DENIED`, `RESOURCE_NOT_FOUND`, `INVALID_CURSOR` · limit 50; type/read filter; newest first.
- Revision / idempotency / audit: Notification revision · N/A · sensitive deep-link access audit.
- PII / offline-cache: customer/address/bank data notification body’de yok · redacted timestamped cache.
- Phase / screens: `F13` · `257–263,267–270`.

### NOT-02 — Notification read-state command

- Status / method / route / domain: `PROPOSED_NOT_IMPLEMENTED` · `POST` · `/api/seller/v1/notifications/commands` · `notifications`
- Auth / permission / scope: Seller session; `notification.update`; selected IDs same tenant.
- Request / success: `{command:"mark_read|mark_unread",ids,revision?}` · `{updated_ids,unread_count,revision}`.
- Stable errors / page-filter-sort: `PERMISSION_DENIED`, `RESOURCE_NOT_FOUND`, `VALIDATION_FAILED`, `REVISION_CONFLICT` · N/A.
- Revision / idempotency / audit: Set revision · `Idempotency-Key` zorunlu · `seller.notification.read_state_changed`.
- PII / offline-cache: PII yok; business source record değişmez · offline queue yok.
- Phase / screens: `F13` · `263–264`.

### NOT-03 — Notification preferences

- Status / method / route / domain: `PROPOSED_NOT_IMPLEMENTED` · `PATCH` · `/api/seller/v1/notification-preferences` · `notifications`
- Auth / permission / scope: Seller session; `notification.preference.update`; authenticated self within organization.
- Request / success: `{channels,types,quiet_hours,revision}` · `{preferences,critical_exceptions,revision}`.
- Stable errors / page-filter-sort: `VALIDATION_FAILED`, `PERMISSION_DENIED`, `CRITICAL_NOTIFICATION_REQUIRED`, `REVISION_CONFLICT` · N/A.
- Revision / idempotency / audit: `If-Match` · safe retry · `seller.notification.preferences_changed`.
- PII / offline-cache: endpoints/tokens response’ta yok · local draft olabilir; save online.
- Phase / screens: `F13` · `265–266`.

## Support ve NovaBot

### SUP-01 — Support history

- Status / method / route / domain: `PROPOSED_NOT_IMPLEMENTED` · `GET` · `/api/seller/v1/support/conversations` · `support`
- Auth / permission / scope: Seller session; `support.read`; own organization/store, customer conversations hariç.
- Request / success: `{cursor?,limit?,channel?,status?}` · `{items,next_cursor,as_of}`.
- Stable errors / page-filter-sort: `PERMISSION_DENIED`, `RESOURCE_NOT_FOUND`, `INVALID_CURSOR`, `SERVICE_UNAVAILABLE` · limit 50; channel/status; newest.
- Revision / idempotency / audit: Conversation revision · N/A · support access audit.
- PII / offline-cache: transferred context minimum/redacted · closed history timestamped read cache.
- Phase / screens: `F13` · `274–281`.

### SUP-02 — NovaBot/support message

- Status / method / route / domain: `PROPOSED_NOT_IMPLEMENTED` · `POST` · `/api/seller/v1/support/messages` · `support_novabot`
- Auth / permission / scope: Seller session; `support.message`; own organization/store/support conversation.
- Request / success: `{conversation_id?,channel:"novabot|live",body,context_refs?}` · `{conversation_id,message_id,status,handoff_preview?}`.
- Stable errors / page-filter-sort: `PERMISSION_DENIED`, `RESOURCE_NOT_FOUND`, `CONTENT_POLICY_VIOLATION`, `RATE_LIMITED`, `PROVIDER_UNAVAILABLE` · N/A.
- Revision / idempotency / audit: Conversation revision · client message id + `Idempotency-Key` · `seller.support.message_sent|blocked|handoff_requested`.
- PII / offline-cache: customer conversation otomatik aktarılmaz; context allowlist/redacted · offline outbound queue yok.
- Phase / screens: `F13` · `273–275`.

### SUP-03 — Support rating

- Status / method / route / domain: `PROPOSED_NOT_IMPLEMENTED` · `POST` · `/api/seller/v1/support/conversations/{conversationId}/rating` · `support`
- Auth / permission / scope: Seller session; `support.rate`; own closed conversation.
- Request / success: `{score,comment?}` · `{rated:true}`.
- Stable errors / page-filter-sort: `VALIDATION_FAILED`, `PERMISSION_DENIED`, `RESOURCE_NOT_FOUND`, `CONVERSATION_NOT_CLOSED`, `ALREADY_RATED` · N/A.
- Revision / idempotency / audit: Conversation revision · `Idempotency-Key` zorunlu · `seller.support.rated`.
- PII / offline-cache: comment PII redaction · offline yok.
- Phase / screens: `F13` · `277–278`.

## Settings ve security

### SEC-01 — Security center and sessions

- Status / method / route / domain: `PROPOSED_NOT_IMPLEMENTED` · `GET` · `/api/seller/v1/security/sessions` · `settings_security`
- Auth / permission / scope: Seller session; `AUTHENTICATED_SELF`; current seller identity only.
- Request / success: Query yok · `{security_posture,sessions:[{id,device,approximate_location,last_seen,current}],revision}`.
- Stable errors / page-filter-sort: `AUTH_REQUIRED`, `SESSION_REVOKED`, `PERMISSION_DENIED` · current first, last_seen desc.
- Revision / idempotency / audit: Security stamp/session revisions · N/A · `seller.security.sessions_viewed`.
- PII / offline-cache: IP/precise location yok; device bounded · sensitive cache yok.
- Phase / screens: `F2` · `292,294–295`; ekran 296 versioned bundled legal/help içeriğidir ve session endpoint’i çağırmaz.

### SEC-02 — Security/profile command

- Status / method / route / domain: `PROPOSED_NOT_IMPLEMENTED` · `POST` · `/api/seller/v1/security/commands` · `settings_security`
- Auth / permission / scope: Seller session + action-dependent step-up; `AUTHENTICATED_SELF`; current identity/session.
- Request / success: `{command:"change_email|change_phone|change_password|enroll_2fa|regenerate_recovery_codes|revoke_session",target_id?,proof?,revision}` · action-specific redacted result.
- Stable errors / page-filter-sort: `VALIDATION_FAILED`, `STEP_UP_REQUIRED`, `PERMISSION_DENIED`, `RESOURCE_NOT_FOUND`, `REVISION_CONFLICT`, `RATE_LIMITED` · N/A.
- Revision / idempotency / audit: Security stamp/target revision · `Idempotency-Key` zorunlu · action-specific `seller.security.*`.
- PII / offline-cache: password/code/recovery token redacted; recovery codes tek gösterim · offline yasak.
- Phase / screens: `F2` · `293–295`.

## Bilinçli olarak tanımlanmayan seller yetenekleri

- `/api/admin/**` bağımlılığı.
- Payout release, provider money movement veya seller-controlled settlement amount.
- Global category/commission/platform campaign yönetimi.
- Başka seller/customer/admin verisi.
- Client-provided tenant/role/ownership authority.
- Varsayılan moderation/risk cezası.
- Offline finance, order, refund, role, bank veya security mutation queue.
- Tam adres reveal; `DG-004` kararı olmadan.
- Owner transfer/four-eyes; `DG-002` kararı olmadan.
- Ekran 296 için session/device/approximate-location çağrısı; versioned legal/help içeriği `N/A-BACKEND` ve salt-okunurdur.

## Uygulama kapısı

Bu sözleşme endpoint yaratmaz. Her endpoint ancak ilgili `PHASE-GATES.md` fazı, contract/security testleri, exact allowlist ve ayrı owner authorization sonrasında uygulanabilir. Admin endpoint’ler geçici substitute değildir.
