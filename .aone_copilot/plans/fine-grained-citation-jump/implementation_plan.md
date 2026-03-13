### fine-grained-citation-jump ###
Filter citation chips to only show chunks the model explicitly cited in its response, by parsing citation markers like [1], [2] from the assistant's output text.


# 仅显示模型实际引用的 Citation Chips

## Background
Currently, all 5 retrieved chunks are shown as citation chips below the assistant's response, even if the model only cited 1 or 2 of them. This is misleading — the user sees 5 clickable chips but the model's text only references `[1]`. This change filters citation chips to only include chunks the model explicitly referenced.

## Proposed Changes

### Core Logic

#### [MODIFY] [chatService.ts](file:///Users/zhilin/Work/Sonder/src/context-chat/chatService.ts)
- After receiving the model's response (`result.content`), parse it for citation markers matching the pattern `[1]`, `[2]`, ..., `[N]` (where N is the number of retrieved chunks)
- Filter `relevantChunks` to only include chunks whose index was cited by the model
- Pass the filtered chunks to `buildAssistantCitations()` instead of all retrieved chunks
- The filtering must preserve the original 1-based index labels so that `[1]` in the model text still maps to `[1]` in the chip label

Key implementation detail: The model cites chunks as `[1]`, `[2]`, etc. These are 1-based indices into the `relevantChunks` array. We need to:
1. Extract all unique cited indices from the model output using regex `/\[(\d+)\]/g`
2. Filter to only valid indices (1 to relevantChunks.length)
3. Build citations only for the cited chunks, but **preserve their original index labels** so `[1]` in text matches `[1]` on the chip

#### [MODIFY] [paperRetrieval.ts](file:///Users/zhilin/Work/Sonder/src/context-chat/paperRetrieval.ts)
- Update `createPaperChunkCitations()` to accept an optional `originalIndices` parameter — an array of original 1-based indices, so the label shows `[1]` even if only 1 chunk is passed
- If `originalIndices` is not provided, fall back to current behavior (sequential 1-based labels)

---

### Documentation

#### [MODIFY] [README.md](file:///Users/zhilin/Work/Sonder/README.md)
- Update citation chip description to mention that only model-cited chunks are shown

---

## Verification Plan

### Automated Tests
- `npx tsc --noEmit` — type check
- `npm test` — existing tests
- `npm run build-dev` — build verification

### Manual Verification
- Ask a question where the model only cites 1-2 of the 5 retrieved chunks
- Verify: only the cited chunks appear as chips, with correct labels matching the model's text
- Verify: clicking the chip still jumps to the correct location with highlight


updateAtTime: 2026/3/12 15:38:49

planId: 76b35149-fce6-4b6d-a5f2-5da10f1852ba