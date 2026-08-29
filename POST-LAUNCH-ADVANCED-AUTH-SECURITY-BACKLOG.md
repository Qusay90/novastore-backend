# Post-Launch Advanced Auth Security Backlog

## Boundary

`POST_LAUNCH_ADVANCED_SECURITY_BACKLOG: READY`

These items are separately authorized post-launch work. They are not initial-launch blockers for the ordinary Customer refresh implementation and were not executed in `PC1-AUTH-R1-LAUNCH-MINIMUM-CUSTOMER-REFRESH-CLOSURE`. Deferral does not weaken the required normal functionality, identity isolation, rotation, expiry, logout/revocation, or credential-redaction gates.

Authority:

- PC1 refresh implementation: `232dae1b88c44776c3c5c64b446da7a841de0c2e` / tree `61633b882e44e825fc301dd52f527670ebdf8ce4`
- Consumer contract: `CUSTOMER-ANDROID-R10-REFRESH-HANDOFF.md`

## Deferred work

| ID | Status | Scope | Prerequisite and safe environment | Exit evidence |
|---|---|---|---|---|
| `AUTH-ADV-01` | `DEFERRED` | Extended concurrency, load, and stress across multiple app instances and PostgreSQL lock contention | Separate authorization; disposable local or isolated security-test environment | Bounded load profile, one-winner rotation invariants, no family corruption, capacity and timeout report |
| `AUTH-ADV-02` | `DEFERRED` | Broad malformed-input/property/fuzz testing, including oversized, Unicode, duplicate-key, and parser-edge payloads | Dedicated fuzz harness with strict time/resource limits | Reproducible corpus, zero unhandled crash, stable generic error boundary |
| `AUTH-ADV-03` | `DEFERRED` | Extended races: refresh vs refresh/logout/logout-all/password change/account disable/device revoke and multi-device ordering | Disposable PostgreSQL and deterministic synchronization hooks | Per-race state table proving no cross-identity or post-revocation session |
| `AUTH-ADV-04` | `DEFERRED` | Independent authentication/session security review | Frozen implementation and exact provenance | Independent findings report with closure evidence for accepted HIGH/MEDIUM items |
| `AUTH-ADV-05` | `DEFERRED` | Comprehensive Customer auth/session threat-model review | Agreed system boundaries, assets, actors, and deployment topology | Reviewed threat model, trust boundaries, mitigations, owners, and residual-risk decisions |
| `AUTH-ADV-06` | `DEFERRED` | Refresh theft/replay containment and incident telemetry review | Privacy-approved telemetry design; synthetic credentials only | Detection/containment runbook, redacted alert evidence, false-positive analysis |
| `AUTH-ADV-07` | `DEFERRED` | Distributed rate limiting and abuse-control validation | Actual multi-instance topology and approved shared limiter design | Cross-instance enforcement, availability behavior, monitoring, and rollback proof |
| `AUTH-ADV-08` | `DEFERRED` | JWT signing-key rotation and long-lived credential lifecycle review | Approved key-management plan and isolated rotation rehearsal | Old/new key transition, session invalidation rules, recovery and rollback evidence |
| `AUTH-ADV-09` | `DEFERRED` | Android secure credential storage, backup/restore, device migration, and rooted-device risk review | R10 implementation complete on approved test devices | Storage/backup policy evidence, migration behavior, logout wipe, device matrix |
| `AUTH-ADV-10` | `DEFERRED` | Refresh-row retention, cleanup, capacity, observability, and redaction audit | Representative synthetic volume and agreed retention policy | Cleanup correctness, index/capacity report, dashboards, zero raw-credential logging |

## Safeguards for every deferred item

- Use disposable/local systems unless a later prompt explicitly authorizes another isolated environment.
- Never use production or staging secrets, databases, sessions, or real Customer credentials.
- Never place raw access/refresh credentials in logs, fixtures, reports, screenshots, or issue trackers.
- A review or test authorization does not authorize exploitation, production mutation, deployment, migration apply, push, PR, or merge.
- Keep Customer, Seller, and Admin authorities isolated and fail closed on ambiguous identity.
- Record exact branch/HEAD/tree, environment, commands, timeouts, and cleanup evidence for each future run.

`POST_LAUNCH_ADVANCED_SECURITY_BACKLOG: READY`
