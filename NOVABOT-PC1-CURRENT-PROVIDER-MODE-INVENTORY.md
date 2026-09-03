# NovaBot PC1 Current Provider and Mode Inventory

Verified on 2026-09-03 from PC1 base `8c78f785a6e4080643cdc63b7254ab38b9a4c838`.

## Current provider state

| Item | Verified state |
|---|---|
| Chat route | `POST /api/assistant/chat` |
| Capability route | `GET /api/assistant/capability` |
| Escalation route | `POST /api/assistant/escalate` |
| Provider source | Gemini, OpenAI, Ollama and deterministic mock adapters are present in `services/aiProviderService.js`. |
| Current selected provider | No worktree environment value is set; backend default is deterministic mock. |
| Gemini required configuration currently set | No |
| Gemini runtime ready | No; external provider configuration gate remains. |
| Base chat | `friendly` remains available through deterministic server fallback. |
| Advanced modes | Hidden from the available-mode list until a mode-capable provider is configured and runtime policy allows external AI. |
| Conversation persistence | Server stores no NovaBot transcript or mode preference. History and `modeId` are bounded per request; clients scope them to the current conversation and principal. |
| Authentication | Capability is public. Chat supports guest or customer bearer context. Escalation requires an authenticated customer. |
| Chat rate limit | 30 requests per 5 minutes per IP and route; changing `modeId` does not create a new bucket. |
| Capability rate limit | 60 requests per 5 minutes per IP and route. |
| Message bounds | Current message: 1–2000 characters. History: at most 10 items; each item 1–2000 characters. |
| Tool policy | Server allowlist only; no client-provided tool list is accepted. Mutating cart/support actions retain confirmation or authentication gates. |

## Authoritative mode inventory

The single source is `services/novabotModeRegistry.js`. Full profile instructions are intentionally not reproduced here.

| MODE_ID | DISPLAY_NAME | SAFE_DESCRIPTION | PROFILE_IDENTIFIER | MODEL_POLICY_IDENTIFIER | AUTH_REQUIREMENT | CURRENT_STATUS |
|---|---|---|---|---|---|---|
| `professional` | Profesyonel Mod | Resmî, net ve müşteri hizmetleri odaklı. | `tone-professional-v1` | `balanced-precise-v1` | `OPTIONAL_CUSTOMER_SESSION` | `SOURCE_DEFINED_PROVIDER_GATED` |
| `friendly` | Samimi Mod | Sıcak, günlük ve anlaşılır. | `tone-friendly-v1` | `balanced-conversation-v1` | `OPTIONAL_CUSTOMER_SESSION` | `BASIC_FALLBACK_AVAILABLE` |
| `buddy` | Kanka Modu | Rahat ve yakın; saygıyı korur. | `tone-buddy-v1` | `casual-conversation-v1` | `OPTIONAL_CUSTOMER_SESSION` | `SOURCE_DEFINED_PROVIDER_GATED` |
| `funny` | Komik Mod | Bilgiyi koruyan hafif esprili ve enerjik ton. | `tone-funny-v1` | `playful-conversation-v1` | `OPTIONAL_CUSTOMER_SESSION` | `SOURCE_DEFINED_PROVIDER_GATED` |
| `witty` | Alaycı Ama Saygılı Mod | Hafif nükteli, zeki ve saygılı. | `tone-witty-v1` | `witty-safe-v1` | `OPTIONAL_CUSTOMER_SESSION` | `SOURCE_DEFINED_PROVIDER_GATED` |
| `quick` | Hızlı Mod | Kısa, doğrudan ve yalnız gerekli bilgi. | `response-quick-v1` | `low-latency-concise-v1` | `OPTIONAL_CUSTOMER_SESSION` | `SOURCE_DEFINED_PROVIDER_GATED` |
| `detailed` | Detaycı Mod | Avantaj, dezavantaj ve fiyat-performans ayrıntıları. | `response-detailed-v1` | `extended-analysis-v1` | `OPTIONAL_CUSTOMER_SESSION` | `SOURCE_DEFINED_PROVIDER_GATED` |
| `technical` | Teknik Uzman Modu | Teknik özellik, uyumluluk ve ölçülebilir kriterler. | `response-technical-v1` | `technical-precise-v1` | `OPTIONAL_CUSTOMER_SESSION` | `SOURCE_DEFINED_PROVIDER_GATED` |
| `sales` | Satış Danışmanı Modu | Bütçe, ihtiyaç ve kullanım amacına göre şeffaf öneri. | `response-sales-advisor-v1` | `needs-based-advisor-v1` | `OPTIONAL_CUSTOMER_SESSION` | `SOURCE_DEFINED_PROVIDER_GATED` |

## Safety conclusions

- Canonical mode count: **9**.
- Canonical IDs: `professional`, `friendly`, `buddy`, `funny`, `witty`, `quick`, `detailed`, `technical`, `sales`.
- Each mode has a distinct server profile identifier, model policy identifier, generation budget and server-only behavior instruction.
- Capability responses contain only safe labels/descriptions and booleans. They do not contain provider names, model names, keys, prompts, billing data, file paths or tool implementations.
- Unknown, malformed, empty or conflicting mode values are rejected. Arbitrary prompt, model and tool fields are rejected as unknown request fields.
- When the external provider is absent, only the genuine deterministic `friendly` mode is returned as available. The other eight modes are not represented as operational.
