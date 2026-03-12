### webpage-snapshot-support ###

# Webpage Snapshot Support - Tasks

## Context Resolution
- [ ] Modify `resolveCurrentPaperContext()` in `paperContext.ts` to accept snapshot/HTML attachments alongside PDFs
- [ ] Add helper function `isSupportedAttachment(attachment)` to centralize attachment type checking

## Content Retrieval
- [ ] Add `readCurrentReaderSnapshotChunks()` function in `paperRetrieval.ts` for HTML text extraction
- [ ] Add `extractSnapshotText(iframeWindow)` helper to clean and extract text from HTML DOM
- [ ] Modify `readCurrentReaderPaperChunks()` to dispatch between PDF and snapshot extraction based on attachment type
- [ ] Update error message in `readCurrentReaderPaperChunks()` for unsupported attachment types

## Item Paper Context
- [ ] Update `resolveFromReader()` in `itemPaperContext.ts` to accept snapshot attachments
- [ ] Update `getAttachmentFromNote()` in `itemPaperContext.ts` to find snapshot attachments

## Error Messaging
- [ ] Improve error message in `openCurrentContext()` in `panel.ts` for unsupported attachment types

## Documentation and Verification
- [ ] Update `README.md` to mention webpage snapshot support
- [ ] Update `todo.md` with progress
- [ ] Run `npx tsc --noEmit` — verify no TypeScript errors
- [ ] Run `npm test` — verify all tests pass
- [ ] Run `npm run build-dev` — verify build succeeds
- [ ] Manual test: PDF context chat still works
- [ ] Manual test: Webpage snapshot context chat works
- [ ] Manual test: Unsupported attachment shows clear error message


updateAtTime: 2026/3/12 14:24:21

planId: 76b35149-fce6-4b6d-a5f2-5da10f1852ba