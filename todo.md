# Sonder TODO

Status: paper-grounded panel chat in progress  
Last updated: 2026-03-12

This file turns `docs/context-chat-spec-v0.1.md` into an implementation-oriented task list.

---

## 0. Baseline already achieved

These are already working and should be preserved during the rewrite:

- [x] Sonder can be built locally
- [x] Sonder appears in Zotero Add-ons
- [x] Sonder startup runs successfully in Zotero
- [x] Codex OAuth login works
- [x] Codex chat can return a response
- [x] Migration docs carried over
- [x] Context chat rewrite spec carried over

Non-negotiable rule for future work:

- [ ] Do not break plugin loadability while rewriting the product UX

---

## 1. Immediate engineering guardrails

Before feature work starts, create stable boundaries between the inherited baseline and the new architecture.

- [x] Decide new source tree layout for the rewrite
  - [x] `src/context-chat/`
  - [x] keep legacy code isolated rather than mixing into old `views.ts`
- [x] Define which inherited modules are considered stable foundations
  - [x] plugin shell / bootstrap / build
  - [x] provider abstraction
  - [x] Codex OAuth
  - [x] Codex/OpenAI transport layer
- [x] Define which modules are legacy and scheduled for replacement
  - [x] current popup UI
  - [x] command-tag-first entry flow
  - [x] old session/message handling
- [x] Add a minimal architecture note if needed after structure is chosen

---

## 2. New architecture skeleton

Build the new product layer without removing the working baseline too early.

- [x] Create new top-level rewrite modules
  - [x] `context-chat/paperContext.ts`
  - [x] `context-chat/storage.ts`
  - [x] `context-chat/panel.ts`
  - [x] `context-chat/service.ts`
  - [x] `context-chat/index.ts`
  - [ ] `retrieval/` (later)
- [x] Define core types/interfaces
  - [x] `Context`
  - [x] `Session`
  - [x] `Message`
  - [x] `Citation`
  - [x] context type enum: `paper`, `item+paper`
- [x] Add a single public entry for the future panel
- [x] Keep a fallback way to open the plugin while the new UI is incomplete

---

## 3. Storage design and implementation

Conversation history must always be saved.

### 3.1 Data model
- [x] Finalize persisted entity shapes
  - [x] `Context`
  - [x] `Session`
  - [x] `Message`
- [x] Decide ID conventions
  - [x] `paper:<attachmentKey>`
  - [x] `itempaper:<itemKey>:<paperKey>`
- [x] Decide timestamps and ordering rules

### 3.2 Storage backend
- [x] Choose storage backend for contexts/sessions/messages
  - [x] do **not** store full histories in Zotero prefs
  - [x] prefer dedicated JSON/file-based storage layer
- [x] Implement storage service
  - [x] save contexts
  - [x] save sessions
  - [x] save messages
  - [x] load recent session for context
  - [x] list sessions for context
  - [x] create new session
  - [x] clear/delete session (if included in V1)
- [x] Add migration-safe error handling
- [ ] Add simple dev inspection/logging helpers

### 3.3 SQLite migration plan (pre-insight prerequisite)

Rationale: JSON-file storage was sufficient for MVP but is now a scale/reliability bottleneck. Before implementing dialogue-to-insight anchoring, migrate dialogue persistence to SQLite.

- [x] Add SQLite storage layer (`context-chat.sqlite`) with schema versioning
- [x] Initialize DB on plugin start if missing
- [x] Add tables and indexes
  - [x] `sessions` table
    - [x] `id` (PK)
    - [x] `context_id`
    - [x] `item_key` (nullable)
    - [x] `paper_key` (nullable)
    - [x] `title`, `provider`, `model`
    - [x] `created_at`, `updated_at`
  - [x] `messages` table
    - [x] `id` (PK)
    - [x] `session_id` (FK)
    - [x] `role`, `content`
    - [x] `citations_json` (nullable)
    - [x] `created_at`
  - [x] index `sessions(context_id, updated_at DESC)`
  - [x] index `sessions(item_key, updated_at DESC)`
  - [x] index `messages(session_id, created_at ASC)`
- [x] Replace JSON read/write calls with SQL operations in `ContextChatStore`
  - [x] create session
  - [x] append message
  - [x] get session snapshot by id
  - [x] list sessions by context
  - [x] list sessions by item key
  - [x] update `updated_at` transactionally on writes
- [x] Ensure transactional integrity + write durability
  - [x] wrap writes in transactions
  - [x] enable WAL/safe pragmas where supported
- [x] One-time migration from JSON to SQLite
  - [x] detect legacy JSON (`context-chat.json`) and empty DB
  - [x] import all contexts/sessions/messages in one transaction
  - [x] keep backup (`context-chat.json.bak`) after successful import
  - [x] make migration idempotent (safe on restart)
- [x] Keep external store API stable for panel/service callers
- [x] Add tests for migration + CRUD parity
- [x] Manual verification: existing chat history is preserved post-migration

---

## 4. Context model implementation

## 4.1 Paper context
- [x] Implement paper context resolver from current PDF
- [x] Define stable context title generation for paper
- [x] Implement "open latest session or create one" behavior for paper context

## 4.2 Item + paper context
- [x] Detect selected annotation item / note item in Zotero
- [x] Resolve parent paper from selected item
- [x] Define stable `item+paper` context identity
- [x] Implement "open latest session or create one" behavior for item+paper context
- [x] Ensure selected item content is always force-injected into context

## 4.3 Context switching rules
- [x] Define how global panel reacts when current selection changes
- [x] Define whether context switches only on explicit open action or also while panel is open
- [x] Make current context always visible in UI

---

## 5. Entry points

Panel opens by explicit button click.

### 5.1 PDF entry
- [x] Add visible `Chat` entry in PDF reader
- [x] Bind it to paper context opening
- [x] Add visible `Chat` entry in snapshot reader

### 5.2 Item entry
- [x] Add visible `Chat` entry for selected item workflows
- [x] Bind it to item+paper context opening

### 5.3 Safe fallback entry
- [x] Add plugin menu entry / stable fallback opening path
- [x] Ensure opening the panel does not depend on shortcuts

### 5.4 Shortcut policy
- [x] Decide whether to keep current shortcut only as secondary convenience
- [x] Ensure shortcut is not the primary UX dependency

---

## 6. New panel UI

Main direction: large right-side docked chat panel.

### 6.1 Mounting strategy
- [x] Decide where/how the panel mounts inside Zotero UI
- [x] Confirm panel can coexist with Zotero layout without breaking usability
- [x] Support panel open/close lifecycle safely
- [x] Polish launcher button vertical text alignment/centering

### 6.2 Header
- [x] Show context badge
  - [x] `Paper`
  - [x] `Annotation + Paper`
  - [x] `Note + Paper`
- [x] Show context title
- [x] Show current session title/label
- [x] Add header actions
  - [x] `New Session`
  - [x] `History`
  - [x] `Raw Markdown` / `Preview`
  - [x] `Clear Current Session`
  - [ ] optional `Settings`
- [x] Add status indicator
  - [x] preparing
  - [x] ready
  - [x] failed
- [x] Reorganize header actions into clear groups
  - [x] Session group: `History` / `New Session` / `Clear Session`
  - [x] Provider/Auth group: provider + `Login/Logout` actions
  - [x] Panel controls group: `Close` isolated at far edge
- [x] Reposition `Raw Markdown` / `Preview` control closer to message-level copy workflow

### 6.3 Message area
- [x] Large scrollable message list
- [x] User / assistant message separation
- [x] Message text must be selectable/copyable in panel output
- [x] Add one-click copy button for assistant messages (copy raw markdown)
- [x] Ensure partial text selection can be copied with normal system copy shortcut/context menu
- [x] Markdown rendering
  - [x] Improve code-block readability in panel output
  - [x] Keep rendered output easy to copy/paste into Notion
  - [x] Support raw-markdown / preview toggle instead of forcing preview only
- [x] Long-answer friendly layout
- [x] Citation/source chip UI
- [x] Clicking citation jumps to source

### 6.4 Composer
- [x] Multiline textarea
- [x] `Enter` send / `Shift+Enter` newline
- [x] Send button
- [x] Context hint text
  - [x] `Chatting with current paper`
  - [x] `Chatting with selected annotation + paper`

### 6.5 Resizing and layout
- [x] Set good default width (target: 40%–50%)
- [x] Add resizable width support
- [x] Ensure long answers are easy to scroll

---

## 7. Paper retrieval flow

User promise: when opening chat from a PDF, they can ask about the whole paper.

- [x] Reuse/clean up existing PDF parsing pipeline
- [x] Parse current PDF into chunks/documents
- [x] Add clear preparation lifecycle
  - [x] preparing
  - [x] ready
  - [ ] stale
  - [x] failed
- [x] Switch from retrieval-based (top-5 chunks) to full-paper context delivery
- [x] Use page-level chunking (one chunk per page) instead of sub-page chunks
- [x] Send all pages to the model by default (modern models support 128k-200k+ tokens)
- [x] Add optional page-range filter for users to exclude irrelevant sections
- [x] Keep source metadata for citation jumping (topY/bottomY preserved per page chunk)
- [x] Avoid exposing old `AskPDF`-style hidden behavior as the primary model

### 7.1 Context delivery strategy
- [x] Full-paper context for `openai-api` (all pages sent)
- [x] Full-paper context for `openai-codex` (all pages sent)
- [x] Optional page-range filtering via panel UI
- [x] Ensure product semantics stay stable even if context delivery internals differ

---

## 8. Item + paper retrieval flow

User promise: the selected item is the anchor, and the paper provides background.

- [x] Always inject selected item text into context
- [x] Retrieve supporting chunks from parent paper
- [x] Preserve item identity in citations/source UI if relevant
- [x] Ensure answers feel about *this item* rather than generic paper summary

### Required rule
- [x] Item content must never be optional in `item+paper` mode

---

## 9. Dialogue-to-Insight Anchoring

Prerequisite: complete SQLite migration in `3.3` first.

Goal: allow users to preserve high-value dialogue outputs as structured insights bound to Zotero item/annotation context.

### 9.1 Insight data model (Sonder-side)
- [x] Add `Insight` persisted entity
  - [x] `id`
  - [x] `item_key` (or library+item key)
  - [x] `annotation_key` (nullable)
  - [x] `session_id`
  - [x] `message_id` (nullable, when saved from a specific assistant response)
  - [x] `content` (markdown, long-form)
  - [x] `created_at`
- [x] Add storage APIs
  - [x] create insight
  - [x] list insights by item
  - [x] list insights by item+annotation
  - [x] get insight by id

### 9.2 Dialogue UI action
- [x] Add one-click `Save insight` action on assistant message blocks
- [x] Save selected assistant response as insight (V1)
- [x] Show inline save confirmation with generated `insight_id`
- [x] Keep action frictionless (single-click path)

### 9.3 Zotero marker write-back (lightweight pointer only)
- [x] For annotation-anchored saves, append marker text:
  - [x] `→ Sonder insight [insight_id]`
- [x] Do **not** store full insight content in Zotero annotation fields
- [x] Ensure marker append is non-destructive (preserve existing annotation comment)

### 9.4 Retrieval UX
- [x] Show saved insights inline after save (current session context)
- [x] Add `Insights for this item` view/list in panel
- [x] Allow reopening an insight and continuing dialogue from its source session
- [ ] (Later) cross-item insight retrieval/search

### 9.5 Validation and migration safety
- [x] Ensure existing chat/session behavior remains unchanged
- [x] Add tests for insight CRUD and item/annotation filtering
- [x] Add tests for marker write-back behavior
- [x] Manual verification in Zotero
  - [x] save insight from item+paper dialogue
  - [x] marker visible on source annotation
  - [x] reopen associated session and continue asking

---

## 10. Session/history UX

History must be saved, but not always shown expanded.

- [x] Implement latest-session restore per context
- [x] Implement `New Session`
- [x] Implement history list/dropdown/drawer in header
- [x] Show recent sessions for current context
- [x] Switch session cleanly
- [x] Keep current session title/label visible

Optional-but-likely-later:
- [x] rename session
- [x] delete session
- [x] search sessions

---

## 11. Assistant transport integration

The new UI/context system should reuse the already working backend pieces.

- [x] Define chat service boundary between UI and provider transports
- [x] Reuse current provider selection logic
- [x] Reuse Codex OAuth flow
- [x] Reuse Codex request path/body logic where sensible
- [x] Reuse OpenAI API mode where sensible
- [x] Preserve `/report`-style diagnostics somewhere, even if UI changes later

---

## 11.1 Custom API provider configuration

The panel now supports configuring a custom OpenAI-compatible API endpoint alongside Codex OAuth.

- [x] Add provider helper functions for custom API config (`getCustomApiConfig`, `setCustomApiConfig`, `hasCustomApiConfig`, `clearCustomApiConfig`, `getCustomApiStatusLabel`)
- [x] Add `testCustomApiConnection()` for validating custom endpoints before saving
- [x] Add `Configure API` button in panel header (alongside Codex auth button)
- [x] Implement sequential prompt flow: base URL → API key → model name → test connection
- [x] Update `render()` to show custom API button state (`Configure API` / `API: {model}`)
- [x] Update default model pref from `gpt-3.5-turbo` to `gpt-4o`
- [x] Add unit tests for custom API provider helpers
- [x] Manual verification in Zotero: configure custom API, test connection, send a message

---

## 11.2 Webpage snapshot support

The context chat panel now supports webpage snapshot (HTML) attachments alongside PDFs.

- [x] Add `isSupportedAttachment()` and `isSnapshotAttachment()` helpers in `paperContext.ts`
- [x] Expand `resolveCurrentPaperContext()` to accept snapshot attachments
- [x] Add `extractSnapshotText()` for DOM-based text extraction from HTML snapshots
- [x] Add `readSnapshotChunks()` for chunking snapshot text
- [x] Refactor `readCurrentReaderPaperChunks()` to dispatch between PDF and snapshot extraction
- [x] Update `resolveFromReader()` in `itemPaperContext.ts` to accept snapshot attachments
- [x] Update `getAttachmentFromNote()` to find snapshot attachments
- [x] Update `fromAnnotationItem()` to accept snapshot parent attachments
- [x] Improve error messages in panel for unsupported attachment types
- [x] Update all user-facing "PDF" references to include "snapshot"
- [x] Manual verification: open webpage snapshot, click Chat, verify text extraction and chat

---

## 12. Source citations and navigation

A core value of paper chat is being able to jump back to source.

- [x] Preserve existing source-jump capability where possible
- [x] Design citation chip format in the new panel
- [x] Clicking a citation should:
  - [x] jump to PDF region for paper chunks (page-level with y-offset)
  - [x] jump to a finer-grained paragraph/box region instead of page-level only
  - [ ] visually highlight/mark the relevant cited content after jump
  - [x] select Zotero item for item sources where appropriate
  - [x] each citation chip maps to a full page in full-paper context mode
- [x] Make citations visible but not visually noisy

---

## 13. Formula rendering strategy

Current inherited baseline disables the old MathJax plugin path because it broke Zotero sandbox startup.

- [x] Decide safe formula rendering strategy for Sonder
- [x] Confirm chosen strategy does not break plugin startup
- [x] Test long technical/math-heavy answers in the new panel
- [x] Improve equation readability so outputs do not fall back to ugly raw formula text where avoidable
- [x] Prefer a markdown-like rendering/copy format that stays easy to paste into Notion

This is important because one major product requirement is explaining paper formulas/principles in long outputs.

---

## 14. Legacy command tags

Command tags are no longer the main product surface.

### V1 plan
- [x] Keep legacy command-tag system available only if cheap/safe
- [x] Remove command tags from primary UX path
- [x] Ensure new paper/item chat flows do not require understanding tags

### Later cleanup
- [x] Decide whether tags remain as advanced mode or move to separate legacy section

---

## 15. Cleanup inherited baseline issues

These are not blockers for the migration baseline, but they should be cleaned up deliberately.

- [ ] Investigate inherited non-fatal toolkit warning:
  - [ ] `TypeError: this.getGlobal(...).get(...) is not a constructor`
- [x] Remove temporary development auto-open hack once new panel entry exists
- [x] Remove legacy popup runtime module (`src/modules/views.ts`) after panel fallback was stabilized
- [x] Remove legacy command-tag module (`src/modules/base.ts`) from active codebase
- [x] Remove legacy views-coupled OpenAI helper flow (`getGPTResponse*`) from active codebase
- [x] Remove temporary views compatibility shim and startup views binding
- [x] Remove/bootstrap debug marker code when no longer needed
- [x] Clean up leftover predecessor naming in docs/comments where appropriate
- [x] Decide whether old inherited assets/tags should stay in repo or move to legacy folder

---

## 16. Suggested implementation order

Recommended sequence for happy coding:

### Phase 1: foundations
- [x] choose rewrite directory structure
- [x] define types and storage interfaces
- [x] implement persistence layer

### Phase 2: panel shell
- [x] mount large right-side panel
- [x] header / message list / composer skeleton
- [x] visible open entry points

### Phase 3: paper context
- [x] paper context resolver
- [x] open/create session
- [x] send/receive basic messages in paper context

### Phase 4: item + paper context
- [x] selected item detection
- [x] force-injected item content
- [x] paper retrieval supplement
- [x] open/create session

### Phase 5: history/session UX
- [x] latest session restore
- [x] history switcher
- [x] new session flow

### Phase 6: polish
- [x] citations/source jumps
- [x] formula rendering
- [x] legacy tag de-emphasis
- [x] cleanup inherited warnings/hacks

---

## 17. V1 acceptance checklist

Sonder V1 should satisfy all of these:

### Stability
- [x] plugin still loads reliably in Zotero
- [x] Sonder still appears in Add-ons
- [x] Codex OAuth still works
- [x] Codex chat still works

### Paper chat
- [x] open a PDF
- [x] click `Chat`
- [x] large panel opens
- [x] clearly shows paper context
- [x] ask multiple questions about the paper
- [x] restore previous paper session later

### Item + paper chat
- [x] select annotation/note item
- [x] click `Chat`
- [x] panel opens in item+paper mode
- [x] selected item content is always included
- [x] ask follow-up questions naturally
- [x] restore previous item+paper session later

### History
- [x] create a new session for same paper
- [x] switch among sessions for same context

### UX
- [x] main flow does not depend on command tags
- [x] main flow does not depend on shortcuts
- [x] user always knows current context

---

## 18. Near-term first coding target

If starting implementation immediately, the first concrete milestone should be:

- [x] **Milestone M1: open a new large panel from a button and render a persisted session shell for paper context**

That milestone should include:

- [x] visible open button
- [x] panel mount
- [x] context header
- [x] empty message list
- [x] composer
- [x] persisted session creation/loading

Once M1 is real, the rest can be built incrementally.

---

## 19. Cleanup and refactor

Post-V1 code health pass. Everything below is tech debt or architectural improvement — no user-facing feature changes.

Last reviewed: 2026-04-01

### 19.1 Dead code removal in `Meet/OpenAI.ts`

The transport file carries legacy code from the pre-context-chat RAG architecture that is no longer called anywhere.

- [x] Remove `requestArgs` array (lines 12–41) — the two hardcoded third-party proxy endpoints (`aigpt.one`, `theb.ai`) are unused
- [x] Remove `chatID` mutable variable (line 11) — only referenced by `requestArgs`
- [x] Remove `RequestArg` type declaration (line 10)
- [x] Remove `requestFallbackChat()` function — only called from `requestProviderChat()` when no API key is set, routing to the dead `requestArgs[1]` (theb.ai); this path is broken regardless
- [x] Remove the `requestArgs[1]` fallback branch in `requestProviderChat()` — if no API key is configured, surface an error instead of silently calling a dead endpoint
- [x] Remove `similaritySearch()` export — not imported anywhere outside this file
- [x] Remove `OpenAIEmbeddings` class — only used by `similaritySearch()`
- [x] Remove `langchain/document` import — only used by `similaritySearch()` type signature
- [x] Remove `supportsEmbeddings()` from `provider.ts` — only caller was deleted `OpenAIEmbeddings`

### 19.2 Dead dependency cleanup in `package.json`

These dependencies were pulled in by the old RAG/embedding pipeline or earlier UI experiments and are no longer imported anywhere in `src/`:

- [x] Remove `langchain` — only import was for `Document` type in dead `similaritySearch`
- [x] Remove `@pinecone-database/pinecone` — zero imports
- [x] Remove `chromadb` — zero imports
- [x] Remove `react-markdown` — zero imports (panel renders markdown via `markdown-it`)
- [x] Remove `showdown` — zero imports
- [x] Remove `gpt-3-encoder` — zero imports
- [x] Remove `pdfreader` — zero imports (PDF extraction uses Zotero's built-in `PDFViewerApplication`)
- [x] Remove `pdf-parse` — zero imports
- [x] Remove `htmldiff-js` — zero imports
- [x] Remove `lighten-darken-color` — zero imports
- [x] Remove `compute-cosine-similarity` — only import was in dead `similaritySearch`
- [x] Remove `highlight` / `highlight.js` — zero imports (code highlighting not used in panel render)
- [x] Run `npm install` after cleanup and verify build still succeeds
- [x] Check if `@dqbd/tiktoken` is still needed — confirmed no imports; removed
- [x] Remove `@iktakahiro/markdown-it-katex` and `markdown-it-mathjax3` — not imported; `katex` added as direct dependency
- [x] Remove `crypto` / `crypto-js` / `blueimp-md5` — only used by dead `similaritySearch`
- [x] Remove `dotenv` / `node-fetch` / `proxy-agent` — zero imports in `src/`
- [x] Move `terser` from dependencies to devDependencies (used only by build script)
- [x] Remove `@types/crypto-js` devDependency

### 19.3 Remove `localStorage.ts`

`src/modules/localStorage.ts` is a legacy JSON-file cache layer. Its only consumer is the dead `similaritySearch()` in `Meet/OpenAI.ts` (via `meetState.storage`).

- [x] Remove `src/modules/localStorage.ts`
- [x] Remove `storage` field from `Meet/state.ts` (`SonderMeetState.storage`)
- [x] Remove `meetState.storage` references in `Meet/OpenAI.ts` (already gone after 19.1)
- [x] Remove `lock` and `input` fields from `Meet/state.ts` (unused after dead code removal)

### 19.4 Split `panel.ts` into smaller modules

`panel.ts` is 2264 lines — a single class doing DOM construction, CSS injection, state management, event handling, rendering, clipboard ops, insight management, and provider configuration. This is the biggest maintainability risk in the codebase.

Suggested decomposition:

- [x] Extract CSS string into `panelCSS.ts` (562 lines)
- [ ] Extract `buildPanel()` DOM construction into a `panelDOM.ts` builder module
  - Returns a typed record of element references instead of assigning 20+ `this.*` fields
- [x] Extract history drawer rendering into `panelHistory.ts` (263 lines)
- [x] Extract message rendering into `panelMessages.ts` (210 lines)
- [x] Extract provider config dialogs into `panelProviderDialogs.ts` (202 lines)
- [x] Extract insight save/refresh logic into `panelInsights.ts` (145 lines)
- [x] `ContextChatPanel` is now a thin orchestrator (1086 lines, down from 2264)

### 19.5 Decouple transport error handling from UI

`requestOpenAIChat()` and `requestCodexChat()` in `Meet/OpenAI.ts` mix transport concerns with presentation:

- [x] Move `ztoolkit.ProgressWindow` toast calls out of transport functions
  - Transport now returns structured `TransportError` on `result.error`
- [x] Move markdown-formatted error message construction out of transport
  - `formatTransportError()` is exported for callers that want the markdown format
- [x] Define a `TransportError` type with `{ status, code, type, message, url }` fields
- [x] Let callers be responsible for formatting/displaying errors

### 19.6 Add streaming abort support

There is no way to cancel a long-running response mid-stream.

- [ ] Thread an `AbortController` through `sendMessage()` → `requestProviderChat()` → HTTP request
- [ ] Add a `Stop` button in the panel composer that triggers `controller.abort()`
- [ ] Clean up partial assistant message on abort (either discard or save as incomplete)
- [ ] Wire the abort signal into `Zotero.HTTP.request()` options (check if Zotero's HTTP API supports abort)

### 19.7 Enable prompt prefix caching via system message

OpenAI automatically caches the leading token prefix of each request (>= 1024 tokens, 50% cost, ~80% latency reduction). Currently the paper context + formatting instructions are embedded in the last user message, which shifts position every turn — the prefix changes and cache never hits.

Fix: pin paper context + instructions as the stable prefix at the start of every request:
- **Standard API**: prepend a `system` message containing instructions + paper context
- **Codex API**: append paper context to the `instructions` field (already the prefix)

User messages become raw questions only. The prefix stays identical across turns → cache hits on turn 2+.

- [x] Build `buildPaperSystemMessage` / `buildItemPaperSystemMessage` for system-level content
- [x] For openai-api: prepend as `{ role: "system", content: ... }` in transport messages
- [x] For openai-codex: append paper context to the `instructions` field in the request body
- [x] User messages are now raw questions — no more grounding injection
- [x] `buildTransportHistory` simplified — no longer replaces last user message
- [x] Backward compat: `buildPaperGroundedUserMessage` / `buildItemPaperGroundedUserMessage` still work (compose from system + question)
- [x] Tests: system message content, prefix identity across turns, backward compat (`system-message-caching.test.ts`)

### 19.8 `handlePageRangeConfig()` duplication

The two branches (has range / no range) in `handlePageRangeConfig()` (lines 1285–1336) contain near-identical validation logic.

- [x] Extract shared range parsing/validation into `parsePageRangeInput(input: string): PageRange | undefined`
- [x] Reduce the method to a single flow: get current range → prompt → parse → apply or error

### 19.9 Test coverage gaps

Existing tests cover: types/model helpers, SQLite storage CRUD, insight markers, custom API provider helpers. Missing coverage for the most complex and fragile modules:

- [x] Tests for `paperRetrieval.ts` — already covered in `context-chat-model.test.ts`
- [x] Tests for `render.ts` — already covered in `context-chat-model.test.ts`
- [x] Tests for `chatMessages.ts` — already covered in `context-chat-model.test.ts`
- [x] Add tests for `Meet/OpenAI.ts` — `parseOpenAIText()`, `parseCodexStream()`, `buildCodexInput()`, `formatTransportError()` in `transport-parsing.test.ts`
- [x] Add tests for `Meet/CodexOAuth.ts` — `parseAuthorizationInput()` in `codex-oauth-parsing.test.ts`
  - `getCodexAccountId()` uses `window.atob` (browser-only), skipped in Node tests

### 19.10 Minor issues

- [x] `panel.ts`: replaced `wrappedJSObject.eval()` citation jump with direct property access on `PDFViewerApplication`
- [x] `Meet/OpenAI.ts` `requestArg.remove` issue — moot, removed in 19.1
- [x] `todo.md` Phase 6 stale checkboxes — updated
- [x] `Meet/state.ts` `SonderMeetState.lock` and `SonderMeetState.input` fields appear unused outside the dead embedding flow — removed in 19.3
