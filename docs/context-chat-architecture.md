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
- legacy `Views` runtime as fallback while the new panel is incomplete

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

The inherited legacy surface remains in place for now:

- `src/modules/views.ts`
- command-tag-first entry flow
- shortcut-centric popup UX
- legacy in-memory session/message handling tied to `Views`

This is intentional so the new panel can be built incrementally without risking plugin loadability.

## Current implemented scope

Implemented so far:

- a visible `Chat` launcher button
- a large right-side global panel shell
- explicit `paper` context resolution from the active reader tab
- persisted session creation/loading for paper context
- history/new-session flow per paper context
- composer send button + `Enter` / `Shift+Enter` behavior
- basic multi-turn send/receive using the existing provider transport stack
- background paper preparation from the active PDF reader
- chunked paper retrieval and prompt grounding in the new panel transport path
- lightweight citation chips on assistant messages with PDF page jump behavior
- raw-markdown-first assistant output with a header toggle between `Raw Markdown` and rendered `Preview`
- optional preview rendering for readable headings, lists, tables, code blocks, and KaTeX/MathML-based math rendering after streaming completes

Still later:

- finer-grained source jumps beyond page-level navigation
- richer/final retrieval strategy beyond the initial lexical chunk ranking
- item + paper mode

## Context switching rule for now

In M1, context changes only on explicit open action.
The panel does not auto-switch while the user changes selections elsewhere.
