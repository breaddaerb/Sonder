# Codex OAuth

A reusable implementation note for apps that want to use ChatGPT/Codex **without** requiring a normal OpenAI API key.

This document is written as a practical reference, not just a record of what the predecessor plugin happened to do.
If another app wants to implement the same flow, this file should explain both:

1. **why it works**
2. **what pieces are actually required**

---

## Executive summary

The working Codex login flow is:

1. use a normal **OAuth 2.0 PKCE** authorization flow for a **public/native client**
2. let the user log in in their browser
3. receive the authorization code either by:
   - a real localhost callback server, or
   - a manual paste-back of the redirected URL
4. exchange the authorization code for:
   - `access_token`
   - `refresh_token`
   - expiry time
5. decode the access token and extract:
   - `chatgpt_account_id`
6. call the Codex backend:
   - `https://chatgpt.com/backend-api/codex/responses`
7. authenticate that request with:
   - bearer access token
   - `chatgpt-account-id`

That is the whole trick.

The surprising part is that the browser can show `localhost refused to connect` and the flow can still succeed, because the important data is already present in the redirected URL in the address bar.

---

## Why this was initially uncertain

The uncertainty was **not** whether OAuth exists in general.
The uncertainty was whether ChatGPT/Codex could be used from another app in a way that was:

- repeatable
- public-client compatible
- not dependent on browser cookies only
- not dependent on a hidden internal app secret

Before comparing against a known-good client, the unknowns were:

- what authorize URL to use
- what token URL to use
- what `client_id` to use
- whether PKCE was enough without a client secret
- whether localhost redirect was accepted
- what token fields were needed by the Codex backend
- what backend URL/headers/body shape were required after login

The useful thing about the `pi` reference implementation was that it behaved like an **executable specification**.
It showed that the flow was not magical browser state — it was a real OAuth PKCE flow plus a Codex backend call.

---

## The core idea

There are really **two separate layers**:

### Layer 1: acquire Codex credentials

This is just OAuth PKCE.

### Layer 2: use those credentials against the Codex backend

This is a separate HTTP integration step.

A project can succeed at Layer 1 and still fail at Layer 2 if the backend request shape is wrong.
That happened here: login worked, but the Codex request initially failed with:

```text
failed with 400 details: instructions are required
```

So do not think of this as only an "OAuth problem".
It is really:

- OAuth PKCE login
- token storage/refresh
- backend request formatting

---

## Why a client secret is not required

This flow works because it is a **public client** pattern.

A desktop app, CLI, extension, or plugin often cannot safely keep a client secret.
Instead, it uses **PKCE**:

- generate a random `code_verifier`
- derive a `code_challenge`
- send the challenge during authorization
- send the verifier during token exchange

That is why the app can authenticate the token exchange without storing a secret.

So the absence of a client secret is not a hack.
It is a standard OAuth public-client pattern.

---

## What the reference client proved

The `pi` implementation proved that a working Codex flow could be built with the following observed values:

- authorize URL: `https://auth.openai.com/oauth/authorize`
- token URL: `https://auth.openai.com/oauth/token`
- redirect URI: `http://localhost:1455/auth/callback`
- scope: `openid profile email offline_access`
- client id: `app_EMoamEEZ73f0CkXaXp7hrann`

And that a successful backend call also needed:

- endpoint: `https://chatgpt.com/backend-api/codex/responses`
- bearer access token
- `chatgpt-account-id`
- a Responses-style request body
- a top-level `instructions` field

That was the key insight: the system was understandable and reproducible once these pieces were known.

---

## Reusable workflow for another app

If you want to implement this in another app, use this model.

## Phase A: start OAuth login

### Step A1: generate PKCE + state

Generate:

- `state`
- `code_verifier`
- `code_challenge`

Store `state` and `code_verifier` temporarily in memory until the login completes.

### Step A2: open the authorize URL

Build a URL like:

```text
https://auth.openai.com/oauth/authorize
  ?response_type=code
  &client_id=app_EMoamEEZ73f0CkXaXp7hrann
  &redirect_uri=http%3A%2F%2Flocalhost%3A1455%2Fauth%2Fcallback
  &scope=openid%20profile%20email%20offline_access
  &code_challenge=<pkce challenge>
  &code_challenge_method=S256
  &state=<random state>
  &id_token_add_organizations=true
  &codex_cli_simplified_flow=true
  &originator=<your app name>
```

Observed useful parameters:

- `id_token_add_organizations=true`
- `codex_cli_simplified_flow=true`
- `originator=<app name>`

Then open that URL in the user's browser.

---

## Phase B: receive the authorization code

There are **two valid transport strategies**.

### Strategy B1: localhost callback server

This is the cleanest UX if your app can open a local server.

Flow:

1. app listens on `localhost:1455`
2. browser redirects to `/auth/callback?code=...&state=...`
3. app reads the query params directly
4. browser can show a success page

This is what a CLI or Node app can do comfortably.

### Strategy B2: manual paste-back callback

This is useful in plugin/sandbox environments where opening a local HTTP server is inconvenient or impossible.

Flow:

1. browser redirects to:

```text
http://localhost:1455/auth/callback?code=...&state=...
```

2. browser shows:
   - `ERR_CONNECTION_REFUSED`
   - or `localhost refused to connect`
3. user copies the full URL from the browser address bar
4. app parses `code` and `state` from that pasted URL

This is the strategy currently used in the migrated Sonder baseline.

### Important note

The localhost error page is **not** the real failure.
The useful thing is that the browser has already navigated to the redirect URL, so the address bar contains the authorization code.

That is the main conceptual trick behind the manual flow.

---

## Phase C: exchange the authorization code for tokens

Send a `POST` request to:

```text
https://auth.openai.com/oauth/token
```

with form fields:

- `grant_type=authorization_code`
- `client_id=<client id>`
- `code=<authorization code>`
- `code_verifier=<pkce verifier>`
- `redirect_uri=<same redirect uri>`

Expected fields in the response:

- `access_token`
- `refresh_token`
- `expires_in`

If those fields are missing, treat the login as failed.

---

## Phase D: extract the ChatGPT account ID

The backend also needs a ChatGPT account identifier.
A separate profile request was not required here because the access token JWT already contained it.

Decode the access token payload and read:

```text
https://api.openai.com/auth.chatgpt_account_id
```

In code terms, the JWT payload contains something like:

```json
{
  "https://api.openai.com/auth": {
    "chatgpt_account_id": "..."
  }
}
```

This value is required later as the request header:

```text
chatgpt-account-id: <account id>
```

---

## Phase E: store credentials

Persist at least:

- access token
- refresh token
- expiry time
- account id

In the current Sonder baseline, these are stored in Zotero preferences:

- `oauthAccessToken`
- `oauthRefreshToken`
- `oauthExpiresAt`
- `oauthAccountId`

For another app, the same data can be stored in:

- app preferences
- encrypted file store
- OS keychain
- secrets manager

The storage mechanism is app-specific. The required data is not.

---

## Phase F: refresh expired tokens

When the access token is near expiry, send:

```text
POST https://auth.openai.com/oauth/token
```

with form fields:

- `grant_type=refresh_token`
- `refresh_token=<stored refresh token>`
- `client_id=<client id>`

Then replace the stored credentials with the new:

- access token
- refresh token
- expiry
- account id (re-extract from the new access token)

---

## Phase G: call the Codex backend

The observed working endpoint is:

```text
https://chatgpt.com/backend-api/codex/responses
```

### Required headers

At minimum, the current working request uses:

- `Authorization: Bearer <access token>`
- `chatgpt-account-id: <account id>`
- `OpenAI-Beta: responses=experimental`
- `originator: <your app name>`
- `accept: text/event-stream`
- `content-type: application/json`

### Required body shape

A minimal working body currently looks like:

```json
{
  "model": "gpt-5.2",
  "store": false,
  "stream": true,
  "instructions": "You are a helpful assistant...",
  "input": [
    {
      "role": "user",
      "content": [
        {
          "type": "input_text",
          "text": "hello"
        }
      ]
    }
  ],
  "text": {
    "verbosity": "medium"
  }
}
```

### Important gotcha: `instructions` is required

A real failure encountered during implementation was:

```text
failed with 400 details: instructions are required
```

So even after OAuth succeeds, the request can still fail if the Responses payload is incomplete.

---

## Message format notes

The Codex backend currently expects a **Responses-style** input structure rather than the classic Chat Completions `messages` shape.

Useful mapping:

### User message

```json
{
  "role": "user",
  "content": [
    {
      "type": "input_text",
      "text": "hello"
    }
  ]
}
```

### Assistant history message

```json
{
  "type": "message",
  "role": "assistant",
  "content": [
    {
      "type": "output_text",
      "text": "previous reply",
      "annotations": []
    }
  ],
  "status": "completed",
  "id": "msg_1"
}
```

In the current Sonder baseline, this conversion is done in:

- `src/modules/Meet/OpenAI.ts` via `buildCodexInput()`

---

## Streaming notes

The response is streamed as SSE.
Useful event types observed in this integration include:

- `response.output_text.delta`
- `response.refusal.delta`
- `response.failed`
- `error`

A practical client should:

- accumulate text deltas
- surface backend failures cleanly
- keep raw error text when possible for debugging

---

## What Sonder currently does

This project wraps the generic flow in a user-facing provider model.

### Provider switch

```text
/provider openai-codex
```

### Start login

```text
/login
```

### Finish login manually

Paste back the redirect URL:

```text
/login http://localhost:1455/auth/callback?code=...&state=...
```

### Useful debug command

```text
/report
```

In this project, provider state and tokens are handled by:

- `src/modules/provider.ts`
- `src/modules/Meet/CodexOAuth.ts`
- `src/modules/Meet/OpenAI.ts`
- `src/modules/views.ts`

---

## Why this approach is portable

The important thing to understand is that the **app-specific UI does not matter very much**.
The portable pieces are:

- OAuth PKCE
- callback transport method
- token exchange
- token refresh
- account-id extraction
- backend request formatting

So another app can reuse the same conceptual design even if it is:

- a CLI
- a desktop app
- a browser extension
- a plugin inside another host app
- a TUI app

The only part that usually changes is **how the authorization code gets back into the app**.

---

## Choosing between localhost callback and manual paste-back

### Use a localhost callback server if:

- your runtime can open sockets easily
- you want a polished login UX
- you want the browser to finish on a success page

### Use manual paste-back if:

- your runtime is sandboxed
- opening a local server is awkward/impossible
- you need the simplest possible first implementation

Manual paste-back is ugly, but it is often the fastest route to a working proof of concept.

---

## Security notes

### Good

- user password is entered only in the browser
- app does not need a client secret
- refresh flow avoids repeated login

### Less good / current rough edges

- tokens may be stored in plain app prefs if you do the simplest version
- manual copy/paste is clunky
- this relies on currently observed service behavior rather than a clearly documented long-term contract

If building a production-quality app, consider:

- OS keychain storage
- a real localhost callback server
- explicit logout/revoke UX
- token expiry and refresh error handling

---

## Stability caveat

This integration should be described honestly.

A good caveat sentence is:

> This implementation is based on currently observed Codex/ChatGPT OAuth and backend behavior used by existing clients. It works, but endpoints, client identifiers, headers, or request fields may change over time.

That caveat is important for any app reusing this workflow.

---

## Minimal implementation checklist

If another project wants to implement Codex OAuth, the shortest practical checklist is:

- [ ] generate PKCE verifier/challenge
- [ ] generate and store `state`
- [ ] open OpenAI authorize URL in browser
- [ ] receive auth code via localhost callback or paste-back
- [ ] verify `state`
- [ ] exchange code for access/refresh token
- [ ] decode access token and extract `chatgpt_account_id`
- [ ] store access/refresh/expires/accountId
- [ ] refresh token when expired
- [ ] call `https://chatgpt.com/backend-api/codex/responses`
- [ ] send bearer token + `chatgpt-account-id`
- [ ] include `instructions` in the request body
- [ ] parse streaming SSE output

---

## Common failure modes

### Browser says localhost refused to connect

If you are using manual paste-back, this is expected.
Copy the full redirected URL from the address bar and continue.

### OAuth state mismatch

The pasted URL belongs to another login attempt, or the app lost the pending login state.
Restart login.

### Token exchange fails

Common causes:

- wrong `client_id`
- wrong `redirect_uri`
- wrong/missing `code_verifier`
- expired/invalid authorization code

### Codex request fails after login

This means OAuth worked but backend integration is still wrong.
Check:

- bearer token header
- `chatgpt-account-id`
- endpoint URL
- required `instructions`
- body format

### Refresh fails

Stored refresh token may be invalid/expired. Force re-login.

---

## Project-specific current values (`Sonder`)

These are the values currently used in this repo.
They are useful as a concrete example, not as a promise that they will never change.

### OAuth constants

- client id: `app_EMoamEEZ73f0CkXaXp7hrann`
- authorize URL: `https://auth.openai.com/oauth/authorize`
- token URL: `https://auth.openai.com/oauth/token`
- redirect URI: `http://localhost:1455/auth/callback`
- scope: `openid profile email offline_access`

### Backend constants

- endpoint: `https://chatgpt.com/backend-api/codex/responses`
- current default instructions: a helpful-assistant prompt in `src/modules/Meet/OpenAI.ts`

### Relevant files

- `src/modules/provider.ts`
- `src/modules/Meet/CodexOAuth.ts`
- `src/modules/Meet/OpenAI.ts`
- `src/modules/views.ts`
- `addon/prefs.js`

---

## One-paragraph explanation for another app's docs

You can reuse this paragraph almost verbatim:

> We implement Codex login as a browser-based OAuth 2.0 PKCE flow for a public/native client. The app opens the OpenAI authorization page in the user's browser, where the user signs in directly with OpenAI. After login, OpenAI redirects to a localhost callback URL. The app can receive that callback either through a local HTTP server or, in sandboxed/plugin environments, by asking the user to copy the redirected URL from the browser address bar and paste it back into the app. The app exchanges the authorization code for access and refresh tokens, extracts the ChatGPT account ID from the access token payload, and then uses those credentials to call the Codex responses backend without requiring a separate OpenAI API key.

---

## Summary

The reusable mental model is simple:

- **OAuth PKCE gets you the tokens**
- **the access token gives you the account id**
- **the Codex backend uses both**
- **manual paste-back is just a replacement for a real callback server**

That is the trick.
