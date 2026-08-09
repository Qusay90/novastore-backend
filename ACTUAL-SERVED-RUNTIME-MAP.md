# Actual served runtime map

PC1 prompt: `PC1-MACRO-WAVE-3R3-HUMAN-VISUAL-REJECTION-OFFICIAL-RUNTIME-AND-ADMIN-PRIVACY-CORRECTION`

## Immutable starting point

- Branch: `codex/storefront-admin-macro-wave-3-reconciliation`
- Git HEAD: `7a30ed08c1cf09e9bc2b3c08aab927b996b43848`
- Git tree: `f2448c9b986090a33b79c4fc12efd691bad7182f`
- Sole parent: `b88961cd27690e1592bfffee994703d704334bc9`
- Initial index/worktree/untracked state: clean / clean / zero

## Owner-rejected runtime observed before correction

| URL | Port / process | Entry HTML | JavaScript entry | Source component | Served document SHA-256 | Runtime mode | Classification |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `http://127.0.0.1:5173/` | 5173 / PID 31324 (`vite --port 5173`) | `storefront-commerce-pro/index.html` | `/src/main.jsx` | `src/App.jsx` | `cb272c287bdaeb96c6424cd18ec773b19f09a90e0030074371a22ddefc213000` | Vite reference preview | canonical/reference; wrong official proof entry |
| `http://127.0.0.1:5173/integrated.html` | 5173 / same process | `storefront-commerce-pro/integrated.html` | `/src/main-integrated.jsx` | `src/IntegratedApp.jsx` | `60e4be468a03b1da17de4346ff5f370a5ea90d74978e10bab69128ae9e22ebe3` | Vite source-integrated preview | integrated source, but not the generated official artifact and no same-origin API runtime |
| `http://127.0.0.1:5174/` | 5174 / PID 7128 (`vite --port 5174`) | `admin-commerce-pro/index.html` | `/src/main.jsx` | `src/App.jsx` + `previewModel.js` | `e7a65deeced21f6fbc93c805a5893d524d8d4022d0d9da8b5ac9556806802732` | Vite mock/design preview | canonical/reference Admin preview; wrong official proof entry |
| `http://127.0.0.1:5174/integrated.html` | 5174 / same process | `admin-commerce-pro/integrated.html` | `/src/main-integrated.jsx` | `src/IntegratedApp.jsx` | `bbc75b50810e668e0b95782a66a1281318e6ce9a0159ac46cc7b0e4f29ba4f0a` | Vite source-integrated preview | integrated source, but not the generated same-origin live artifact |

The rejected storefront page exposed Barlow/Barlow Condensed, one header and one footer brand star, no `Hemen Al`, and only local pressed-state comparison. The rejected Admin root identified itself as `admin-shell` / “Commerce Pro önizlemesi” and loaded deterministic preview records rather than the live integrated adapter.

## Root-cause decision

- Stale process: **not the primary cause**; both listeners were current Vite processes from the commands supplied to the owner.
- Stale generated artifact: **not the primary cause**; the browser never loaded either generated official artifact.
- Wrong Vite/HTML entry and wrong build being served: **yes**.
- Canonical/reference surface served instead of integrated surface: **yes**.
- Browser, service worker, or Cache Storage issue: **no**; no controller, registration, cache key, or committed registration path was present.
- Missing implementation: the integrated source already owned Buy Now and comparison; brand DOM removal, pointer modality handling, and the seller-summary privacy contract still required source changes.

## Official generated-runtime contract

| Official surface | Generated artifact | Entry identity | Source boundary | Required served mode |
| --- | --- | --- | --- | --- |
| Storefront | `frontend/commerce-pro/index.html` | `production-candidate` / `src/main-integrated.jsx` | `IntegratedApp:createCommerceRuntime` | `INTEGRATED_COMMERCE_PRO` |
| Admin | `frontend/admin-commerce-pro-live.html` | `integrated` / `src/main-integrated.jsx` | `IntegratedApp` + same-origin Admin adapter | `INTEGRATED_COMMERCE_PRO_ADMIN` |

The standalone Vite roots remain reference/development surfaces. Runtime acceptance must use the two generated artifacts above, served on clean loopback-only review listeners with deterministic local read data and no remote HTTP or database connection.

## Process cleanup

After source/entry classification was complete, the verified task-owned process trees rooted at npm PIDs 18668 and 31288 (including Vite listener PIDs 31324 and 7128) were stopped. Ports 5173 and 5174 had no remaining listeners. Unrelated processes were not terminated.

An unrelated Vite listener from `android-customer-visual-calibration-v2` later appeared on 127.0.0.1:5173 (PID 16868). It is not owned by this task and was preserved. To keep the correction proof exact and collision-free, this task's official generated-artifact review server binds only 127.0.0.1:5273 and 127.0.0.1:5274.

## Final served identity

The official rebuild was served by `scripts/serveOfficialRuntimeReview.mjs` (one loopback-only Node process). It serves the generated artifacts, the Storefront's two required shared runtime modules, and deterministic same-origin read fixtures. It rejects non-loopback hosts and methods other than GET/HEAD, imports no database module, makes no provider call, and fails closed unless both generated artifact bytes match the expected review digests.

- Official storefront URL: `http://127.0.0.1:5273/`
- Official storefront artifact SHA-256: `4ab340b774233ad35832eb277ef1de16a79e0c1f396f3d7079842db80ba01fef`
- Official storefront served mode: `INTEGRATED_COMMERCE_PRO`
- Official Admin URL: `http://127.0.0.1:5274/admin-commerce-pro-live.html#/sellerApplications`
- Official Admin artifact SHA-256: `9d0de6c5c250ce19eb442faf9ddd790fdac753ff989b338fc2b7ae91e01dab54`
- Official Admin served mode: `INTEGRATED_COMMERCE_PRO_ADMIN`
- Deterministic local-data state: canonical local Storefront catalog through the real same-origin read adapter; two synthetic platform-admin store summaries with separate detail reads; no staging/production data. The Admin dashboard visibly marks finance, order, and account metrics unavailable rather than presenting synthetic zero values.
- Browser context: fresh task-owned Chrome profile, cache disabled, service worker bypassed; controller/registrations/CacheStorage all zero
- Remote HTTP request count: `0`
- Mutation/payment request count: `0`
- Remote database connection count: `0`
- Evidence directory: `C:\Users\kusay\.codex\visualizations\2026\08\06\019fd68a-a64c-78e3-9228-9d856911e920\pc1-macro-wave-3r3-20260809`
- Evidence note: screenshot metadata is refreshed after the single final commit so every file records the resulting Git HEAD; the immutable artifact hashes above do not depend on that metadata refresh
