# Context Chat Rewrite Spec v0.1

Status: draft  
Project: `Sonder`  
Purpose: define the next-generation UX before implementation

---

## 1. Background

The current plugin is now able to:

- load as a Zotero plugin
- authenticate with ChatGPT/Codex via OAuth
- send Codex chat requests successfully

However, the current UX is still centered around:

- a small floating input box
- command tags such as `#AskPDF`
- hidden context-selection behavior

This is no longer the desired primary experience.

The target experience is a **context-aware academic chat panel**:

- open a PDF -> ask about the whole paper
- click an annotation or note item -> ask about that specific item with paper context
- keep large, readable, persistent multi-turn conversations

This spec describes that rewrite direction.

---

## 2. Product goal

Build a Zotero plugin whose main interaction model is:

> Chat with the current research context.

The primary contexts are:

1. **Current paper (PDF)**
2. **Selected item + parent paper**

The UX must feel like a serious reading/research workspace, not a prompt macro toy.

---

## 3. Locked design decisions

These decisions are already agreed and should be treated as fixed unless explicitly revisited.

### 3.1 Selected item default context

When the user selects an annotation item or note item and opens chat, the default context is:

- **item content is always force-injected into context**
- **paper content is used as supplementary retrieval context**

In other words, the default is **item + paper**, not item-only.

Rationale:

- item-only often lacks enough context
- the selected item should remain the main anchor
- the full paper should support interpretation and follow-up explanation

### 3.2 Chat panel opening behavior

The chat panel opens by **explicit button click**.
It should not auto-pop open while reading.

Rationale:

- avoids interrupting reading flow
- still allows the system to prepare context in the background
- makes the interaction intentional

### 3.3 Conversation history

Conversation history **must be persisted**.

Requirements:

- history is always saved
- the UI does not need to show all history by default
- the user can start a **new session** for the same paper
- the user can return to previous sessions later

### 3.4 Global panel model

Use **one global chat panel**, not multiple popups.
The context shown inside the panel changes depending on current user action.

### 3.5 History access

History should be accessible from a header control (for example, a dropdown or history drawer), not always expanded by default.

---

## 4. Main user stories

### Story A: Chat with the current paper

1. User opens a PDF in Zotero.
2. User clicks a visible `Chat` button.
3. A large side panel opens.
4. The panel clearly shows that the current context is the whole paper.
5. User asks questions across the full paper.
6. The system supports multi-turn follow-up.
7. Sessions are saved.

Expected user feeling:

> This paper is loaded, and I can chat with it naturally.

### Story B: Chat with a selected annotation/note item

1. User clicks an annotation item or note item in Zotero.
2. User clicks `Chat`.
3. The side panel opens with context shown as `Item + Paper`.
4. The item text is always directly included.
5. The parent paper is used to provide background.
6. User asks focused or follow-up questions.
7. Sessions are saved.

Expected user feeling:

> I am asking about this item, but the answer understands the rest of the paper.

### Story C: Revisit prior sessions

1. User returns to the same paper later.
2. User opens chat.
3. The latest session for that paper is restored.
4. User may continue it or create a new one.

Expected user feeling:

> My previous research conversation is still here.

---

## 5. UX principles

### 5.1 Context must be explicit

The UI should always show what the user is currently chatting with.
The user should never need to guess whether the system is using:

- whole paper
- selected item
- item + paper
- raw metadata only

### 5.2 No hidden mode switching behind vague labels

The old `AskPDF` behavior silently changed source depending on tab state.
The new design should avoid that.

If the current context is `Paper`, say so.
If the current context is `Annotation + Paper`, say so.

### 5.3 The chat UI must be large and readable

The primary use case includes:

- long explanations
- step-by-step reasoning
- formulas and technical text
- multi-turn discussion

Therefore, the main chat UI cannot be a tiny floating box.

### 5.4 Tags become advanced features

Command tags may remain available as a legacy or advanced system, but they are no longer the main entry point.

---

## 6. Information architecture

## 6.1 Core concepts

### Context
A context is the object the user is chatting with.

Planned context types for V1:

- `paper`
- `item+paper`

Possible future context types:

- `selection`
- `multiple-items`
- `collection`

### Session
A session is one conversation thread under one context.

### Message
A message is one user or assistant turn inside a session.

---

## 6.2 Context identity

Suggested context identity model:

### Paper context
Use a stable key tied to the opened PDF / attachment item.

Example:

```text
paper:<attachmentKey>
```

### Item + paper context
Use both item identity and paper identity.

Example:

```text
itempaper:<itemKey>:<paperKey>
```

This makes it possible to:

- keep sessions separate per paper
- keep sessions separate per selected item within a paper

---

## 7. UI spec

## 7.1 Main layout

The main UI is a **large right-side docked chat panel**.

Not a floating mini-window.

Suggested default width:

- 40% to 50% of the Zotero window

Resizable by the user.

---

## 7.2 Panel structure

### A. Header

The header should display:

- context type badge
  - `Paper`
  - `Annotation + Paper`
  - `Note + Paper`
- context title
  - paper title
  - item preview text if relevant
- current session title or generated label
- quick status indicator
  - `Preparing context...`
  - `Ready`
  - `Refresh needed`
  - `Failed`

Header actions:

- `New Session`
- `History`
- `Clear Current Session`
- `Settings`

Optional later:

- rename session
- pin context

### B. Message area

Requirements:

- large scrollable area
- clear separation between user and assistant messages
- markdown rendering
- support long answers comfortably
- support source citations / source chips
- future-safe for formulas and richer content

### C. Composer

Requirements:

- multiline textarea, not single-line input
- send button
- `Enter` to send, `Shift+Enter` for newline (proposed default)
- small contextual hint such as:
  - `Chatting with current paper`
  - `Chatting with selected annotation + paper`

---

## 7.3 Entry points

The panel should open by explicit click.

### PDF context entry

A visible entry should exist in the PDF reader UI.
Possible implementations:

- toolbar button
- top-right `Chat` button
- reader-side button

### Item context entry

When an annotation/note item is selected, there should be a visible `Chat` entry.
Possible implementations:

- item pane button
- context menu action
- global button that binds to current selection

### Fallback entry

A plugin menu item should exist as a safe fallback, independent of shortcut behavior.
This is important for usability and debugging.

---

## 8. Session behavior

## 8.1 Default open behavior

When the user opens the panel for a context:

- if a recent session exists for that context, open it
- otherwise create a new session automatically

## 8.2 New session behavior

The user can explicitly create a new session for the same context.
This is required for cases like:

- one session for summary
- one session for methods
- one session for theory discussion

## 8.3 History behavior

History should be persisted always, but not fully expanded by default.
The panel should expose a history control that allows:

- open recent sessions
- create new session
- switch among sessions for the same context

Later enhancements may include:

- rename session
- delete session
- search session history

---

## 9. Context behavior

## 9.1 Paper context

### User promise

When the user opens chat from a PDF, the system promise is:

> You can ask about the whole paper.

### Internal implementation guidance

This does **not** require sending the entire raw PDF text to the model each time.
The expected internal design is:

- parse the full PDF
- chunk the paper
- maintain a retrievable representation
- retrieve relevant chunks per question
- optionally include selected text when relevant

But the user-facing mental model remains:

- the whole paper is available

### Required status UX

The panel should indicate whether the paper is:

- preparing
- ready
- stale / needs refresh
- failed to prepare

---

## 9.2 Item + paper context

### User promise

When the user selects an annotation/note item and opens chat, the system promise is:

> The selected item is the main anchor, and the rest of the paper is available as background.

### Required behavior

- selected item content is always force-injected into prompt/context
- paper context is used for supplementary retrieval
- assistant should clearly answer the selected item in context of the paper

### Why this matters

This prevents the common failure mode where the user clicks a specific highlight, but the system answers only based on generic paper retrieval.

The selected item must never be optional in this mode.

---

## 10. Retrieval behavior

## 10.1 V1 retrieval philosophy

The plugin should prioritize **correct context semantics** over clever hidden heuristics.

### Paper context

Retrieve from parsed paper chunks.

### Item + paper context

Always include:

- the item text itself

Then add:

- relevant supporting chunks from the parent paper

This is the key rule already agreed.

---

## 10.2 Reuse from the current codebase

Useful parts of the current implementation may still be reused:

- PDF parsing/chunking logic in `src/modules/Meet/Zotero.ts`
- retrieval helpers and provider dispatch in `src/modules/Meet/OpenAI.ts`
- OAuth/provider logic in:
  - `src/modules/Meet/CodexOAuth.ts`
  - `src/modules/provider.ts`

However, the current `#AskPDF` command-tag behavior should **not** define the new UX.

The new system should make context selection explicit.

---

## 10.3 Embeddings vs fallback

Current reality:

- `openai-api` can use embeddings
- `openai-codex` currently falls back to simpler retrieval

For V1, the UX should not pretend these are identical internally.
But the product should still present a stable user-facing paper chat model.

Possible V1 status copy:

- `Paper context ready`
- optional diagnostic info kept inside a debug/settings view, not the main user flow

We can improve retrieval quality over time without changing the UX model.

---

## 11. Persistence model

## 11.1 What must be saved

At minimum, persist:

- contexts
- sessions
- messages
- created/updated timestamps
- provider/model used per session (recommended)

## 11.2 Suggested shape

Example conceptual model:

```ts
Context {
  id: string
  type: "paper" | "item+paper"
  paperKey?: string
  itemKey?: string
  title: string
  updatedAt: number
}

Session {
  id: string
  contextId: string
  title: string
  createdAt: number
  updatedAt: number
}

Message {
  id: string
  sessionId: string
  role: "user" | "assistant"
  content: string
  createdAt: number
  citations?: Citation[]
}
```

The exact storage format is not yet fixed.

## 11.3 Storage options

Possible implementation options:

- dedicated JSON storage (similar to current local JSON cache approach)
- Zotero prefs for small metadata only
- a more structured local file store

Recommendation:

- do **not** overload Zotero prefs with full chat logs
- use a dedicated storage layer for sessions/messages

---

## 12. Rewrite boundaries

The rewrite may be bold at the UX/runtime layer, but must preserve plugin usability.

## 12.1 Must keep stable

These parts should be treated as the stable base unless there is a very strong reason to change them:

- working plugin packaging/discovery shell
- current bootstrap/runtime loading shape
- current loadable plugin identity for testing
- Codex OAuth flow that is now proven working

## 12.2 Safe to rewrite heavily

These parts may be substantially redesigned:

- `src/modules/views.ts`
- current popup UI
- command-tag-first interaction flow
- current `AskPDF` primary behavior

## 12.3 Likely reusable subsystems

- provider abstraction
- Codex OAuth login / refresh
- OpenAI/Codex request handling
- parts of PDF parsing and auxiliary source linking

---

## 13. Legacy command tags

Command tags are no longer the primary product surface.

### New role

Command tags become:

- advanced mode
- power-user prompt macros
- optional automation layer

### V1 recommendation

Do not remove them immediately.
Instead:

- keep them working if feasible
- remove them from the main UX path
- avoid designing the new panel around them

This reduces risk while allowing the main experience to evolve.

---

## 14. Plugin usability requirement

The rewrite must not regress the core fact that the plugin now finally loads and authenticates successfully.

This means:

- do not casually destabilize the add-on shell
- prefer incremental replacement inside the working plugin runtime
- keep a visible fallback entry point for opening the panel
- test plugin discovery/load after major UI changes

In short:

> rewrite the experience boldly, but do not re-break plugin loadability.

---

## 15. Proposed implementation phases

These are not the final TODO list, but a suggested order.

### Phase 0: protect the working base

- keep current working packaging shell intact
- keep Codex OAuth working
- keep at least one safe way to open plugin UI

### Phase 1: build the new panel shell

- introduce right-side large panel UI
- explicit header/message/composer layout
- keep current backend calls simple at first

### Phase 2: implement paper context

- add explicit `Paper` context
- open from PDF via button
- create/load sessions per paper

### Phase 3: implement item + paper context

- detect selected annotation/note item
- force-inject item content
- retrieve paper support context
- create/load sessions per item+paper

### Phase 4: persistence + history UI

- persist contexts/sessions/messages
- add history switcher
- support new session per context

### Phase 5: de-emphasize command tags

- keep legacy access if needed
- remove tags from primary workflow

### Phase 6: polish

- formula rendering strategy
- citation/source jump UI polish
- settings/preferences cleanup
- remove temporary development hacks

---

## 16. Acceptance criteria for V1

V1 should be considered successful if all of the following are true:

### Plugin stability

- plugin still loads reliably in Zotero
- ChatGPT/Codex OAuth still works
- the main panel can be opened from a visible button/menu path

### Paper chat

- when a PDF is open, user can click `Chat`
- a large panel opens
- the panel clearly shows paper context
- user can ask multiple questions about the paper
- at least one session per paper is persisted and restorable

### Item + paper chat

- when an annotation/note item is selected, user can click `Chat`
- a large panel opens
- the panel clearly shows item + paper context
- selected item content is always included
- user can ask follow-up questions
- sessions are persisted and restorable

### History

- user can create a new session for the same paper
- user can switch between sessions for the same context

### UX

- the main flow does not depend on command tags
- the main flow does not depend on keyboard shortcuts
- the main flow does not require understanding hidden retrieval behavior

---

## 17. Open technical questions for implementation planning

These are implementation questions, not product-direction questions.

1. What storage layer should hold contexts/sessions/messages?
2. What exact panel mounting strategy fits Zotero UI best?
3. Which formula rendering strategy is safe in Zotero's plugin sandbox?
4. How should session titles be generated initially?
5. How much background indexing/preparation should happen before first chat open?

These can be decided during task breakdown.

---

## 18. Summary

The plugin is no longer aiming for “better command tags”.
It is aiming for a new primary UX:

- **explicit context-aware chat**
- **paper-first and item+paper-first workflows**
- **large side panel**
- **persistent multi-session conversations**

The rewrite can be bold, but it should reuse the now-working foundation:

- stable plugin loadability
- working Codex OAuth
- existing provider/backend pieces where sensible

That is the direction for the next implementation phase.
