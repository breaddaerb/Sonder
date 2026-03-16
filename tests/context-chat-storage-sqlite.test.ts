import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import ContextChatStore from "../src/context-chat/storage";
import { createItemPaperContextId, createPaperContextId } from "../src/context-chat/types";

interface ContextRow {
  id: string;
  type: string;
  title: string;
  paper_key: string | null;
  item_key: string | null;
  library_id: number | null;
  item_text: string | null;
  item_kind: string | null;
  updated_at: number;
}

interface SessionRow {
  id: string;
  context_id: string;
  title: string;
  created_at: number;
  updated_at: number;
  provider: string | null;
  model: string | null;
  item_key: string | null;
  paper_key: string | null;
}

interface MessageRow {
  id: string;
  session_id: string;
  role: "system" | "user" | "assistant";
  content: string;
  created_at: number;
  citations_json: string | null;
}

interface InsightRow {
  id: string;
  item_key: string;
  library_id: number | null;
  annotation_key: string | null;
  session_id: string;
  message_id: string | null;
  content: string;
  created_at: number;
}

class FakeSqliteConnection {
  public contexts = new Map<string, ContextRow>();
  public sessions = new Map<string, SessionRow>();
  public messages = new Map<string, MessageRow>();
  public insights = new Map<string, InsightRow>();

  async executeTransaction(handler: () => Promise<void>) {
    await handler();
  }

  async execute(sql: string, params: any[] = []) {
    const q = sql.replace(/\s+/g, " ").trim().toUpperCase();

    if (q.startsWith("PRAGMA ") || q.startsWith("CREATE TABLE") || q.startsWith("CREATE INDEX")) {
      return [];
    }

    if (q.startsWith("SELECT COUNT(*) AS COUNT FROM SESSIONS WHERE CONTEXT_ID = ?")) {
      const contextId = String(params[0]);
      const count = Array.from(this.sessions.values()).filter((s) => s.context_id == contextId).length;
      return [{ count }];
    }

    if (q.startsWith("SELECT COUNT(*) AS COUNT FROM SESSIONS")) {
      return [{ count: this.sessions.size }];
    }

    if (q.includes("INSERT OR REPLACE INTO CONTEXTS") || q.startsWith("INSERT INTO CONTEXTS")) {
      const [id, type, title, paper_key, item_key, library_id, item_text, item_kind, updated_at] = params;
      this.contexts.set(String(id), {
        id: String(id),
        type: String(type),
        title: String(title),
        paper_key: paper_key == null ? null : String(paper_key),
        item_key: item_key == null ? null : String(item_key),
        library_id: library_id == null ? null : Number(library_id),
        item_text: item_text == null ? null : String(item_text),
        item_kind: item_kind == null ? null : String(item_kind),
        updated_at: Number(updated_at),
      });
      return [];
    }

    if (q.startsWith("UPDATE CONTEXTS SET UPDATED_AT = ?")) {
      const [updatedAt, title, paperKey, itemKey, libraryID, itemText, itemKind, id] = params;
      const row = this.contexts.get(String(id));
      if (row) {
        row.updated_at = Number(updatedAt);
        row.title = String(title);
        row.paper_key = paperKey == null ? null : String(paperKey);
        row.item_key = itemKey == null ? null : String(itemKey);
        row.library_id = libraryID == null ? null : Number(libraryID);
        row.item_text = itemText == null ? null : String(itemText);
        row.item_kind = itemKind == null ? null : String(itemKind);
      }
      return [];
    }

    if (q.includes("FROM CONTEXTS WHERE ID = ?")) {
      const id = String(params[0]);
      const row = this.contexts.get(id);
      return row ? [row] : [];
    }

    if (q.includes("INSERT OR REPLACE INTO SESSIONS") || q.startsWith("INSERT INTO SESSIONS")) {
      const [id, context_id, title, created_at, updated_at, provider, model, item_key, paper_key] = params;
      this.sessions.set(String(id), {
        id: String(id),
        context_id: String(context_id),
        title: String(title),
        created_at: Number(created_at),
        updated_at: Number(updated_at),
        provider: provider == null ? null : String(provider),
        model: model == null ? null : String(model),
        item_key: item_key == null ? null : String(item_key),
        paper_key: paper_key == null ? null : String(paper_key),
      });
      return [];
    }

    if (q.startsWith("UPDATE SESSIONS SET TITLE = ?, UPDATED_AT = ?")) {
      const [title, updatedAt, id] = params;
      const row = this.sessions.get(String(id));
      if (row) {
        row.title = String(title);
        row.updated_at = Number(updatedAt);
      }
      return [];
    }

    if (q.startsWith("UPDATE SESSIONS SET UPDATED_AT = ?")) {
      const [updatedAt, provider, model, id] = params;
      const row = this.sessions.get(String(id));
      if (row) {
        row.updated_at = Number(updatedAt);
        row.provider = provider == null ? null : String(provider);
        row.model = model == null ? null : String(model);
      }
      return [];
    }

    if (q.startsWith("DELETE FROM SESSIONS WHERE ID = ?")) {
      const id = String(params[0]);
      this.sessions.delete(id);
      for (const [messageId, message] of this.messages.entries()) {
        if (message.session_id == id) {
          this.messages.delete(messageId);
        }
      }
      for (const [insightId, insight] of this.insights.entries()) {
        if (insight.session_id == id) {
          this.insights.delete(insightId);
        }
      }
      return [];
    }

    if (q.includes("FROM SESSIONS WHERE ID = ?")) {
      const id = String(params[0]);
      const row = this.sessions.get(id);
      return row ? [row] : [];
    }

    if (q.includes("FROM SESSIONS WHERE CONTEXT_ID = ?") && q.includes("LIMIT 1")) {
      const contextId = String(params[0]);
      const rows = Array.from(this.sessions.values())
        .filter((row) => row.context_id == contextId)
        .sort((a, b) => b.updated_at - a.updated_at || b.created_at - a.created_at);
      return rows.length ? [rows[0]] : [];
    }

    if (q.includes("FROM SESSIONS") && q.includes("WHERE CONTEXT_ID = ?") && !q.includes("LIMIT 1")) {
      const contextId = String(params[0]);
      return Array.from(this.sessions.values())
        .filter((row) => row.context_id == contextId)
        .sort((a, b) => b.updated_at - a.updated_at || b.created_at - a.created_at);
    }

    if (q.includes("FROM SESSIONS") && q.includes("WHERE ITEM_KEY = ?")) {
      const itemKey = String(params[0]);
      return Array.from(this.sessions.values())
        .filter((row) => row.item_key == itemKey)
        .sort((a, b) => b.updated_at - a.updated_at || b.created_at - a.created_at);
    }

    if (q.includes("INSERT OR REPLACE INTO MESSAGES") || q.startsWith("INSERT INTO MESSAGES")) {
      const [id, session_id, role, content, created_at, citations_json] = params;
      this.messages.set(String(id), {
        id: String(id),
        session_id: String(session_id),
        role: role as MessageRow["role"],
        content: String(content),
        created_at: Number(created_at),
        citations_json: citations_json == null ? null : String(citations_json),
      });
      return [];
    }

    if (q.startsWith("DELETE FROM MESSAGES WHERE SESSION_ID = ?")) {
      const sessionId = String(params[0]);
      for (const [id, row] of this.messages.entries()) {
        if (row.session_id == sessionId) {
          this.messages.delete(id);
        }
      }
      return [];
    }

    if (q.includes("FROM MESSAGES") && q.includes("WHERE SESSION_ID = ?")) {
      const sessionId = String(params[0]);
      return Array.from(this.messages.values())
        .filter((row) => row.session_id == sessionId)
        .sort((a, b) => a.created_at - b.created_at);
    }

    if (q.startsWith("INSERT INTO INSIGHTS")) {
      const [id, item_key, library_id, annotation_key, session_id, message_id, content, created_at] = params;
      this.insights.set(String(id), {
        id: String(id),
        item_key: String(item_key),
        library_id: library_id == null ? null : Number(library_id),
        annotation_key: annotation_key == null ? null : String(annotation_key),
        session_id: String(session_id),
        message_id: message_id == null ? null : String(message_id),
        content: String(content),
        created_at: Number(created_at),
      });
      return [];
    }

    if (q.includes("FROM INSIGHTS WHERE ID = ?")) {
      const id = String(params[0]);
      const row = this.insights.get(id);
      return row ? [row] : [];
    }

    if (q.includes("FROM INSIGHTS") && q.includes("WHERE ITEM_KEY = ?") && q.includes("ANNOTATION_KEY = ?") && q.includes("LIBRARY_ID = ?")) {
      const [itemKey, annotationKey, libraryID] = params.map((v) => String(v));
      return Array.from(this.insights.values())
        .filter((row) => row.item_key == itemKey && (row.annotation_key || "") == annotationKey && String(row.library_id) == libraryID)
        .sort((a, b) => b.created_at - a.created_at);
    }

    if (q.includes("FROM INSIGHTS") && q.includes("WHERE ITEM_KEY = ?") && q.includes("ANNOTATION_KEY = ?")) {
      const [itemKey, annotationKey] = params.map((v) => String(v));
      return Array.from(this.insights.values())
        .filter((row) => row.item_key == itemKey && (row.annotation_key || "") == annotationKey)
        .sort((a, b) => b.created_at - a.created_at);
    }

    if (q.includes("FROM INSIGHTS") && q.includes("WHERE ITEM_KEY = ?") && q.includes("LIBRARY_ID = ?")) {
      const [itemKey, libraryID] = params.map((v) => String(v));
      return Array.from(this.insights.values())
        .filter((row) => row.item_key == itemKey && String(row.library_id) == libraryID)
        .sort((a, b) => b.created_at - a.created_at);
    }

    if (q.includes("FROM INSIGHTS") && q.includes("WHERE ITEM_KEY = ?")) {
      const [itemKey] = params.map((v) => String(v));
      return Array.from(this.insights.values())
        .filter((row) => row.item_key == itemKey)
        .sort((a, b) => b.created_at - a.created_at);
    }

    throw new Error(`Unhandled SQL in test fake DB: ${sql}`);
  }
}

const tempProfile = fs.mkdtempSync(path.join(os.tmpdir(), "sonder-sqlite-store-"));
const addonRef = "sonder";
const addonDir = path.join(tempProfile, addonRef);
fs.mkdirSync(addonDir, { recursive: true });

const prefStore = new Map<string, unknown>();
prefStore.set("sonder.provider", "openai-api");
prefStore.set("sonder.model", "gpt-4o");

const fakeDb = new FakeSqliteConnection();

(globalThis as any).PathUtils = {
  profileDir: tempProfile,
  join: (...parts: string[]) => path.join(...parts),
};

(globalThis as any).IOUtils = {
  async makeDirectory(target: string) {
    await fs.promises.mkdir(target, { recursive: true });
  },
  async exists(target: string) {
    try {
      await fs.promises.access(target);
      return true;
    } catch {
      return false;
    }
  },
  async copy(from: string, to: string) {
    await fs.promises.copyFile(from, to);
  },
};

(globalThis as any).ChromeUtils = {
  import(modulePath: string) {
    if (modulePath == "resource://gre/modules/Sqlite.jsm") {
      return {
        Sqlite: {
          async openConnection() {
            return fakeDb;
          },
        },
      };
    }
    throw new Error(`Unsupported module import in test: ${modulePath}`);
  },
};

(globalThis as any).Zotero = {
  logError: () => {},
  getMainWindow: () => ({}),
  File: {
    async getContentsAsync(target: string) {
      return await fs.promises.readFile(target, "utf8");
    },
    async putContentsAsync(target: string, content: string) {
      await fs.promises.writeFile(target, content, "utf8");
    },
  },
  Prefs: {
    get(key: string) {
      return prefStore.get(key);
    },
    set(key: string, value: unknown) {
      prefStore.set(key, value);
    },
  },
};

const legacyData = {
  version: 1,
  contexts: {
    "paper:PAPERLEGACY": {
      id: "paper:PAPERLEGACY",
      type: "paper",
      title: "Legacy Paper",
      paperKey: "PAPERLEGACY",
      libraryID: 1,
      updatedAt: 100,
    },
  },
  sessions: {
    "session:legacy": {
      id: "session:legacy",
      contextId: "paper:PAPERLEGACY",
      title: "Session 1",
      createdAt: 90,
      updatedAt: 100,
      provider: "openai-api",
      model: "gpt-4o",
    },
  },
  messages: {
    "session:legacy": [
      {
        id: "message:legacy",
        sessionId: "session:legacy",
        role: "assistant",
        content: "Imported from JSON",
        createdAt: 100,
      },
    ],
  },
};

const legacyJsonPath = path.join(addonDir, "context-chat.json");
fs.writeFileSync(legacyJsonPath, JSON.stringify(legacyData, null, 2), "utf8");

async function main() {
  const store = new ContextChatStore();
  await store.ready();

  const imported = await store.getSessionSnapshot("session:legacy");
  assert.ok(imported, "Legacy session should be migrated into SQLite storage");
  assert.equal(imported?.messages[0]?.content, "Imported from JSON");
  assert.equal(fs.existsSync(`${legacyJsonPath}.bak`), true, "Legacy backup should be created");

  const paper = await store.getOrCreatePaperSession({
    attachmentItemID: 1,
    attachmentKey: "PAPER-NEW",
    title: "New Paper",
    libraryID: 1,
  });
  assert.equal(paper.context.id, createPaperContextId("PAPER-NEW"));

  const afterUser = await store.appendMessage(paper.session.id, "user", "question", { createdAt: 2000 });
  assert.equal(afterUser?.messages[afterUser.messages.length - 1].content, "question");

  const cleared = await store.clearSessionMessages(paper.session.id);
  assert.equal(cleared?.messages.length, 0);

  const itemPaper = await store.getOrCreateItemPaperSession({
    itemID: 2,
    itemKey: "ITEM-1",
    itemKind: "annotation",
    itemTitle: "Highlight",
    itemText: "Important sentence",
    paperAttachmentID: 1,
    paperAttachmentKey: "PAPER-NEW",
    paperTitle: "New Paper",
    libraryID: 1,
  });
  assert.equal(itemPaper.context.id, createItemPaperContextId("ITEM-1", "PAPER-NEW"));

  const byItem = await store.listSessionsByItemKey("ITEM-1");
  assert.ok(byItem.length >= 1, "Should list sessions by item key");
  assert.equal(byItem[0].contextId, createItemPaperContextId("ITEM-1", "PAPER-NEW"));

  const newSession = await store.createNewSession(itemPaper.context.id);
  assert.ok(newSession, "Should create a new session for existing context");

  const renamed = await store.renameSession(itemPaper.session.id, "Focused Session");
  assert.equal(renamed?.title, "Focused Session");
  const renamedSnapshot = await store.getSessionSnapshot(itemPaper.session.id);
  assert.equal(renamedSnapshot?.session.title, "Focused Session");

  await store.appendMessage(newSession!.session.id, "user", "to be deleted", { createdAt: 2500 });
  const doomedInsight = await store.createInsight({
    itemKey: "ITEM-1",
    libraryID: 1,
    sessionId: newSession!.session.id,
    content: "linked to deleted session",
    createdAt: 2550,
  });

  const deleted = await store.deleteSession(newSession!.session.id);
  assert.equal(deleted?.sessionId, newSession!.session.id);
  const deletedSnapshot = await store.getSessionSnapshot(newSession!.session.id);
  assert.equal(deletedSnapshot, undefined);
  assert.equal(Array.from(fakeDb.messages.values()).some((m) => m.session_id == newSession!.session.id), false);
  assert.equal(Array.from(fakeDb.insights.values()).some((i) => i.id == doomedInsight.id), false);

  const savedInsight = await store.createInsight({
    itemKey: "ITEM-1",
    libraryID: 1,
    annotationKey: "ITEM-1",
    sessionId: itemPaper.session.id,
    messageId: "message-x",
    content: "Key observation from chat.",
    createdAt: 3000,
  });
  assert.match(savedInsight.id, /^insight:/);

  const foundInsight = await store.getInsightById(savedInsight.id);
  assert.equal(foundInsight?.content, "Key observation from chat.");

  const insightsByItem = await store.listInsightsByItemKey("ITEM-1", 1);
  assert.equal(insightsByItem.length, 1);
  assert.equal(insightsByItem[0].id, savedInsight.id);

  const insightsByAnno = await store.listInsightsByItemAndAnnotation("ITEM-1", "ITEM-1", 1);
  assert.equal(insightsByAnno.length, 1);
  assert.equal(insightsByAnno[0].messageId, "message-x");

  console.log("context-chat sqlite storage tests passed");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
