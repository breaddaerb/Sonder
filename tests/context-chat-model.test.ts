import assert from "node:assert/strict";
import { canSendDraft, toChatHistory } from "../src/context-chat/chatMessages";
import { buildPaperGroundedUserMessage, createPaperChunkCitations, selectRelevantPaperChunks } from "../src/context-chat/paperRetrieval";
import { renderMessageHTML } from "../src/context-chat/render";
import {
  createPaperContextId,
  createSessionId,
  createSessionTitle,
  getLatestSession,
  getNextSessionIndex,
  sortSessionsByUpdatedAt,
} from "../src/context-chat/types";

assert.equal(createPaperContextId("ABCD1234"), "paper:ABCD1234");
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

const relevantChunks = selectRelevantPaperChunks("transformer attention", [
  { id: "c1", page: 1, label: "p.1", content: "This paper studies convolutional baselines for vision tasks." },
  { id: "c2", page: 2, label: "p.2", content: "We explain transformer attention and multi-head attention in detail." },
  { id: "c3", page: 3, label: "p.3", content: "Results and ablations are reported for sequence modeling." },
]);
assert.equal(relevantChunks.some((chunk) => chunk.id == "c2"), true);

const citations = createPaperChunkCitations(relevantChunks);
assert.equal(citations[0].sourceType, "paper");
assert.equal(typeof citations[0].page, "number");
assert.match(citations[0].target || "", /^page:/);

const groundedPrompt = buildPaperGroundedUserMessage({
  title: "Attention Paper",
  question: "What does the paper say about attention?",
  chunks: relevantChunks,
});
assert.match(groundedPrompt, /Retrieved paper context:/);
assert.match(groundedPrompt, /markdown/);
assert.match(groundedPrompt, /fenced code blocks/);
assert.match(groundedPrompt, /\$\.\.\.\$/);
assert.match(groundedPrompt, /\$\$\.\.\.\$\$/);
assert.match(groundedPrompt, /p\.2/);
assert.match(groundedPrompt, /User question:/);

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

console.log("context-chat model tests passed");
