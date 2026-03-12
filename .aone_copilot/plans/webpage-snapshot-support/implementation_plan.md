### webpage-snapshot-support ###
Add support for webpage snapshot attachments in context chat, alongside the existing PDF support. Also improve error messages for unsupported attachment types.


# 支持网页快照附件的上下文聊天

## Background

The context chat panel currently only supports PDF attachments. When a user opens a webpage snapshot (HTML attachment) in Zotero's reader, the panel shows "Failed" because:

1. `resolveCurrentPaperContext()` in `paperContext.ts` checks `attachment.isPDFAttachment()` and returns `undefined` for non-PDF types
2. `readCurrentReaderPaperChunks()` in `paperRetrieval.ts` also checks `isPDFAttachment()` and throws an error
3. The panel's `openCurrentContext()` then falls through to the error state

The fix requires changes at three layers:
- **Context resolution**: Accept snapshot attachments alongside PDFs
- **Content retrieval**: Extract text from HTML snapshots (instead of PDF pages)
- **Error messaging**: Show clear messages for truly unsupported types

## User Review Required

> [!IMPORTANT]
> Webpage snapshots in Zotero are HTML files stored locally. The text extraction approach will use the reader's iframe DOM to extract visible text content, similar to how PDF text is extracted via `PDFViewerApplication`. For snapshots, we'll access the iframe's `document.body.textContent` since Zotero renders them in an iframe-based reader.

> [!WARNING]
> Snapshot text extraction quality depends on the HTML structure. Some snapshots may contain navigation, ads, or other non-content elements. We'll use a best-effort approach with basic content cleaning (removing scripts, styles, nav elements).

## Proposed Changes

### Context Resolution Layer

#### [MODIFY] [paperContext.ts](file:///Users/zhilin/Work/Sonder/src/context-chat/paperContext.ts)

Expand `resolveCurrentPaperContext()` to accept both PDF and snapshot attachments:

- Replace `attachment.isPDFAttachment()` check with a broader check that also accepts snapshot/HTML attachments
- Use `attachment.attachmentContentType` to detect `text/html` or check `attachment.isSnapshotAttachment?.()` (Zotero 7 API) or fall back to content type check
- The returned `PaperContextDescriptor` structure remains the same — it already has generic field names (`attachmentKey`, `title`, etc.)

---

### Content Retrieval Layer

#### [MODIFY] [paperRetrieval.ts](file:///Users/zhilin/Work/Sonder/src/context-chat/paperRetrieval.ts)

Add a new function `readCurrentReaderSnapshotChunks()` for extracting text from HTML snapshots, and modify `readCurrentReaderPaperChunks()` to dispatch between PDF and snapshot extraction:

- Add `readCurrentReaderSnapshotChunks(expectedAttachmentKey, contextId, title)`:
  - Access the reader's iframe window
  - Extract text from the HTML document body using DOM traversal
  - Clean the text (remove script/style/nav/header/footer elements)
  - Chunk the extracted text using the existing `chunkText()` function (treating the whole document as page 1, or splitting by major sections)
  - Return a `PreparedPaperContext` with the extracted chunks

- Modify `readCurrentReaderPaperChunks()`:
  - Instead of throwing when `!attachment.isPDFAttachment()`, check if it's a snapshot
  - If PDF: use existing PDF extraction logic
  - If snapshot/HTML: delegate to `readCurrentReaderSnapshotChunks()`
  - If neither: throw a clear error message

---

### Item Paper Context Layer

#### [MODIFY] [itemPaperContext.ts](file:///Users/zhilin/Work/Sonder/src/context-chat/itemPaperContext.ts)

Update functions that check `isPDFAttachment()` to also accept snapshot attachments:

- `resolveFromReader()`: Accept snapshot attachments alongside PDFs
- `getAttachmentFromNote()`: When looking for attachments from a note's parent, also consider snapshot attachments (not just PDFs)

---

### Error Messaging

#### [MODIFY] [panel.ts](file:///Users/zhilin/Work/Sonder/src/context-chat/panel.ts)

Improve error messages in `openCurrentContext()`:

- When neither `itemPaperContext` nor `paperContext` is resolved, provide a more specific error message that mentions supported types: "Open a PDF or webpage snapshot, then click Chat. Other attachment types are not yet supported."

---

### Type Definitions

#### [MODIFY] [global.d.ts](file:///Users/zhilin/Work/Sonder/typing/global.d.ts)

No changes needed — the existing types are sufficient. The `PaperContextDescriptor` and `PaperChunk` interfaces are generic enough to work with both PDF and snapshot content.

---

### Documentation

#### [MODIFY] [README.md](file:///Users/zhilin/Work/Sonder/README.md)

Update the context chat documentation to mention webpage snapshot support.

#### [MODIFY] [todo.md](file:///Users/zhilin/Work/Sonder/todo.md)

Update progress tracking.

## Verification Plan

### Automated Tests

- Run `npx tsc --noEmit` to verify TypeScript compilation
- Run `npm test` to verify existing tests still pass
- Run `npm run build-dev` to verify the build succeeds

### Manual Verification

- Open a PDF in Zotero → Click Chat → verify it still works as before
- Open a webpage snapshot in Zotero → Click Chat → verify the panel shows "Ready" and text is extracted
- Open an unsupported attachment type (e.g., EPUB) → Click Chat → verify a clear error message is shown
- Test sending a message with a webpage snapshot context → verify the response uses the extracted content


updateAtTime: 2026/3/12 14:24:21

planId: 76b35149-fce6-4b6d-a5f2-5da10f1852ba