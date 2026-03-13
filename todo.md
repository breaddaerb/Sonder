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
  - [ ] `itempaper:<itemKey>:<paperKey>`
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
- [ ] Add visible `Chat` entry in PDF reader
- [ ] Bind it to paper context opening

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

- [ ] Reuse/clean up existing PDF parsing pipeline
- [x] Parse current PDF into chunks/documents
- [x] Add clear preparation lifecycle
  - [x] preparing
  - [x] ready
  - [ ] stale
  - [x] failed
- [x] Retrieve relevant chunks per question
- [ ] Keep source metadata for citation jumping
- [x] Avoid exposing old `AskPDF`-style hidden behavior as the primary model

### 7.1 Retrieval strategy
- [x] Decide what is V1 retrieval for `openai-api`
- [x] Decide what is V1 retrieval for `openai-codex`
- [x] Ensure product semantics stay stable even if retrieval internals differ

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

## 9. Session/history UX

History must be saved, but not always shown expanded.

- [x] Implement latest-session restore per context
- [x] Implement `New Session`
- [x] Implement history list/dropdown/drawer in header
- [x] Show recent sessions for current context
- [x] Switch session cleanly
- [x] Keep current session title/label visible

Optional-but-likely-later:
- [ ] rename session
- [ ] delete session
- [ ] search sessions

---

## 10. Assistant transport integration

The new UI/context system should reuse the already working backend pieces.

- [x] Define chat service boundary between UI and provider transports
- [x] Reuse current provider selection logic
- [x] Reuse Codex OAuth flow
- [x] Reuse Codex request path/body logic where sensible
- [x] Reuse OpenAI API mode where sensible
- [x] Preserve `/report`-style diagnostics somewhere, even if UI changes later

---

## 10.1 Custom API provider configuration

The panel now supports configuring a custom OpenAI-compatible API endpoint alongside Codex OAuth.

- [x] Add provider helper functions for custom API config (`getCustomApiConfig`, `setCustomApiConfig`, `hasCustomApiConfig`, `clearCustomApiConfig`, `getCustomApiStatusLabel`)
- [x] Add `testCustomApiConnection()` for validating custom endpoints before saving
- [x] Add `Configure API` button in panel header (alongside Codex auth button)
- [x] Implement sequential prompt flow: base URL → API key → model name → test connection
- [x] Update `render()` to show custom API button state (`Configure API` / `API: {model}`)
- [x] Update default model pref from `gpt-3.5-turbo` to `gpt-4o`
- [x] Add unit tests for custom API provider helpers
- [ ] Manual verification in Zotero: configure custom API, test connection, send a message

---

## 10.2 Webpage snapshot support

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
- [ ] Manual verification: open webpage snapshot, click Chat, verify text extraction and chat

---

## 11. Source citations and navigation

A core value of paper chat is being able to jump back to source.

- [x] Preserve existing source-jump capability where possible
- [x] Design citation chip format in the new panel
- [x] Clicking a citation should:
  - [x] jump to PDF region for paper chunks
  - [x] jump to a finer-grained paragraph/box region instead of page-level only
  - [ ] visually highlight/mark the relevant cited content after jump
  - [x] select Zotero item for item sources where appropriate
- [x] Make citations visible but not visually noisy

---

## 12. Formula rendering strategy

Current inherited baseline disables the old MathJax plugin path because it broke Zotero sandbox startup.

- [x] Decide safe formula rendering strategy for Sonder
- [ ] Confirm chosen strategy does not break plugin startup
- [ ] Test long technical/math-heavy answers in the new panel
- [x] Improve equation readability so outputs do not fall back to ugly raw formula text where avoidable
- [x] Prefer a markdown-like rendering/copy format that stays easy to paste into Notion

This is important because one major product requirement is explaining paper formulas/principles in long outputs.

---

## 13. Legacy command tags

Command tags are no longer the main product surface.

### V1 plan
- [x] Keep legacy command-tag system available only if cheap/safe
- [x] Remove command tags from primary UX path
- [x] Ensure new paper/item chat flows do not require understanding tags

### Later cleanup
- [x] Decide whether tags remain as advanced mode or move to separate legacy section

---

## 14. Cleanup inherited baseline issues

These are not blockers for the migration baseline, but they should be cleaned up deliberately.

- [ ] Investigate inherited non-fatal toolkit warning:
  - [ ] `TypeError: this.getGlobal(...).get(...) is not a constructor`
- [x] Remove temporary development auto-open hack once new panel entry exists
- [x] Remove legacy popup runtime module (`src/modules/views.ts`) after panel fallback was stabilized
- [x] Remove legacy command-tag module (`src/modules/base.ts`) from active codebase
- [x] Remove legacy views-coupled OpenAI helper flow (`getGPTResponse*`) from active codebase
- [x] Remove temporary views compatibility shim and startup views binding
- [ ] Remove/bootstrap debug marker code when no longer needed
- [ ] Clean up leftover predecessor naming in docs/comments where appropriate
- [ ] Decide whether old inherited assets/tags should stay in repo or move to legacy folder

---

## 15. Suggested implementation order

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
- [ ] citations/source jumps
- [ ] formula rendering
- [ ] legacy tag de-emphasis
- [ ] cleanup inherited warnings/hacks

---

## 16. V1 acceptance checklist

Sonder V1 should satisfy all of these:

### Stability
- [ ] plugin still loads reliably in Zotero
- [ ] Sonder still appears in Add-ons
- [ ] Codex OAuth still works
- [ ] Codex chat still works

### Paper chat
- [ ] open a PDF
- [ ] click `Chat`
- [ ] large panel opens
- [ ] clearly shows paper context
- [ ] ask multiple questions about the paper
- [ ] restore previous paper session later

### Item + paper chat
- [ ] select annotation/note item
- [ ] click `Chat`
- [ ] panel opens in item+paper mode
- [ ] selected item content is always included
- [ ] ask follow-up questions naturally
- [ ] restore previous item+paper session later

### History
- [ ] create a new session for same paper
- [ ] switch among sessions for same context

### UX
- [ ] main flow does not depend on command tags
- [x] main flow does not depend on shortcuts
- [ ] user always knows current context

---

## 17. Near-term first coding target

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
