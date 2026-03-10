# Sonder TODO

Status: paper-grounded panel chat in progress  
Last updated: 2026-03-10

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
  - [ ] clear/delete session (if included in V1)
- [x] Add migration-safe error handling
- [ ] Add simple dev inspection/logging helpers

---

## 4. Context model implementation

## 4.1 Paper context
- [x] Implement paper context resolver from current PDF
- [x] Define stable context title generation for paper
- [x] Implement "open latest session or create one" behavior for paper context

## 4.2 Item + paper context
- [ ] Detect selected annotation item / note item in Zotero
- [ ] Resolve parent paper from selected item
- [ ] Define stable `item+paper` context identity
- [ ] Implement "open latest session or create one" behavior for item+paper context
- [ ] Ensure selected item content is always force-injected into context

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
- [ ] Add visible `Chat` entry for selected item workflows
- [ ] Bind it to item+paper context opening

### 5.3 Safe fallback entry
- [ ] Add plugin menu entry / stable fallback opening path
- [ ] Ensure opening the panel does not depend on shortcuts

### 5.4 Shortcut policy
- [ ] Decide whether to keep current shortcut only as secondary convenience
- [ ] Ensure shortcut is not the primary UX dependency

---

## 6. New panel UI

Main direction: large right-side docked chat panel.

### 6.1 Mounting strategy
- [x] Decide where/how the panel mounts inside Zotero UI
- [x] Confirm panel can coexist with Zotero layout without breaking usability
- [x] Support panel open/close lifecycle safely

### 6.2 Header
- [x] Show context badge
  - [x] `Paper`
  - [ ] `Annotation + Paper`
  - [ ] `Note + Paper`
- [x] Show context title
- [x] Show current session title/label
- [x] Add header actions
  - [x] `New Session`
  - [x] `History`
  - [x] `Raw Markdown` / `Preview`
  - [ ] `Clear Current Session`
  - [ ] optional `Settings`
- [x] Add status indicator
  - [x] preparing
  - [x] ready
  - [x] failed

### 6.3 Message area
- [x] Large scrollable message list
- [x] User / assistant message separation
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
  - [ ] `Chatting with selected annotation + paper`

### 6.5 Resizing and layout
- [x] Set good default width (target: 40%–50%)
- [ ] Add resizable width support
- [ ] Ensure long answers are easy to scroll

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

- [ ] Always inject selected item text into context
- [ ] Retrieve supporting chunks from parent paper
- [ ] Preserve item identity in citations/source UI if relevant
- [ ] Ensure answers feel about *this item* rather than generic paper summary

### Required rule
- [ ] Item content must never be optional in `item+paper` mode

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

## 11. Source citations and navigation

A core value of paper chat is being able to jump back to source.

- [x] Preserve existing source-jump capability where possible
- [x] Design citation chip format in the new panel
- [x] Clicking a citation should:
  - [x] jump to PDF region for paper chunks
  - [ ] jump to a finer-grained paragraph/box region instead of page-level only
  - [ ] visually highlight/mark the relevant cited content after jump
  - [ ] select Zotero item for item sources where appropriate
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
- [ ] Keep legacy command-tag system available only if cheap/safe
- [ ] Remove command tags from primary UX path
- [ ] Ensure new paper/item chat flows do not require understanding tags

### Later cleanup
- [ ] Decide whether tags remain as advanced mode or move to separate legacy section

---

## 14. Cleanup inherited baseline issues

These are not blockers for the migration baseline, but they should be cleaned up deliberately.

- [ ] Investigate inherited non-fatal toolkit warning:
  - [ ] `TypeError: this.getGlobal(...).get(...) is not a constructor`
- [ ] Remove temporary development auto-open hack once new panel entry exists
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
- [ ] selected item detection
- [ ] force-injected item content
- [ ] paper retrieval supplement
- [ ] open/create session

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
- [ ] main flow does not depend on shortcuts
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
