import assert from "node:assert/strict";
import { canSendDraft, toChatHistory } from "../src/context-chat/chatMessages";
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

console.log("context-chat model tests passed");
