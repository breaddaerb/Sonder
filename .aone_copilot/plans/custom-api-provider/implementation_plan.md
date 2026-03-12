### custom-api-provider ###
Add a panel-based custom API configuration flow (baseURL + API key + model name) to the existing openai-api provider, with test-connection validation, alongside the existing Codex OAuth path.

# 自定义 API 配置功能（BaseURL + API Key + Model）

## Background

Sonder currently supports two provider modes:
- `openai-codex`: Codex OAuth login (browser-based PKCE flow)
- `openai-api`: OpenAI-compatible API using prefs-stored `api`, `secretKey`, and `model`

The `openai-api` path already has full transport support (`requestOpenAIChat` in `src/modules/Meet/OpenAI.ts`) but lacks a proper configuration surface in the new chat panel. Users must currently set baseURL/apiKey/model through Zotero prefs or legacy slash commands — there is no visible panel UI for it.

This feature adds a panel header button that opens a configuration dialog for the `openai-api` provider, allowing users to input a custom baseURL, API key, and model name, with a test-connection step before saving.

## Proposed Changes

### Provider Layer

#### [MODIFY] [provider.ts](file:///Users/zhilin/Work/Sonder/src/modules/provider.ts)

Add helper functions for custom API configuration:

- `getCustomApiConfig()` — reads `api`, `secretKey`, `model` from Zotero prefs and returns a structured object
- `setCustomApiConfig({ baseUrl, apiKey, model })` — writes all three prefs atomically
- `hasCustomApiConfig()` — returns `true` if both `api` and `secretKey` are non-empty
- `clearCustomApiConfig()` — resets `api`, `secretKey`, `model` to defaults
- `getCustomApiStatusLabel()` — returns a human-readable status string for the panel button (e.g. `"Configure API"`, `"API: deepseek-chat"`, `"Clear API"`)

No new `ProviderID` value is added. The existing `"openai-api"` identity is reused.

---

### Transport Layer

#### [MODIFY] [OpenAI.ts](file:///Users/zhilin/Work/Sonder/src/modules/Meet/OpenAI.ts)

Add a `testCustomApiConnection(baseUrl, apiKey, model)` function:

- Sends a minimal Chat Completions request (`POST {baseUrl}/v1/chat/completions`) with a single `"hi"` user message, `max_tokens: 1`, `stream: false`
- Returns `{ success: true, model }` or `{ success: false, error: string }`
- Uses `Zotero.HTTP.request` with a short timeout
- Does **not** modify any stored prefs — this is a pure validation function

The existing `requestOpenAIChat` already reads `api`/`secretKey`/`model` from prefs, so no changes are needed to the main transport path.

---

### Panel UI

#### [MODIFY] [panel.ts](file:///Users/zhilin/Work/Sonder/src/context-chat/panel.ts)

Add a new header button `customApiButton` alongside the existing `codexAuthButton`:

**Button states** (mirroring the Codex auth button pattern):
- When provider is `openai-codex` and no custom API is configured: `"Configure API"` — clicking switches provider to `openai-api` and starts config flow
- When provider is `openai-api` and no custom API is configured: `"Configure API"` — starts config flow
- When provider is `openai-api` and custom API is configured: `"API: {model}"` — clicking offers to reconfigure or clear

**Configuration flow** (sequential browser prompts, matching the Codex paste-back UX pattern):

1. Prompt for **Base URL** (pre-filled with current value or `https://api.openai.com`)
2. Prompt for **API Key** (pre-filled with masked current value if exists)
3. Prompt for **Model Name** (pre-filled with current value or empty, free text)
4. **Test Connection** — call `testCustomApiConnection(baseUrl, apiKey, model)`
   - On success: `alert("Connection successful! Model: {model}")`, then save via `setCustomApiConfig()`
   - On failure: `alert("Connection failed: {error}. Configuration was not saved.")`, do not save
5. Re-render panel to reflect new provider state

**Button placement**: Insert `customApiButton` immediately after `codexAuthButton` in the `actionRow`.

**Render updates**: The `render()` method updates `customApiButton` text/title based on current provider and config state, similar to how `codexAuthButton` is updated.

Add a new private method `handleCustomApiConfig()` that orchestrates the prompt sequence.

---

### Panel Header Auth Section — Updated Layout

The header action row will show both auth buttons:

```
[History] [New Session] [Clear Session] [Login Codex] [Configure API] [Preview] [Close]
```

Both buttons are always visible. Their labels reflect current state:
- `codexAuthButton`: `Enable Codex` / `Login Codex` / `Finish Login` / `Logout Codex`
- `customApiButton`: `Configure API` / `API: {model}` (when configured)

Clicking either button handles provider switching if needed (with confirmation).

---

### Prefs

#### [MODIFY] [prefs.js](file:///Users/zhilin/Work/Sonder/addon/prefs.js)

No new prefs needed. The existing prefs already cover all required fields:
- `api` (baseURL, default `https://api.openai.com`)
- `secretKey` (API key)
- `model` (model name, default `gpt-3.5-turbo`)

The default `model` value will be updated from `gpt-3.5-turbo` to `gpt-4o` to reflect current reality.

---

### Tests

#### [MODIFY] [context-chat-model.test.ts](file:///Users/zhilin/Work/Sonder/tests/context-chat-model.test.ts)

Add unit tests for the new provider helper functions:
- `getCustomApiConfig()` returns structured config from prefs
- `setCustomApiConfig()` writes all three fields
- `hasCustomApiConfig()` returns correct boolean
- `clearCustomApiConfig()` resets to defaults
- `getCustomApiStatusLabel()` returns correct labels for different states

---

## Verification Plan

### Automated Tests

```bash
npm test
npm run tsc
npm run build-dev
```

### Manual Verification

1. Open Sonder panel in Zotero
2. Click `Configure API` button
3. Enter a valid baseURL (e.g. `https://api.openai.com`), API key, and model name
4. Verify test connection succeeds and config is saved
5. Send a chat message and verify it uses the custom API
6. Click the button again to verify reconfigure/clear flow works
7. Switch to Codex provider and back to verify provider switching works correctly
8. Verify Codex OAuth flow still works independently


updateAtTime: 2026/3/12 11:26:13

planId: 76b35149-fce6-4b6d-a5f2-5da10f1852ba