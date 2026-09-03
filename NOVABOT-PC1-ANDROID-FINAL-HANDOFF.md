# NovaBot PC1 → Customer Android Final Handoff

Contract version: `novabot-modes-v1`

PC1 base: `8c78f785a6e4080643cdc63b7254ab38b9a4c838`
Android consumer authority inspected read-only: `047617d5a49766ee4136b89c221baa514d40b630` / tree `255cb355b755b586240e040ca788412d21000f8c`

## 1. Capability endpoint

`GET /api/assistant/capability`

- Authentication: public; do not send a bearer token solely for this request.
- Cache: private/no-store response headers are applied.
- Rate limit: 60 requests per 5 minutes per IP and route.
- The response is evaluated from current server environment and runtime policy on every request. Android must not persist provider readiness as a build-time fact.

Schema:

```json
{
  "contractVersion": "novabot-modes-v1",
  "available": true,
  "provider": {
    "configured": false,
    "ready": false
  },
  "advancedModesAvailable": false,
  "modeSelectionAvailable": false,
  "defaultModeId": "friendly",
  "modes": [
    {
      "id": "friendly",
      "label": "Samimi Mod",
      "description": "Sıcak, günlük ve anlaşılır bir dille yardımcı olur."
    }
  ],
  "unavailableReason": "ADVANCED_PROVIDER_NOT_SELECTED"
}
```

Rules:

- Render only modes returned by the server. Do not keep the current nine-item Android hard-coded list as a fallback taxonomy.
- Select `defaultModeId` only if it exists in `modes`; otherwise select the first returned item.
- `modeSelectionAvailable=false` means keep the available base mode but disable/hide mode switching.
- When provider `configured=true` and `ready=true`, the same endpoint returns all currently runnable registry modes. A new Android release is not needed merely to activate server configuration.
- `unavailableReason` is a bounded code for UI state; never show it as raw technical copy.

## 2. Chat endpoint

`POST /api/assistant/chat`

Canonical request:

```json
{
  "message": "Bütçeme uygun bir ürün önerir misin?",
  "history": [
    { "role": "user", "message": "Merhaba" },
    { "role": "assistant", "message": "Merhaba, nasıl yardımcı olabilirim?" }
  ],
  "modeId": "friendly"
}
```

- `message`: required string, 1–2000 characters after server normalization.
- `history`: optional array, at most 10 items. Each item contains only `role` (`user` or `assistant`) and `message` (1–2000 characters).
- `modeId`: optional only for compatibility with base chat; when sent it must exactly match an ID returned by the latest capability response.
- Never send a system prompt, profile ID, provider/model name, tool list, customer ID or conversation owner ID.
- Current Android’s `context.selectedMode` remains accepted only as a strict, allowlisted transition path. New Android code must use top-level `modeId`. If legacy and canonical fields conflict, the request is rejected.

Safe response fields:

- `reply`, `message`
- `modeId` and legacy alias `mode`
- `modeLabel`
- `availableModes` (compatibility projection; capability remains the authority)
- `intent`, `confidence`, `suggestions`
- verified `products`, `cards`, `comparison`
- `requiresConfirmation`, `pendingAction`, `allowEscalation`, `escalated`
- `citations`

No provider credential, provider/model identifier, raw prompt or tool implementation is present in the response.

## 3. Mode and provider behavior

- Canonical IDs: `professional`, `friendly`, `buddy`, `funny`, `witty`, `quick`, `detailed`, `technical`, `sales`.
- The registry is owned only by `services/novabotModeRegistry.js`.
- All nine have distinct server profile/model-policy identifiers and server-side generation behavior.
- With no mode-capable external provider, only `friendly` is returned as available. Requests for the other eight return `503 NOVABOT_MODE_PROVIDER_UNAVAILABLE`; Android must keep the message draft and offer retry/base-mode recovery.
- Unknown mode: `400 NOVABOT_MODE_UNSUPPORTED`.
- Empty, malformed or whitespace-modified mode: `400 NOVABOT_MODE_INVALID`.
- Arbitrary request fields such as prompt/model/tools: `400 ASSISTANT_INPUT_INVALID`.

## 4. Authentication, ownership and persistence

- Guest chat is supported. If no bearer token is sent, private order data is not queried or returned.
- If a bearer token is sent, it must be the current customer session. Invalid/revoked/wrong-principal tokens fail safely.
- Order lookup is constrained by both order ID and authenticated customer ID. A guest receives an authentication requirement, not private data.
- `POST /api/assistant/escalate` requires an authenticated customer and creates a support thread for that authenticated user only.
- The server does not persist chat history or an account-wide mode preference. Android owns ephemeral per-conversation UI state and sends the bounded history/mode on each request.
- Reset conversation state, selected mode and pending operations when moving between Customer A, Customer B and guest. Give every new guest conversation epoch a distinct local instance ID so late callbacks cannot write into a later guest session.
- Do not send customer ID, guest ID or conversation owner ID in the chat body. The bearer token is the only authenticated principal authority.

## 5. Safe errors and retry behavior

| HTTP | CODE | Android behavior |
|---:|---|---|
| 400 | `ASSISTANT_INPUT_INVALID` | Keep draft, correct request schema; do not retry unchanged. |
| 400 | `NOVABOT_MODE_INVALID` | Refresh capability and fall back to a returned mode. |
| 400 | `NOVABOT_MODE_UNSUPPORTED` | Refresh capability; never invent a replacement ID. |
| 401 | Authentication error | Clear only the stale customer session through the existing auth path; guest chat may be retried without the invalid bearer token. |
| 429 | `NOVABOT_RATE_LIMITED` | Honor the integer-seconds `Retry-After` header; changing mode does not bypass the bucket. |
| 503 | `NOVABOT_MODE_PROVIDER_UNAVAILABLE` | Preserve draft; refresh capability, offer `friendly` if returned, or retry later. |
| 503 | Staging/external-side-effect policy error | Show a safe unavailable state; do not expose technical/provider details. |
| 500 | `NOVABOT_CHAT_UNAVAILABLE` | Show generic retry state; do not display raw server/provider text. |

Chat limit is 30 requests per 5 minutes per IP and `/chat` route. All `modeId` values share that same bucket.

## 6. Expected Android UI flow

1. Open NovaBot.
2. Fetch capability.
3. NovaBot header → “Sohbet Modu” / “Modlar”.
4. Render only server-returned modes using `label` and `description`.
5. Keep the selected ID in the current conversation state.
6. Send selected top-level `modeId` with each message.
7. On session/principal/conversation reset, clear mode/history/pending callback state and fetch capability again.
8. Keep existing loading, content, empty/unavailable, offline, 401, 429 and retry states accessible to TalkBack and keyboard/D-pad navigation.

Android must never contain or request a Gemini key, provider credential, raw system prompt, provider model value, billing detail or server tool implementation.
