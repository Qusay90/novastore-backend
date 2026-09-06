# R14 Admin Return Processing Disposable UAT

This evidence belongs only to the isolated local PostgreSQL harness in
`tests/adminReturnProcessingPostgresSmoke.js`. It does not authorize or record
production, provider, refund, deployment, push, PR, merge, or Customer source
mutation.

The owner explicitly confirmed Platform Admin as the current decision authority
for Seller-owned returns in this wave. The harness therefore proves Admin
transition propagation to the existing Seller projection while continuing to
deny Seller bearer tokens on the Admin mutation route.

## Authority

- Backend/Admin HEAD `63e604627bca919d2f38143e7d2a65eb82364695`, tree `0ea2a645f7fd3216a5369bd37e858a45ad1024e1`
- Customer Web HEAD `ce76b3ed45576d721fc250cad989f00c27d31690`, tree `6af785c48e3fb961e6bef127c6cbfe35029f1ab2`
- Customer Android v413-ui HEAD `3a00c4b6c5cf1e35fa837c67b8567ebd1a5b28f3`, tree `8624c358783700ec7c152c9ffcee886532333a53`

## Commands

Docker, when the existing local image/runtime is available:

```powershell
node tests/adminReturnProcessingPostgresSmoke.js --execute-disposable-db
```

Official local Windows PostgreSQL binaries:

```powershell
node tests/adminReturnProcessingPostgresSmoke.js --execute-disposable-db --postgres-bin="<absolute-path-to-pgsql-bin>"
```

Add `--serve-browser` to keep the owned fixture and loopback HTTP server alive.
The harness prints a token-free one-time bootstrap URL and an exact stop-signal
file path. Creating that file or pressing Enter stops the server and removes
only the harness-owned database target.

## Latest result

`PASS` on 2026-09-06 against an isolated native PostgreSQL 16.15 cluster:

```text
adminReturnProcessingPostgresSmoke PASS: 46 real HTTP checks; approved+rejected propagation, auth/live revocation, IDOR, stale revision, bounded notes, capability DML=0, record 101, Web+Android canonical adapters; provider calls=0; production writes=0; secret exposure=0
```

The passing run applied the complete canonical migration registry twice (first
apply plus idempotent no-op), exercised the real Express route/middleware stack,
and removed the owned native cluster only after `pg_ctl stop` succeeded.

The authorization matrix covered authorized Admin, live-demoted Admin, expired
Admin, revoked Admin, Customer, Seller, owner and non-owner Customer detail.
Missing, zero and fractional `expected_revision` values and a forged owner field
were rejected with unchanged return/event/outbox snapshots. The approved order
remained `payment_status=PAID`, moved only to `refund_status=PENDING`, and made
zero provider calls. The rejected record remained addressable after a new return
for the same order received a distinct canonical ID.

## Real browser UAT

The same owned fixture was kept on loopback for the integrated Admin artifact.
Playwright exercised 106 return records and reached record 101 through the real
continuation control. The exact detail rendered the hostile `<img ...>` Customer
note as literal text (`RAW_HTML_RETURN_NOTE_RENDERING=0`) and kept the approved
return, `refund_status=PENDING`, and `payment_status=PAID` visibly separate.

The detail and decision dialogs had zero horizontal overflow at 1440x1000,
1280x720, and 768x1024. Decision-note autofocus, Tab order, Enter submission,
the 1000-character limit, and reachable decision actions passed at all three
sizes. Status was always presented with text.

Real UI mutations proved REQUESTED -> IN_REVIEW -> APPROVED with reload
persistence, direct REQUESTED -> REJECTED, and a competing REJECTED decision
followed by stale 409 handling and exact-detail refetch (`lostUpdates=0`). When
that conflict refetch was deliberately forced to 503, every decision control
remained blocked until an exact retry restored current authority. With the
local-only return-write capability switched off, the UI exposed a truthful
read-only state and emitted zero PATCH requests.

Browser evidence logs:

- `artifacts/r14-browser-visual.log`
- `artifacts/r14-browser-decisions.log`
- `artifacts/r14-browser-gates.log`

After browser UAT, the exact stop signal completed with exit code 0. The browser
port was closed, the stop file was removed, and both harness-owned R14 cluster
and PostgreSQL process counts were zero.

## Reproducibility guard

The harness verifies the immutable accepted base commit's tree and requires it
to remain an ancestor of current HEAD. Customer Web and Android sources retain
exact HEAD/tree equality. This permits a post-commit run on the scoped R14
descendant without weakening the accepted-base identity gate.
