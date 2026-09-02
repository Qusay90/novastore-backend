# NovaBot Modes and Provider Inventory — R11-R5

## Authority and audit boundary

- Customer Android authority: `71464a39d1b2bb0a00819981e66da4b7c54493f0` / tree `cda756c25abd93f63a759d138259400360a4c42d`.
- Read-only PC1 / Customer Web authority: `47c085973ecd27bb3e8577b2cd48fb4d36523ffa` / tree `91bf3f5f4c1898e81fff300ee3506a8c6b4f64bf`.
- This inventory is source-contract evidence. It does not inspect environment values, provider credentials, tokens, billing state, or private conversations, and it does not call an external AI provider.
- Consequently, Gemini support in source is proven, but the active PC1 process's real provider readiness is deliberately reported as `NOT_SAFELY_OBSERVABLE_WITH_CURRENT_CONTRACT` rather than guessed.

## Executive finding

PC1 already contains a reusable NovaBot chat endpoint, nine canonical mode definitions, nine distinct server-owned system-prompt profiles, server-owned Gemini/OpenAI provider adapters, deterministic tool handling, optional guest chat, authenticated escalation, and an explicit chat rate limit. The authoritative Customer Android adapter now bounds optional `selectedMode` input to those nine canonical IDs, normalizes bounded `availableModes`, and cross-validates the returned active mode against the returned list. Production Android nevertheless exposes no mode selector and sends no selected mode because PC1 still has no safe assistant-capability authority. It therefore operates as basic NovaBot in the server default `friendly` mode unless PC1 recognizes a natural-language alias.

R11-R5 completed the Android-owned NovaBot experience: one global launcher, drag/snap/presentation persistence, hide/fix/movable/reset controls, Settings/Help recovery, safe overlap avoidance, nested-scroll boundary transfer, keyboard-safe composer behavior, and real basic PC1 chat. The final physical layout keeps the conversation actions contiguous in the order `messages -> suggestions -> composer -> support handoff`; the composer-to-handoff gap is 12 CSS px and the previous empty spacer is gone. Real advanced-mode exposure remains blocked by one server contract gap: PC1 has no safe assistant capability endpoint that reports current provider/mode availability without exposing credentials. PC1 also bounds mode text but silently coerces an unsupported mode to `friendly` instead of strictly rejecting it. A client-only mode selector would therefore be cosmetic and is prohibited.

Result:

```text
NOVABOT_PROVIDER_ARCHITECTURE: EXISTING_AND_REUSABLE
NOVABOT_CANONICAL_MODE_REGISTRY: EXISTING_AND_REUSABLE
NOVABOT_ANDROID_PRESENTATION_AND_INTERACTION: PASS
NOVABOT_ANDROID_MODE_ADAPTER_VALIDATION: PASS
NOVABOT_ANDROID_MODE_UI: WITHHELD_PENDING_SERVER_CAPABILITY_CONTRACT
NOVABOT_SAFE_CAPABILITY_ENDPOINT: MISSING_SERVER_CONTRACT
NOVABOT_STRICT_SERVER_MODE_VALIDATION: PARTIAL
NOVABOT_LIVE_PROVIDER_RUNTIME_STATE: EXTERNAL_PROVIDER_GATE
NOVABOT_ADVANCED_MODES_CLASSIFICATION: PROVIDER_SECURITY_EXCEPTION
EXACT_PC1_NOVABOT_MODES_HANDOFF_REQUIRED: YES
```

## Current endpoint inventory

| Surface | Current contract | Authentication | Classification | Evidence |
|---|---|---|---|---|
| Chat | `POST /api/assistant/chat`; exact body keys are `message`, `history`, `context` | Optional Customer bearer. No header means guest; a malformed or invalid supplied bearer fails authentication. | `EXISTING_AND_REUSABLE` | PC1 `routes/assistantRoutes.js:7-10`, `controllers/assistantController.js:12-79,100-121`, `middlewares/authMiddleware.js:131-147`, `server.js:433-434` |
| Escalation | `POST /api/assistant/escalate`; bounded `summary`; writes a real support escalation | Authenticated Customer required | `EXISTING_AND_REUSABLE`, separate from mode capability | PC1 `controllers/assistantController.js:125-160` |
| Assistant capabilities | No `GET /api/assistant/capabilities` or equivalent route exists | None defined | `MISSING_SERVER_CONTRACT` | PC1 `routes/assistantRoutes.js:1-12`; repository-wide assistant endpoint search |
| Customer Android bridge | Exact allowlisted optional-auth `POST /api/assistant/chat` | Sends bearer only for a verified Customer session; guest request otherwise | `EXISTING_AND_REUSABLE` | Customer `v413-ui/src/notifications/customerNotificationApi.ts:69-96,426-452,740-743`; `v413-ui/android/app/src/main/java/com/novastore/app/NovaNotificationApiPlugin.java:58-91,97-116` |
| Customer Android capability bridge | No assistant capability GET path is allowlisted | None | `MISSING_SERVER_CONTRACT` | Customer `v413-ui/src/notifications/customerNotificationApi.ts:69-96`; native plugin exact GET allowlist |

## Canonical mode registry

The authoritative current mode IDs and labels are defined by PC1, not by this document:

| Mode ID | PC1 label | Safe description from the PC1 profile | Current server behavior |
|---|---|---|---|
| `professional` | `Profesyonel Mod` | Net ve resmi yardım | Distinct live-provider system prompt |
| `friendly` | `Samimi Mod` | Sıcak ve anlaşılır yardım | Default; distinct live-provider system prompt |
| `buddy` | `Kanka Modu` | Rahat, yakın ve saygılı yardım | Distinct live-provider prompt; also has a specific deterministic social reply |
| `funny` | `Komik Mod` | Hafif esprili fakat bilgilendirici yardım | Distinct live-provider prompt; also has a specific deterministic social reply |
| `witty` | `Alayci Ama Saygili Mod` | Hafif iğneleyici fakat saygılı yardım | Distinct live-provider system prompt |
| `quick` | `Hızlı Mod` | Kısa ve net yardım | Distinct live-provider prompt; also has a specific deterministic social reply |
| `detailed` | `Detaycı Mod` | Ayrıntılı karşılaştırmalı yardım | Distinct live-provider system prompt |
| `technical` | `Teknik Uzman Modu` | Teknik kriter odaklı yardım | Distinct live-provider system prompt |
| `sales` | `Satış Danışmanı Modu` | İhtiyaç ve bütçe odaklı yardım | Distinct live-provider system prompt |

Evidence: PC1 `services/assistantOrchestrator.js:9-61`; `services/llmRewriteService.js:15-57`.

PC1 returns these modes as `availableModes` from normal chat results and mode-change results (`services/assistantOrchestrator.js:136-182,185-224,254-274`). This is useful response metadata, but it is not a safe readiness/capability contract: it is returned regardless of whether the active provider can genuinely implement all nine modes.

## Current mode validation and reachability

### Server

- The controller rejects unknown request/body/context keys and bounds mode text to 32 characters (`controllers/assistantController.js:12-79`). This prevents a client from sending an arbitrary `systemPrompt` field.
- The orchestrator owns the prompt profiles; Android cannot submit a system prompt (`services/llmRewriteService.js:15-57`).
- However, `normalizeMode` accepts any bounded string and silently maps an unsupported ID to `friendly` (`services/assistantOrchestrator.js:63-78`). That is safe coercion, but it is not the required strict allowlist rejection.
- A mode can also be selected by matching aliases embedded in the user's natural-language message (`services/assistantOrchestrator.js:63-77,136-162`).

### Current authoritative Customer Android

- The transport adapter owns a closed nine-ID client boundary for request/response normalization. Optional `selectedMode` is accepted only when it matches a canonical ID and is emitted solely as `context.selectedMode` (`v413-ui/src/assistant/customerNovaBotApi.ts`).
- The response type and normalizer include bounded `availableModes`; duplicate/unknown mode entries are rejected, and a returned active mode must occur in a non-empty returned list (`v413-ui/src/assistant/customerNovaBotApi.ts`).
- `sendCustomerNovaBotMessage` calls only `POST /api/assistant/chat`; there is still no capability fetch because no authoritative capability GET contract exists.
- Production `NovaBotScreen` deliberately has no selected-mode state or selector and sends `{ message, history }` without `selectedMode`. PC1 therefore resolves it to `friendly` unless the message itself contains a recognized alias.
- `novabotPresentation.tsx` owns the single global launcher and its presentation-only device preference. R11-R5 verifies drag threshold disambiguation, left/right snap, safe vertical persistence, hide/fix/movable/reset, recovery from Settings and Help, nested chat-to-page scroll chaining, and composer visibility above the Android keyboard. Physical post-layout evidence also verifies 8 CSS px from suggestions to composer, 12 CSS px from composer to the support handoff, and zero keyboard overlap.

Classification: Android presentation/interaction is `NATIVE_EQUIVALENT`; advanced provider mode exposure is `PROVIDER_SECURITY_EXCEPTION` until the exact PC1 handoff lands. The adapter preparation does not make an unadvertised mode selectable.

### Customer Web and obsolete native source

- Current Customer Web sends `context.selectedMode`, normalizes returned `mode`/`modeLabel`, and starts at `friendly` (`storefront-commerce-pro/src/adapters/assistantAdapter.js:62-100`; `storefront-commerce-pro/src/integration/assistantConversationState.js:18-49`). Its current widget displays the active mode but has no complete server-capability-driven selector (`storefront-commerce-pro/src/AssistantWidget.jsx:128-167,238-242`). Classification: `PARTIAL`.
- The older Compose application contains a nine-mode selector and parses `availableModes` (`app/src/main/java/com/novastore/app/data/model/AssistantModels.kt:5-44`; `app/src/main/java/com/novastore/app/feature/support/SupportViewModel.kt:58-80,226-232,300-318`; `SupportScreen.kt:213-249,377-405`). That application is not the authoritative R11 Customer app. Classification: `OBSOLETE`; it is historical design evidence only and must not be restored as the active app.

## Provider and model architecture

| Provider path | Server-owned configuration | Mode fidelity | Classification |
|---|---|---|---|
| Gemini | Provider selection and fallback are server environment configuration; Gemini key, model and base URL are consumed only inside the PC1 provider adapter. Default model in source is `gemini-2.5-flash`. | Receives the server-built mode-specific system prompt and tool definitions. | Source `EXISTING_AND_REUSABLE`; runtime `EXTERNAL_PROVIDER_GATE` |
| OpenAI | Server-owned key/model/base URL; source default model `gpt-4o-mini`. | Receives the same server-built mode-specific system prompt and tool definitions. | Source `EXISTING_AND_REUSABLE`; runtime not asserted |
| Ollama | Server-owned base URL and model; source default model `llama3.1`. | Current implementation returns a simple no-agent echo and does not consume the system prompt/history. | `PARTIAL` for advanced modes |
| Mock/deterministic fallback | No client credential; server fallback. | Core product/support behavior remains grounded, but only a subset of social replies is mode-distinct. It cannot truthfully advertise all nine advanced modes as behaviorally equivalent to live providers. | `PARTIAL` for advanced modes; reusable basic fallback |

Evidence: PC1 `config/appConfig.js:127-153`; `services/aiProviderService.js:7-27,407-510,512-668,670-851`; `services/llmRewriteService.js:150-173`; `services/assistantOrchestrator.js:121-134,227-274`.

Provider calls are guarded by the PC1 external-side-effect policy and time out after a bounded interval. Provider configuration, keys and raw provider credentials are never part of the Customer request or normalized Android response. The current source defaults to `mock` when `AI_PROVIDER` is absent, but the active process may override that. Because no safe capability endpoint exists and credential inspection is out of scope, the live process must not be reported as Gemini-ready or Gemini-unready from this audit.

## Rate limits

- `POST /api/assistant/chat`: 30 requests per 5-minute in-memory bucket keyed by request IP and path (`routes/assistantRoutes.js:5-9`; `middlewares/securityMiddleware.js:3-33`).
- `POST /api/assistant/escalate`: no assistant-route-specific limiter is attached in `assistantRoutes.js`; other global middleware is outside this narrow inventory.
- Provider network timeout: 15 seconds, bounded to the 1–60 second range for injected/test values (`services/aiProviderService.js:10-27`).

## Authentication, guest behavior, and ownership

- Guest chat is intentional: no Authorization header produces `user = null` and the deterministic/public catalog portions remain usable.
- A valid Customer bearer attaches the authenticated Customer to the request. Ownership-sensitive tools such as order support receive that server-verified principal (`middlewares/authMiddleware.js:131-147`; `services/llmRewriteService.js:125-129,150-160`).
- A malformed or invalid supplied bearer is not downgraded to guest; it returns an authentication error.
- Escalation requires a verified Customer and creates an owned support escalation (`controllers/assistantController.js:125-160`).
- Android sends an empty token for guest chat and a bearer only for the currently verified session; the native bridge separately rejects malformed optional tokens (`v413-ui/src/assistant/customerNovaBotApi.ts:215-223`; `NovaNotificationApiPlugin.java:97-116`).

## Conversation and mode persistence

There is no server-side NovaBot conversation ID, conversation table, or durable NovaBot history contract in the inspected endpoint. Each chat request carries up to ten client-supplied history items; PC1 validates them and uses them only for that provider invocation (`controllers/assistantController.js:12-79,100-106`).

- Current Android: chat history is React component memory. It is reset when the verified session identity changes and is not written to local storage. Only the non-secret launcher presentation preference (`novastore.novabot.presentation.v1`) is device-local; it contains edge/vertical/movable/hidden presentation fields, not chat content, credentials, or account truth.
- Current Customer Web: conversation state is process/page memory scoped by `guest` or `customer:<id>` plus an instance ID; stale updates from another owner/instance are rejected (`storefront-commerce-pro/src/integration/assistantConversationState.js:8-49`).
- PC1: transient request history is client-owned. The separate authenticated escalation path persists a real support-thread/message record; that must not be confused with persistent NovaBot chat history.
- Current mode persistence is conversation-memory only and defaults to `friendly`. There is no canonical server preference contract.

Classification: transient conversation isolation is `EXISTING_AND_REUSABLE`; durable NovaBot history or account-wide mode preference is `MISSING_SERVER_CONTRACT` and is not required for the proposed conversation-scoped mode closure.

## Exact PC1 NovaBot modes handoff

PC1 must own this handoff. Customer Android must not fabricate its response.

### 1. Safe capability endpoint

Add:

```http
GET /api/assistant/capabilities
Cache-Control: private, no-store
Authorization: optional Customer bearer
```

Absent bearer is allowed. A malformed, invalid, wrong-principal or revoked supplied bearer must fail with the existing generic authentication boundary rather than downgrade to guest. Apply a bounded per-IP/path limiter.

Success schema, with an exact top-level allowlist:

```json
{
  "schemaVersion": 1,
  "assistantAvailable": true,
  "modeProviderAvailable": false,
  "providerState": "not_configured",
  "defaultMode": "friendly",
  "supportedModes": [
    {
      "id": "friendly",
      "label": "Samimi Mod",
      "description": "Sıcak ve anlaşılır şekilde yardımcı olur."
    }
  ],
  "modePersistence": "conversation",
  "limits": {
    "messageMaxLength": 2000,
    "historyMaxItems": 10,
    "historyMessageMaxLength": 2000
  }
}
```

Contract rules:

- `providerState` is a safe enum only: `ready`, `not_configured`, `policy_blocked`, or `temporarily_unavailable`.
- Do not return provider keys, tokens, credentials, billing identifiers, raw provider errors, base URLs, internal model prompts, or unrestricted environment data.
- `supportedModes` contains only IDs the active server/provider path can implement with genuinely distinct behavior at that moment. An available basic deterministic assistant may set `assistantAvailable: true` while `modeProviderAvailable: false` and return no advanced modes.
- When the configured provider becomes ready, the endpoint may expose the canonical server modes immediately; Android must not require a release merely to learn the new list.
- `defaultMode` must be either one of `supportedModes` or `null` when no real mode is currently available.
- `modePersistence: "conversation"` is the required initial policy. Do not introduce account persistence until a separate authenticated preference contract exists.

### 2. Strict assistant request contract

Preserve the existing endpoint and compatible body:

```http
POST /api/assistant/chat
```

```json
{
  "message": "string, 1..2000",
  "history": [
    { "role": "user|assistant", "message": "string, 1..2000" }
  ],
  "context": {
    "selectedMode": "server-advertised mode ID"
  }
}
```

Rules:

- Keep the exact body/history/context key allowlists. Never accept a client `systemPrompt`, prompt profile, provider, model, tool definition, API key, or arbitrary provider option.
- Omitted `selectedMode` uses the current server default only when that default is available.
- A supplied mode must exactly match a currently supported server mode. Remove silent coercion of unknown mode IDs to `friendly`.
- The server continues to build the mode prompt and choose the provider. The client controls only the allowlisted mode ID.
- Preserve optional guest chat. Ownership-sensitive tools continue to use only the verified server principal.
- Preserve `mode`, `modeLabel`, and `availableModes` in chat responses for backward compatibility, but the capability endpoint is the readiness authority.

### 3. Expected safe errors

| HTTP | Code | Meaning |
|---|---|---|
| 400 | `ASSISTANT_INPUT_INVALID` | Invalid shape, length, role or unknown field |
| 400 | `ASSISTANT_MODE_UNSUPPORTED` | Mode ID is not in the canonical server registry |
| 409 | `ASSISTANT_MODE_UNAVAILABLE` | Mode was valid but provider capability changed before chat execution |
| 401 | existing generic auth error | A supplied bearer is invalid/revoked/wrong-principal |
| 429 | existing bounded rate-limit response | Request budget exceeded |
| 503 | `ASSISTANT_PROVIDER_UNAVAILABLE` | No safe real execution path exists for the selected mode |

Errors must not contain provider payloads, credentials, model prompts, tokens, stack traces or customer-private history.

### 4. Required PC1 tests

1. Capability response uses exact keys, `private, no-store`, bounded arrays/text and safe enums.
2. Provider-not-configured returns truthful basic-assistant versus advanced-mode availability and exposes zero credential/config fields.
3. Ready-provider test double returns only the canonical server-supported mode IDs; provider state changes are reflected without client/release changes.
4. Every advertised mode maps to a distinct server-owned prompt/profile and is passed to the selected live-provider adapter.
5. Unknown, overlong, malformed and currently unavailable modes fail before any provider/tool call.
6. Client attempts to send `systemPrompt`, provider/model selection, tool definitions or extra context keys return `ASSISTANT_INPUT_INVALID` with zero provider calls.
7. Omitted mode selects the advertised default; no advertised default means no fabricated advanced mode.
8. Guest chat succeeds for public/deterministic behavior; valid Customer chat supplies only the verified principal to ownership-sensitive tools; invalid supplied bearer fails rather than becoming guest.
9. Customer A history/principal cannot be observed by Customer B; the server stores no transient chat history unless a separately authorized persistence contract is added.
10. Authenticated escalation remains owner-bound and is not made available to guests through a mode change.
11. Rate-limit and 15-second provider-timeout behavior remain bounded; capability probing is independently bounded.
12. Gemini/OpenAI/fallback tests use injected doubles and assert that logs/responses contain no key, bearer, raw provider payload or private history.
13. When a live provider fails over to a non-mode-equivalent deterministic path, capabilities stop advertising advanced modes rather than presenting identical cosmetic behavior.
14. Existing product search, comparison, cart-confirmation, order-ownership, policy and live-support regressions remain green.

### 5. Required Customer Android follow-up after PC1 lands

- Exact-allowlist `GET /api/assistant/capabilities` in TypeScript and native transport.
- Strict capability response normalizer with bounded server IDs/labels/descriptions and safe enum parsing.
- Render one compact selector only from `supportedModes`; hide it when no real modes are available.
- Send only the selected advertised ID; reset/clamp selection when capability changes.
- Keep the selection conversation-scoped and clear it on Customer identity change.
- Continue to reject arbitrary client mode IDs even though PC1 is authoritative.
- Verify at least two advertised modes through an injected/authorized provider UAT and demonstrate materially distinct responses; compile-only or changed labels are insufficient.

## Final inventory conclusion

```text
EXISTING_ASSISTANT_ENDPOINT: POST /api/assistant/chat
EXISTING_ESCALATION_ENDPOINT: POST /api/assistant/escalate
SAFE_PROVIDER_CAPABILITY_ENDPOINT: NONE
CANONICAL_MODE_COUNT: 9
ANDROID_PRESENTATION_AND_INTERACTION: PASS
ANDROID_COMPOSER_BEFORE_SUPPORT_HANDOFF: PASS
ANDROID_COMPOSER_KEYBOARD_OVERLAP: 0
ANDROID_SELECTED_MODE_ADAPTER_ALLOWLIST: 9_CANONICAL_IDS
ANDROID_AVAILABLE_MODES_RESPONSE_VALIDATION: PASS
ANDROID_MODE_SELECTOR_REACHABLE: NO_PROVIDER_GATED
ANDROID_SELECTED_MODE_SENT: NO_BY_POLICY
SERVER_OWNS_SYSTEM_PROMPTS: YES
ARBITRARY_SYSTEM_PROMPT_FROM_CLIENT: 0
UNSUPPORTED_MODE_STRICTLY_REJECTED: NO
GEMINI_SOURCE_ADAPTER: PRESENT
GEMINI_RUNTIME_READY: NOT_SAFELY_OBSERVABLE_WITH_CURRENT_CONTRACT
PROVIDER_SECRET_EXPOSED_TO_ANDROID: 0
SERVER_NOVABOT_CONVERSATION_STORAGE: NONE
CLIENT_CONVERSATION_STORAGE: TRANSIENT_AND_SESSION_SCOPED
ANDROID_PRESENTATION_STORAGE: NON_SECRET_DEVICE_LOCAL_ONLY
ADVANCED_MODES_CLASSIFICATION: PROVIDER_SECURITY_EXCEPTION
EXACT_PC1_NOVABOT_MODES_HANDOFF_REQUIRED: YES
```
