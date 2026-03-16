import assert from "node:assert/strict";
import { canSendDraft, toChatHistory } from "../src/context-chat/chatMessages";
import {
  buildItemPaperGroundedUserMessage,
  buildPaperGroundedUserMessage,
  chunkByPage,
  chunkByPageFromText,
  createPaperChunkCitations,
  filterChunksByPageRange,
  parseCitedIndices,
} from "../src/context-chat/paperRetrieval";
import { renderMessageHTML } from "../src/context-chat/render";
import {
  createItemPaperContextId,
  createPaperContextId,
  createSessionId,
  createSessionTitle,
  getLatestSession,
  getNextSessionIndex,
  sortSessionsByUpdatedAt,
} from "../src/context-chat/types";

assert.equal(createPaperContextId("ABCD1234"), "paper:ABCD1234");
assert.equal(createItemPaperContextId("ITEM1", "PAPER1"), "itempaper:ITEM1:PAPER1");
assert.equal(createSessionTitle(3), "Session 3");
assert.equal(getNextSessionIndex([{ id: "s1" }, { id: "s2" }]), 3);
assert.match(createSessionId(123456789, 0.5), /^session:123456789:/);

const sessions = [
  { id: "older", createdAt: 1, updatedAt: 2 },
  { id: "latest", createdAt: 2, updatedAt: 7 },
  { id: "middle", createdAt: 3, updatedAt: 5 },
];

assert.deepEqual(sortSessionsByUpdatedAt(sessions).map((session) => session.id), [
  "latest",
  "middle",
  "older",
]);
assert.equal(getLatestSession(sessions)?.id, "latest");
assert.equal(canSendDraft("hello"), true);
assert.equal(canSendDraft("   \n  "), false);
assert.deepEqual(
  toChatHistory([
    { id: "m1", sessionId: "s1", role: "system", content: "ignore", createdAt: 1 },
    { id: "m2", sessionId: "s1", role: "user", content: "question", createdAt: 2 },
    { id: "m3", sessionId: "s1", role: "assistant", content: "answer", createdAt: 3 },
  ]),
  [
    { role: "user", content: "question" },
    { role: "assistant", content: "answer" },
  ]
);

// --- chunkByPage tests ---
const pageChunk = chunkByPage(
  [
    { text: "First line", y: 700 },
    { text: "Second line", y: 680 },
  ],
  1,
);
assert.ok(pageChunk, "chunkByPage should return a chunk for non-empty lines");
assert.equal(pageChunk!.id, "p1-c1");
assert.equal(pageChunk!.page, 1);
assert.equal(pageChunk!.label, "p.1");
assert.match(pageChunk!.content, /First line/);
assert.match(pageChunk!.content, /Second line/);
assert.equal(pageChunk!.topY, 700);
assert.equal(pageChunk!.bottomY, 680);

const emptyPageChunk = chunkByPage([], 5);
assert.equal(emptyPageChunk, null, "chunkByPage should return null for empty lines");

// --- chunkByPageFromText tests ---
const textChunk = chunkByPageFromText("Hello world\nSecond paragraph", 3);
assert.ok(textChunk, "chunkByPageFromText should return a chunk for non-empty text");
assert.equal(textChunk!.id, "p3-c1");
assert.equal(textChunk!.page, 3);
assert.equal(textChunk!.label, "p.3");
assert.match(textChunk!.content, /Hello world/);
assert.match(textChunk!.content, /Second paragraph/);

const emptyTextChunk = chunkByPageFromText("   \n  ", 1);
assert.equal(emptyTextChunk, null, "chunkByPageFromText should return null for whitespace-only text");

// --- filterChunksByPageRange tests ---
const allChunks = [
  { id: "c1", page: 1, label: "p.1", content: "Page 1 content" },
  { id: "c2", page: 2, label: "p.2", content: "Page 2 content" },
  { id: "c3", page: 3, label: "p.3", content: "Page 3 content" },
  { id: "c4", page: 4, label: "p.4", content: "Page 4 content" },
  { id: "c5", page: 5, label: "p.5", content: "Page 5 content" },
];
// No range — returns all
assert.equal(filterChunksByPageRange(allChunks).length, 5);
assert.equal(filterChunksByPageRange(allChunks, undefined).length, 5);
// Range 2-4
const filtered = filterChunksByPageRange(allChunks, { startPage: 2, endPage: 4 });
assert.equal(filtered.length, 3);
assert.deepEqual(filtered.map((c) => c.page), [2, 3, 4]);
// Range 1-1 (single page)
assert.equal(filterChunksByPageRange(allChunks, { startPage: 1, endPage: 1 }).length, 1);
// Range beyond available pages
assert.equal(filterChunksByPageRange(allChunks, { startPage: 10, endPage: 20 }).length, 0);

// --- createPaperChunkCitations tests ---
const citations = createPaperChunkCitations(allChunks);
assert.equal(citations[0].sourceType, "paper");
assert.equal(typeof citations[0].page, "number");
assert.match(citations[0].target || "", /^page:/);

// --- buildPaperGroundedUserMessage tests ---
const groundedPrompt = buildPaperGroundedUserMessage({
  title: "Attention Paper",
  question: "What does the paper say about attention?",
  chunks: allChunks.slice(0, 3),
});
assert.match(groundedPrompt, /Full paper content:/);
assert.match(groundedPrompt, /markdown/);
assert.match(groundedPrompt, /fenced code blocks/);
assert.match(groundedPrompt, /\$\.\.\.\$/);
assert.match(groundedPrompt, /p\.2/);
assert.match(groundedPrompt, /User question:/);

// --- buildItemPaperGroundedUserMessage tests ---
const itemGroundedPrompt = buildItemPaperGroundedUserMessage({
  paperTitle: "Attention Paper",
  itemKind: "annotation",
  itemText: "Selected highlighted sentence.",
  question: "What does this sentence imply?",
  chunks: allChunks.slice(0, 3),
});
assert.match(itemGroundedPrompt, /Selected annotation/);
assert.match(itemGroundedPrompt, /must never be ignored/);
assert.match(itemGroundedPrompt, /Full paper content:/);

const renderedHTML = renderMessageHTML([
  "# Heading",
  "",
  "Inline math: $E = mc^2$ and \\(a+b\\)",
  "",
  "```ts",
  "const answer = 42;",
  "```",
  "",
  "$$",
  "a^2 + b^2 = c^2",
  "$$",
  "",
  "\\[",
  "\\int_0^1 x^2 dx",
  "\\]",
].join("\n"));
assert.match(renderedHTML, /<h1>Heading<\/h1>/);
assert.match(renderedHTML, /sonder-inline-math/);
assert.match(renderedHTML, /language-ts/);
assert.match(renderedHTML, /sonder-math-block/);
assert.match(renderedHTML, /<math/);
assert.match(renderMessageHTML("plain text"), /plain text/);
assert.equal(typeof renderMessageHTML(""), "string");

// parseCitedIndices tests
// Standalone markers: [1], [3]
assert.deepEqual(parseCitedIndices("As shown in [1] and [3], the results...", 5), [1, 3]);
// Grouped/comma-separated: [1, 2], [1,2,3]
assert.deepEqual(parseCitedIndices("Evidence from [1, 2] supports this.", 5), [1, 2]);
assert.deepEqual(parseCitedIndices("See [1,2,3] for details.", 5), [1, 2, 3]);
assert.deepEqual(parseCitedIndices("Refs [1, 3, 5] and [2].", 5), [1, 2, 3, 5]);
// Out-of-range indices are filtered
assert.deepEqual(parseCitedIndices("See [0] and [6] and [3].", 5), [3]);
// No citations
assert.deepEqual(parseCitedIndices("No citations here.", 5), []);
// Duplicates are deduplicated
assert.deepEqual(parseCitedIndices("[1] and [1] again [1, 2].", 5), [1, 2]);
// Mixed standalone and grouped
assert.deepEqual(parseCitedIndices("[1] then [2, 4] then [3].", 5), [1, 2, 3, 4]);

console.log("context-chat model tests passed");
