### fine-grained-citation-jump ###

# Filter Citation Chips Tasks

- [x] Add a helper function to parse cited chunk indices from model response text
- [x] Update `createPaperChunkCitations()` in `paperRetrieval.ts` to accept optional original index labels
- [x] Update `buildAssistantCitations()` in `chatService.ts` to filter chunks based on model output
- [x] Update `README.md` to reflect the change
- [x] Run `npx tsc --noEmit`, `npm test`, `npm run build-dev` to verify
- [ ] Manual verification: test that only cited chunks appear as chips


updateAtTime: 2026/3/12 15:38:49

planId: 76b35149-fce6-4b6d-a5f2-5da10f1852ba