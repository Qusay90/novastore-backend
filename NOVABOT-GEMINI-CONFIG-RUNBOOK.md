# NovaBot Gemini Configuration Runbook

This runbook records names and safe state only. It contains no credential, model value, endpoint value or billing value.

Verified worktree state on 2026-09-03: no local `.env` file is present and none of the provider variables below is set in the current process environment.

| NAME | SECRET_OR_PUBLIC | REQUIRED | CURRENTLY_SET_BOOLEAN | SOURCE_OWNER |
|---|---|---:|---:|---|
| `AI_PROVIDER` | `PUBLIC_CONFIGURATION` | Yes | `false` | Backend runtime owner |
| `GEMINI_API_KEY` | `SECRET` | Yes | `false` | Secret manager / platform owner |
| `GEMINI_MODEL` | `PUBLIC_CONFIGURATION` | No; server default exists | `false` | Backend runtime owner |
| `GEMINI_BASE_URL` | `PUBLIC_CONFIGURATION` | No; allowlisted server default exists | `false` | Backend runtime owner |
| `AI_PROVIDER_FALLBACK_ENABLED` | `PUBLIC_CONFIGURATION` | No; server default exists | `false` | Backend runtime owner |
| `AI_PROVIDER_FALLBACKS` | `PUBLIC_CONFIGURATION` | No | `false` | Backend runtime owner |

## Activation sequence

1. Keep all provider credentials in the server-side secret manager. Never place them in Git, Customer Web, Android, logs, screenshots or handoff evidence.
2. Select Gemini as the backend provider and provide the required credential through the runtime owner’s configuration channel.
3. Review the deployment environment’s external-side-effect policy. The initial safe staging profile intentionally blocks external AI and must not be weakened as an incidental part of this handoff.
4. Start or restart only the authorized backend runtime after configuration is injected. No client rebuild is required when the API contract remains `novabot-modes-v1`.
5. Read `GET /api/assistant/capability`. Provider `configured` and `ready` must both be true before clients expose the full mode selector.
6. Run a separately authorized, bounded provider UAT. A configured/ready capability proves local configuration and policy readiness; it does not prove upstream credential validity, quota or availability until a real request is authorized.
7. If a provider call fails, preserve safe errors and deterministic `friendly` fallback. Never copy upstream payloads, prompts, credentials or billing details into client responses or logs.

## Safe verification

- Provider absent: capability returns provider booleans false and only `friendly` in `modes`.
- Provider configured test double: capability returns all nine registry modes without returning any configuration value.
- Unsupported or malformed `modeId`: request is rejected before provider execution.
- Real Gemini request: not performed in this wave.

Current external gate: `WAITING_OWNER_PROVIDER_CONFIG`.
