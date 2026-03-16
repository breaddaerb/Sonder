# Paper Context Pipeline

This document describes how Sonder prepares and delivers paper context to the language model during chat.

Last updated: 2026-03-16

---

## Architecture Overview

```
┌─────────────┐     ┌──────────────────┐     ┌─────────────────┐     ┌──────────────┐
│  PDF/Snap   │────>│  Text Extraction │────>│  Page-Level     │────>│  Prepared    │
│  Reader     │     │  (per page)      │     │  Chunk Builder  │     │  Paper Cache │
│             │     │                  │     │  (one per page) │     │              │
└─────────────┘     └──────────────────┘     └─────────────────┘     └──────┬───────┘
                                                                            │
                                                                            v
┌─────────────┐     ┌──────────────────┐     ┌─────────────────┐     ┌──────────────┐
│  User       │────>│  Page-Range      │────>│  Prompt Builder │────>│  Transport   │
│  Question   │     │  Filter (opt.)   │     │  (full paper)   │     │  (API call)  │
└─────────────┘     └──────────────────┘     └─────────────────┘     └──────┬───────┘
                                                                            │
                                                                            v
                                              ┌─────────────────┐     ┌──────────────┐
                                              │  Citation Parse │<────│  Model       │
                                              │  & Filter       │     │  Response    │
                                              └─────────────────┘     └──────────────┘
```

## Key Files

| File | Responsibility |
|------|---------------|
| `src/context-chat/paperRetrieval.ts` | PDF/snapshot text extraction, page-level chunking, page-range filtering, prompt building, citation parsing |
| `src/context-chat/chatService.ts` | Orchestrates preparation, page-range filtering, transport, and citation assembly |
| `src/context-chat/paperContext.ts` | Resolves paper identity from the active Zotero reader |
| `src/context-chat/chatMessages.ts` | Converts stored messages to transport format |
| `src/context-chat/panel.ts` | Panel UI including page-range control |
| `src/modules/Meet/OpenAI.ts` | Transport layer (OpenAI API, Codex, fallback) |

---

## Phase 1: Text Extraction and Page-Level Chunking (Preparation)

When the user opens the chat panel, `ContextChatService.preparePaperContext()` triggers extraction. The result is cached per context ID so extraction only runs once per paper.

### PDF Extraction (`readPdfChunks`)

1. Access the PDF viewer via `reader._iframeWindow.wrappedJSObject.PDFViewerApplication`
2. Wait for `pdfLoadingTask.promise` and `pdfViewer.pagesPromise`
3. For each page:
   - Call `pdfPage.getTextContent()` to get raw `PDFItem[]` (text spans with transform matrices)
   - `mergeSameLine(items)` merges spans on the same y-coordinate into `PDFLine[]`
   - `chunkByPage(lines, pageIndex)` aggregates all lines on the page into a single `PaperChunk` with:
     - `id`: `p{page}-c1` (e.g., `p3-c1`)
     - `page`: 1-based page number
     - `content`: normalized text (all text on the page)
     - `topY` / `bottomY`: PDF y-coordinates of first/last line (origin bottom-left)

### Snapshot Extraction (`readSnapshotChunks`)

1. **Primary strategy**: Read HTML file from disk via `attachment.getFilePathAsync()`, then `extractTextFromHtmlString()` strips tags, scripts, styles, and decodes entities
2. **Fallback strategy**: Extract from reader iframe DOM, traversing nested iframes
3. All extracted text is chunked via `chunkByPageFromText(text, 1)` — a single chunk labeled as page 1

### Output: `PreparedPaperContext`

```typescript
interface PreparedPaperContext {
  contextId: string;
  paperKey: string;
  title: string;
  preparedAt: number;
  chunks: PaperChunk[];  // One chunk per page from the entire paper
}
```

---

## Phase 2: Full-Paper Context Delivery (with Optional Page-Range Filter)

When the user sends a message, `chatService.sendMessage()` sends **all pages** to the model by default. Modern frontier models (128k-200k+ tokens) can easily accommodate typical academic papers.

### Page-Range Filtering

Users can optionally set a page range (e.g., pages 1-8) to exclude irrelevant sections like references or appendices. When a `PageRange` is set:

```typescript
const contextChunks = filterChunksByPageRange(preparedPaper.chunks, pageRange);
```

`filterChunksByPageRange(chunks, pageRange?)` returns only chunks whose `page` falls within `[startPage, endPage]`. If no range is set, all chunks are returned.

The page range is configured via a button in the panel header ("Pages: All" or "Pages: 1-8") and is stored in memory per panel session (resets on panel reopen).

---

## Phase 3: Prompt Construction

### Paper mode (`buildPaperGroundedUserMessage`)

```
You are helping the user chat with the paper titled: {title}
The complete paper text is provided below (one section per page). Use it as your primary grounding...
When referring to specific parts of the paper, cite page numbers like [1] or [2].
...

Full paper content:
[1] (p.1) {page 1 content}
[2] (p.2) {page 2 content}
...

User question: {question}
```

### Item + Paper mode (`buildItemPaperGroundedUserMessage`)

Same structure but adds the selected annotation/note as a mandatory primary anchor before the paper context.

### Key behavior

- **All pages** (or page-range-filtered pages) are included — the model sees the complete paper
- Chunks are numbered `[1]` through `[N]` sequentially (one per page)
- The model is instructed to cite these numbers in its response
- Each citation chip maps to a full page

---

## Phase 4: Transport

The grounded user message replaces the last user message in the transport history:

```typescript
const transportHistory = this.buildTransportHistory(snapshot, groundedUserMessage);
const result = await requestProviderChat(transportHistory, { onText });
```

The transport layer (`requestProviderChat`) dispatches to:
- `requestOpenAIChat` — streaming via `/chat/completions` with SSE
- `requestCodexChat` — streaming via Codex `/responses` endpoint
- `requestFallbackChat` — legacy fallback

All use `Zotero.HTTP.request` with `requestObserver` for streaming.

---

## Phase 5: Citation Assembly

After the model responds:

1. `parseCitedIndices(responseText, maxIndex)` extracts cited chunk numbers from the response text using regex `/\[([\d,\s]+)\]/g` — supports `[1]`, `[1, 2]`, `[1,2,3]`
2. Only chunks the model actually cited get citation chips
3. `createPaperChunkCitations(citedChunks, citedIndices)` builds `Citation[]` with:
   - Label: `[N] p.X` (original index + page label)
   - `page` and `yOffset` / `yOffsetBottom` for fine-grained PDF scroll
4. In `item+paper` mode, a "Selected annotation/note" chip is prepended

---

## Token Budget Analysis

| Paper length | Pages | Approx tokens (full paper) | Typical model limit |
|---|---|---|---|
| 8-page paper | 8 | 8k-15k tokens | 128k-200k+ |
| 20-page paper | 20 | 20k-35k tokens | 128k-200k+ |
| 50-page thesis | 50 | 50k-80k tokens | 128k-200k+ |

Full-paper context delivery uses the available context window effectively. Most academic papers fit well within modern model limits. For very long documents, the page-range filter allows users to focus on relevant sections.
