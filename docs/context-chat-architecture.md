# Context Chat Architecture Note

Status: M1 foundation + basic paper-grounded chat

This note records the first rewrite boundary for Sonder's new context-chat UX.

## Stable foundation kept intact

These inherited parts remain the preserved baseline and should not be casually rewritten:

- `addon/bootstrap.js`
- `addon/manifest.json`
- `scripts/build.js`
- add-on packaging/output shape
- provider selection and transport plumbing
- Codex OAuth implementation
- legacy modules kept for compatibility, with startup now using a lightweight views shim instead of popup-first runtime

## New rewrite tree

The new UX is isolated under:

- `src/context-chat/`

Current rewrite modules:

- `src/context-chat/types.ts`
  - core persisted entities and helper functions
- `src/context-chat/storage.ts`
  - JSON-backed context/session/message store
- `src/context-chat/paperContext.ts`
  - current PDF paper-context resolver
- `src/context-chat/itemPaperContext.ts`
  - selected annotation/note resolver and parent-paper linkage for `item+paper` mode
- `src/context-chat/chatMessages.ts`
  - pure helpers for draft validation and provider-facing message history
- `src/context-chat/chatService.ts`
  - panel-facing send/receive orchestration, paper preparation state, and message persistence
- `src/context-chat/paperRetrieval.ts`
  - active-reader PDF parsing, chunking, lexical retrieval, and grounded prompt construction
- `src/context-chat/render.ts`
  - safe markdown rendering and readable code/math formatting for optional panel preview mode
- `src/context-chat/panel.ts`
  - global right-side panel shell and header/history/composer UI
- `src/context-chat/service.ts`
  - window lifecycle orchestration

## Legacy boundary

The inherited legacy surface has been narrowed and no longer drives startup runtime:

- popup runtime module `src/modules/views.ts` has been removed
- startup binds `Zotero[addon].views` to a lightweight compatibility shim
- command-tag and popup-first paths are removed from primary runtime and replaced by panel/menu UX

This keeps plugin loadability stable while removing dependence on the legacy popup architecture.

## Current implemented scope

Implemented so far:

- a visible `Chat` launcher button
- a fallback menu entry (`Sonder Chat Panel`) for stable opening
- a large right-side global panel shell with draggable width resizing
- explicit `paper` context resolution from the active reader tab
- explicit `item+paper` context resolution from selected annotation/note items
- persisted session creation/loading for both `paper` and `item+paper` contexts
- history/new-session flow per context
- clear-current-session action (message reset within active session)
- panel-header Codex auth actions (`Enable/Login/Finish/Logout`) reusing existing OAuth flow
- composer send button + `Enter` / `Shift+Enter` behavior
- basic multi-turn send/receive using the existing provider transport stack
- background paper preparation from the active PDF reader
- chunked paper retrieval and prompt grounding in the new panel transport path
- item+paper prompt path where selected item text is always force-injected and paper chunks are supplementary
- lightweight citation chips on assistant messages with PDF page jump behavior
- item+paper assistant messages include selected-item citation chips that can re-select the item in Zotero
- raw-markdown-first assistant output with a header toggle between `Raw Markdown` and rendered `Preview`
- optional preview rendering for readable headings, lists, tables, code blocks, and KaTeX/MathML-based math rendering after streaming completes

Still later:

- finer-grained source jumps beyond page-level navigation
- richer/final retrieval strategy beyond the initial lexical chunk ranking
- finer item-source navigation/highlighting beyond simple item selection

## Context switching rule for now

In M1, context changes only on explicit open action.
The panel does not auto-switch while the user changes selections elsewhere.
