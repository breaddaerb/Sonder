import assert from "node:assert/strict";
import {
  buildPaperSystemMessage,
  buildItemPaperSystemMessage,
  buildPaperGroundedUserMessage,
  buildItemPaperGroundedUserMessage,
  PaperChunk,
} from "../src/context-chat/paperRetrieval";

const sampleChunks: PaperChunk[] = [
  { id: "p1-c1", page: 1, label: "p.1", content: "Introduction text about transformers." },
  { id: "p2-c1", page: 2, label: "p.2", content: "Methodology section describing attention." },
  { id: "p3-c1", page: 3, label: "p.3", content: "Results and evaluation metrics." },
];

// --- buildPaperSystemMessage ---

const paperSystem = buildPaperSystemMessage({ title: "Attention Is All You Need", chunks: sampleChunks });

// Contains paper title
assert.match(paperSystem, /Attention Is All You Need/);

// Contains paper content
assert.match(paperSystem, /Full paper content:/);
assert.match(paperSystem, /\[1\] \(p\.1\)/);
assert.match(paperSystem, /\[2\] \(p\.2\)/);
assert.match(paperSystem, /\[3\] \(p\.3\)/);

// Contains formatting instructions
assert.match(paperSystem, /cite page numbers/);
assert.match(paperSystem, /markdown/);
assert.match(paperSystem, /fenced code blocks/);

// Does NOT contain user question
assert.doesNotMatch(paperSystem, /User question:/);

// --- buildItemPaperSystemMessage ---

const itemSystem = buildItemPaperSystemMessage({
  paperTitle: "Attention Is All You Need",
  itemKind: "annotation",
  itemText: "The self-attention mechanism allows the model to attend to all positions.",
  chunks: sampleChunks,
});

// Contains item context
assert.match(itemSystem, /Selected annotation/);
assert.match(itemSystem, /self-attention mechanism/);
assert.match(itemSystem, /must never be ignored/);

// Contains paper content
assert.match(itemSystem, /Full paper content:/);

// Does NOT contain user question
assert.doesNotMatch(itemSystem, /User question:/);

// --- Note variant ---

const noteSystem = buildItemPaperSystemMessage({
  paperTitle: "Test Paper",
  itemKind: "note",
  itemText: "My research note about this paper.",
  chunks: sampleChunks,
});
assert.match(noteSystem, /Selected note/);
assert.match(noteSystem, /My research note/);

// --- Empty chunks ---

const emptySystem = buildPaperSystemMessage({ title: "Empty Paper", chunks: [] });
assert.match(emptySystem, /No paper content was extracted/);

// --- Prefix caching invariant: system message is identical across turns ---

const turn1System = buildPaperSystemMessage({ title: "Same Paper", chunks: sampleChunks });
const turn2System = buildPaperSystemMessage({ title: "Same Paper", chunks: sampleChunks });
const turn3System = buildPaperSystemMessage({ title: "Same Paper", chunks: sampleChunks });

assert.equal(turn1System, turn2System, "System message must be identical across turns for prefix caching");
assert.equal(turn2System, turn3System, "System message must be identical across turns for prefix caching");

// --- Backward compat: grounded user messages still work ---

const grounded = buildPaperGroundedUserMessage({
  title: "Test Paper",
  question: "What is the contribution?",
  chunks: sampleChunks,
});
assert.match(grounded, /User question: What is the contribution\?/);
assert.match(grounded, /Full paper content:/);

const itemGrounded = buildItemPaperGroundedUserMessage({
  paperTitle: "Test Paper",
  itemKind: "annotation",
  itemText: "Highlighted text.",
  question: "What does this mean?",
  chunks: sampleChunks,
});
assert.match(itemGrounded, /User question: What does this mean\?/);
assert.match(itemGrounded, /Selected annotation/);

// --- System message starts with the same prefix as grounded (minus question) ---
// This verifies the refactored grounded functions compose from system + question

const systemPart = buildPaperSystemMessage({ title: "Test Paper", chunks: sampleChunks });
assert.ok(
  grounded.startsWith(systemPart),
  "Grounded user message should start with the system message content",
);

console.log("system message caching tests passed");
