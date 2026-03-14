<div align="center"> 

# Sonder

**Context-aware academic chat for Zotero**

</div>

---

## Status

This repository is the migrated successor of the previous `zotero-gpt` working branch.

Current baseline goals already carried over:

- the plugin can be built as a Zotero add-on
- the plugin can be discovered and shown by Zotero
- the current OAuth/Codex login pipeline is preserved
- the current Codex backend chat pipeline is preserved

The next product phase is a larger rewrite toward the context-chat UX described in:

- [`docs/context-chat-spec-v0.1.md`](docs/context-chat-spec-v0.1.md)

## What this repo is for right now

This repo is **not** yet the final context-chat implementation.
It is the new, cleaner project home that preserves the currently working technical base:

- working add-on packaging / bootstrap behavior
- working Zotero loadability
- working ChatGPT/Codex OAuth flow
- working Codex request path and provider plumbing

That working base will be used for the next implementation stage.

## Key docs

- [`docs/migration-plan.md`](docs/migration-plan.md)
- [`docs/context-chat-spec-v0.1.md`](docs/context-chat-spec-v0.1.md)
- [`docs/context-chat-architecture.md`](docs/context-chat-architecture.md)
- [`docs/codex-oauth.md`](docs/codex-oauth.md)
- [`docs/plugin-loading-fix.md`](docs/plugin-loading-fix.md)

## Build

```bash
git clone <your-sonder-repo-url>
cd Sonder
npm install
npm run build-dev
```

Build output:

- unpacked add-on: `builds/addon/`
- XPI: `builds/sonder.xpi`

## Install in Zotero

Open Zotero:

- `Tools -> Add-ons`
- gear icon -> `Install Add-on From File...`
- select `builds/sonder.xpi`

## Provider modes

Sonder supports two provider modes for chat:

### Codex OAuth (default)

Uses ChatGPT/Codex via browser-based OAuth login. No API key required.

1. Click `Login Codex` in the panel header (or `Enable Codex` if not yet on the Codex provider)
2. Complete the browser login flow
3. Paste the redirect URL back when prompted

See [`docs/codex-oauth.md`](docs/codex-oauth.md) for details.

### Custom API (OpenAI-compatible)

Uses any OpenAI-compatible API endpoint with a standard API key.

1. Click `Configure API` in the panel header
2. Enter your **Base URL** (e.g. `https://api.openai.com`, `https://api.deepseek.com`)
3. Enter your **API Key**
4. Enter your **Model Name** (e.g. `gpt-4o`, `deepseek-chat`, `claude-3.5-sonnet`)
5. Sonder sends a test request to verify the connection
6. On success, the configuration is saved and ready to use

The button shows `API: {model}` when configured. Click it again to reconfigure or clear.

This works with any provider that exposes an OpenAI-compatible `/chat/completions` endpoint. If your provider requires a `/v1/` prefix, include it in the base URL (e.g., `https://api.openai.com/v1`).

## Experimental paper chat panel

The rewrite now includes an experimental paper-chat panel as the primary UI surface.

Current behavior:

- a visible `Chat` button is injected into PDF/snapshot reader toolbar
- clicking the reader `Chat` button with an active PDF or webpage snapshot opens a large right-side panel
- a fallback `Sonder Chat Panel` Tools/Add-ons menu entry is installed for stable opening without shortcuts
- the panel resolves explicit `Paper` context from the current PDF or webpage snapshot
- selecting an annotation/note item in the library and clicking `Chat` opens `Item + Paper` context
- in `Item + Paper` mode, selected item content is force-injected as primary anchor context
- the latest saved session is restored automatically per context (`paper` or `item+paper`)
- `New Session` creates another persisted session for the same context
- `History` lists saved sessions for the current context
- `Clear Session` clears messages in the active session with confirmation
- panel header includes Codex auth actions (`Enable/Login/Finish/Logout Codex`) so OAuth does not depend on slash commands
- panel header includes a `Configure API` button for setting up a custom OpenAI-compatible API endpoint (base URL + API key + model name) with test-connection validation
- drag the panel’s left edge to resize width (width is remembered)
- the composer is wired to the current provider transport
- `Send` and `Enter` submit a message
- `Shift+Enter` inserts a newline
- multi-turn user/assistant messages are persisted per session
- the panel prepares chunked context from the active PDF or webpage snapshot and retrieves relevant chunks per question
- responses are now grounded with retrieved paper context in the panel transport path
- assistant messages show lightweight citation chips for retrieved paper chunks
- in `Item + Paper` mode, assistant citations include a `Selected annotation/note` chip to preserve item identity
- clicking a citation chip jumps back to the relevant PDF paragraph region (fine-grained y-offset), or selects the cited item for item-source chips
- citation chips only appear for chunks the model explicitly cited in its response (e.g., `[1]`, `[3]`), keeping the UI consistent with the model's text
- assistant output is shown as raw markdown by default
- streaming stays in raw markdown form for stability
- a header toggle switches between `Raw Markdown` and rendered `Preview`
- preview mode renders headings, lists, tables, code blocks, and math expressions after streaming completes
- preview-mode math now supports `$...$`, `$$...$$`, `\(...\)`, and `\[...\]`
- message output is selectable/copyable directly in the panel
- each assistant message includes footer icon actions: view toggle (`👁` / `📝`) and copy (`⧉`) for raw markdown
- raw markdown mode stays easy to copy into tools like Notion

Current limitation:

- citation jumping scrolls to the approximate paragraph region within a PDF page using y-coordinate offsets from text extraction (for snapshots, all chunks are labeled as page 1 without sub-page positioning)
- math preview quality depends on the model emitting explicit math delimiters consistently, though the panel now nudges it toward `$...$` / `$$...$$`
- retrieval is currently a simple chunked lexical-ranking implementation, not the final retrieval stack yet
- item+paper mode always injects selected item text; paper retrieval still depends on available PDF preparation context
- runtime UX is fully panel-first; legacy popup/command-tag runtime paths have been removed

## Tests

```bash
npm test
npm run tsc
npm run build-dev
```

## Immediate migration acceptance criteria

The migrated baseline is considered acceptable if it still satisfies these already-working capabilities:

- Sonder appears in Zotero Add-ons
- the plugin starts successfully in Zotero
- Codex OAuth login can still be completed
- Codex chat can still return a response

Those are the minimum guarantees before the context-chat rewrite begins.
