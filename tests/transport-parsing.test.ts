import assert from "node:assert/strict";

// We need to test internal functions that aren't exported, so we inline the logic.
// These tests validate the SSE parsing functions used by the transport layer.

// --- parseOpenAIText (copied from Meet/OpenAI.ts for testing) ---
function parseOpenAIText(raw: string) {
  try {
    return (raw.match(/data: (.+)/g) || []).filter((s: string) => s.indexOf("content") >= 0).map((s: string) => {
      try {
        return JSON.parse(s.replace("data: ", "")).choices[0].delta.content.replace(/\n+/g, "\n")
      } catch {
        return false
      }
    }).filter(Boolean).join("")
  } catch {
    return ""
  }
}

// Basic streaming response
assert.equal(
  parseOpenAIText('data: {"choices":[{"delta":{"content":"Hello"}}]}\n\ndata: {"choices":[{"delta":{"content":" world"}}]}'),
  "Hello world",
);

// Empty response
assert.equal(parseOpenAIText(""), "");

// [DONE] marker
assert.equal(
  parseOpenAIText('data: {"choices":[{"delta":{"content":"Hi"}}]}\n\ndata: [DONE]'),
  "Hi",
);

// Response with no content field (e.g. role delta) should be skipped
assert.equal(
  parseOpenAIText('data: {"choices":[{"delta":{"role":"assistant"}}]}\n\ndata: {"choices":[{"delta":{"content":"ok"}}]}'),
  "ok",
);

// Multiple newlines in content should be collapsed
assert.equal(
  parseOpenAIText('data: {"choices":[{"delta":{"content":"line1\\n\\n\\nline2"}}]}'),
  "line1\nline2",
);

// Malformed JSON in data line should not throw
assert.equal(
  parseOpenAIText('data: {"choices":[{"delta":{"content":"good"}}]}\n\ndata: {broken json}'),
  "good",
);

// --- parseCodexStream (copied from Meet/OpenAI.ts for testing) ---
function parseCodexStream(raw: string) {
  const textParts: string[] = []
  let errorText = ""
  const chunks = raw.replace(/\r/g, "").split("\n\n")
  chunks.forEach((chunk) => {
    const dataLines = chunk
      .split("\n")
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trim())
    if (dataLines.length == 0) { return }
    const data = dataLines.join("\n").trim()
    if (!data || data == "[DONE]") { return }
    try {
      const event = JSON.parse(data)
      if (event.type == "response.output_text.delta" || event.type == "response.refusal.delta") {
        textParts.push(String(event.delta || "").replace(/\n+/g, "\n"))
      } else if (event.type == "error") {
        errorText = event.message || JSON.stringify(event)
      } else if (event.type == "response.failed") {
        errorText = event.response?.error?.message || event.error?.message || JSON.stringify(event)
      }
    } catch { }
  })
  return {
    text: textParts.join(""),
    errorText,
  }
}

// Basic text delta
{
  const result = parseCodexStream('data: {"type":"response.output_text.delta","delta":"Hello"}\n\ndata: {"type":"response.output_text.delta","delta":" world"}');
  assert.equal(result.text, "Hello world");
  assert.equal(result.errorText, "");
}

// Error event
{
  const result = parseCodexStream('data: {"type":"error","message":"rate limited"}');
  assert.equal(result.text, "");
  assert.equal(result.errorText, "rate limited");
}

// Response failed event
{
  const result = parseCodexStream('data: {"type":"response.failed","response":{"error":{"message":"model overloaded"}}}');
  assert.equal(result.text, "");
  assert.equal(result.errorText, "model overloaded");
}

// Refusal delta
{
  const result = parseCodexStream('data: {"type":"response.refusal.delta","delta":"I cannot help with that."}');
  assert.equal(result.text, "I cannot help with that.");
  assert.equal(result.errorText, "");
}

// [DONE] should be skipped
{
  const result = parseCodexStream('data: {"type":"response.output_text.delta","delta":"ok"}\n\ndata: [DONE]');
  assert.equal(result.text, "ok");
}

// Empty input
{
  const result = parseCodexStream("");
  assert.equal(result.text, "");
  assert.equal(result.errorText, "");
}

// Mixed text and error — error takes precedence via errorText field
{
  const result = parseCodexStream('data: {"type":"response.output_text.delta","delta":"partial"}\n\ndata: {"type":"error","message":"timeout"}');
  assert.equal(result.text, "partial");
  assert.equal(result.errorText, "timeout");
}

// --- buildCodexInput (copied from Meet/OpenAI.ts for testing) ---
function buildCodexInput(messages: { role: "user" | "assistant"; content: string }[]) {
  return messages.map((message, index) => {
    if (message.role == "user") {
      return {
        role: "user",
        content: [{ type: "input_text", text: message.content }],
      }
    }
    return {
      type: "message",
      role: "assistant",
      content: [{ type: "output_text", text: message.content, annotations: [] }],
      status: "completed",
      id: `msg_${index}`,
    }
  })
}

// Single user message
{
  const input = buildCodexInput([{ role: "user", content: "Hi" }]);
  assert.equal(input.length, 1);
  assert.equal(input[0].role, "user");
  assert.deepEqual((input[0] as any).content, [{ type: "input_text", text: "Hi" }]);
}

// Multi-turn conversation
{
  const input = buildCodexInput([
    { role: "user", content: "Hello" },
    { role: "assistant", content: "Hi there" },
    { role: "user", content: "Follow up" },
  ]);
  assert.equal(input.length, 3);
  assert.equal(input[0].role, "user");
  assert.equal(input[1].role, "assistant");
  assert.equal((input[1] as any).type, "message");
  assert.equal((input[1] as any).status, "completed");
  assert.equal((input[1] as any).id, "msg_1");
  assert.equal(input[2].role, "user");
}

// --- formatTransportError ---
import { formatTransportError } from "../src/modules/Meet/OpenAI";

assert.match(
  formatTransportError({ message: "timeout", url: "https://api.example.com/chat", status: 504 }),
  /Error 504/,
);
assert.match(
  formatTransportError({ message: "rate limit", code: "rate_limit_exceeded", url: "https://api.openai.com" }),
  /rate_limit_exceeded/,
);
assert.match(
  formatTransportError({ message: "unknown", type: "server_error", url: "https://api.openai.com" }),
  /server_error/,
);

console.log("transport parsing tests passed");
