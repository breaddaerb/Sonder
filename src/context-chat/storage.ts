import { config } from "../../package.json";
import { getCurrentModel, getProvider } from "../modules/provider";
import {
  Citation,
  ContextChatStoreData,
  ItemPaperContextDescriptor,
  PaperContextDescriptor,
  SessionSnapshot,
  StoredContext,
  StoredMessage,
  StoredSession,
  createEmptyStoreData,
  createItemPaperContextId,
  createMessageId,
  createPaperContextId,
  createSessionId,
  createSessionTitle,
  getNextSessionIndex,
  sortSessionsByUpdatedAt,
} from "./types";

function normalizeStoreData(value: any): ContextChatStoreData {
  return {
    version: 1,
    contexts: value?.contexts && typeof value.contexts == "object" ? value.contexts : {},
    sessions: value?.sessions && typeof value.sessions == "object" ? value.sessions : {},
    messages: value?.messages && typeof value.messages == "object" ? value.messages : {},
  };
}

type SqliteConnection = {
  execute: (sql: string, params?: any[] | Record<string, any>) => Promise<any[]>;
  executeTransaction: (handler: () => Promise<void>) => Promise<void>;
  close?: () => Promise<void>;
};

export class ContextChatStore {
  private dbPath = "";
  private legacyJsonPath = "";
  private db?: SqliteConnection;
  private readonly readyPromise: Promise<void>;

  constructor() {
    this.readyPromise = this.initialize();
  }

  public async ready() {
    await this.readyPromise;
  }

  private getSqliteModule() {
    try {
      const imported = (globalThis as any).ChromeUtils?.import?.("resource://gre/modules/Sqlite.jsm");
      if (imported?.Sqlite?.openConnection) {
        return imported.Sqlite;
      }
    } catch {
      // fall through
    }
    throw new Error("Sqlite.jsm is unavailable in current Zotero runtime.");
  }

  private getRowValue<T>(row: any, columnName: string): T {
    if (row && typeof row.getResultByName == "function") {
      return row.getResultByName(columnName) as T;
    }
    return row?.[columnName] as T;
  }

  private async ensureDir(path: string) {
    const IOUtils = (globalThis as any).IOUtils;
    if (IOUtils?.makeDirectory) {
      await IOUtils.makeDirectory(path, { createAncestors: true, ignoreExisting: true });
      return;
    }
    const mainWindow = Zotero.getMainWindow() as any;
    const OS = mainWindow?.OS || (globalThis as any).OS || (globalThis as any).ChromeUtils?.import?.("resource://gre/modules/osfile.jsm")?.OS;
    if (OS?.File?.makeDir) {
      await OS.File.makeDir(path, { ignoreExisting: true });
      return;
    }
    throw new Error("No directory API available for context chat storage.");
  }

  private async fileExists(path: string) {
    const IOUtils = (globalThis as any).IOUtils;
    if (IOUtils?.exists) {
      return await IOUtils.exists(path);
    }
    const mainWindow = Zotero.getMainWindow() as any;
    const OS = mainWindow?.OS || (globalThis as any).OS || (globalThis as any).ChromeUtils?.import?.("resource://gre/modules/osfile.jsm")?.OS;
    if (OS?.File?.exists) {
      return await OS.File.exists(path);
    }
    return false;
  }

  private async backupLegacyJsonIfNeeded() {
    if (!(await this.fileExists(this.legacyJsonPath))) {
      return;
    }
    const backupPath = `${this.legacyJsonPath}.bak`;
    if (await this.fileExists(backupPath)) {
      return;
    }

    const IOUtils = (globalThis as any).IOUtils;
    if (IOUtils?.copy) {
      await IOUtils.copy(this.legacyJsonPath, backupPath);
      return;
    }

    const mainWindow = Zotero.getMainWindow() as any;
    const OS = mainWindow?.OS || (globalThis as any).OS || (globalThis as any).ChromeUtils?.import?.("resource://gre/modules/osfile.jsm")?.OS;
    if (OS?.File?.copy) {
      await OS.File.copy(this.legacyJsonPath, backupPath);
      return;
    }

    throw new Error("No file copy API available for backing up legacy context-chat.json.");
  }

  private async initializeSchema() {
    const db = this.ensureDb();
    await db.execute("PRAGMA journal_mode = WAL");
    await db.execute("PRAGMA foreign_keys = ON");

    await db.execute(`
      CREATE TABLE IF NOT EXISTS contexts (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        title TEXT NOT NULL,
        paper_key TEXT,
        item_key TEXT,
        library_id INTEGER,
        item_text TEXT,
        item_kind TEXT,
        updated_at INTEGER NOT NULL
      )
    `);

    await db.execute(`
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        context_id TEXT NOT NULL,
        title TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        provider TEXT,
        model TEXT,
        item_key TEXT,
        paper_key TEXT,
        FOREIGN KEY(context_id) REFERENCES contexts(id) ON DELETE CASCADE
      )
    `);

    await db.execute(`
      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        citations_json TEXT,
        FOREIGN KEY(session_id) REFERENCES sessions(id) ON DELETE CASCADE
      )
    `);

    await db.execute("CREATE INDEX IF NOT EXISTS idx_sessions_context_updated ON sessions(context_id, updated_at DESC)");
    await db.execute("CREATE INDEX IF NOT EXISTS idx_sessions_item_updated ON sessions(item_key, updated_at DESC)");
    await db.execute("CREATE INDEX IF NOT EXISTS idx_messages_session_created ON messages(session_id, created_at ASC)");
  }

  private ensureDb() {
    if (!this.db) {
      throw new Error("Context chat SQLite database is not initialized.");
    }
    return this.db;
  }

  private async isDatabaseEmpty() {
    const db = this.ensureDb();
    const rows = await db.execute("SELECT COUNT(*) AS count FROM sessions");
    const count = Number(this.getRowValue(rows[0], "count") || 0);
    return count == 0;
  }

  private async migrateLegacyJsonIfNeeded() {
    const dbEmpty = await this.isDatabaseEmpty();
    if (!dbEmpty || !(await this.fileExists(this.legacyJsonPath))) {
      return;
    }

    try {
      const raw = await Zotero.File.getContentsAsync(this.legacyJsonPath) as string;
      const data = normalizeStoreData(JSON.parse(raw || "{}"));
      const db = this.ensureDb();

      await db.executeTransaction(async () => {
        for (const context of Object.values(data.contexts)) {
          await db.execute(
            `INSERT OR REPLACE INTO contexts (
              id, type, title, paper_key, item_key, library_id, item_text, item_kind, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              context.id,
              context.type,
              context.title,
              context.paperKey || null,
              context.itemKey || null,
              context.libraryID ?? null,
              context.itemText || null,
              context.itemKind || null,
              context.updatedAt,
            ],
          );
        }

        for (const session of Object.values(data.sessions)) {
          const context = data.contexts[session.contextId];
          await db.execute(
            `INSERT OR REPLACE INTO sessions (
              id, context_id, title, created_at, updated_at, provider, model, item_key, paper_key
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              session.id,
              session.contextId,
              session.title,
              session.createdAt,
              session.updatedAt,
              session.provider || null,
              session.model || null,
              context?.itemKey || null,
              context?.paperKey || null,
            ],
          );
        }

        for (const [sessionId, messages] of Object.entries(data.messages)) {
          for (const message of messages) {
            await db.execute(
              `INSERT OR REPLACE INTO messages (
                id, session_id, role, content, created_at, citations_json
              ) VALUES (?, ?, ?, ?, ?, ?)`,
              [
                message.id,
                sessionId,
                message.role,
                message.content,
                message.createdAt,
                message.citations?.length ? JSON.stringify(message.citations) : null,
              ],
            );
          }
        }
      });

      await this.backupLegacyJsonIfNeeded();
    } catch (error: any) {
      Zotero.logError(error);
    }
  }

  private async initialize() {
    try {
      const baseDir = PathUtils.join(PathUtils.profileDir, config.addonRef);
      await this.ensureDir(baseDir);

      this.dbPath = PathUtils.join(baseDir, "context-chat.sqlite");
      this.legacyJsonPath = PathUtils.join(baseDir, "context-chat.json");

      const Sqlite = this.getSqliteModule();
      this.db = await Sqlite.openConnection({ path: this.dbPath });

      await this.initializeSchema();
      await this.migrateLegacyJsonIfNeeded();
    } catch (error: any) {
      Zotero.logError(error);
      const message = error?.message || String(error) || "Unknown SQLite initialization error";
      throw new Error(`Failed to initialize context chat SQLite storage: ${message}`);
    }
  }

  private async upsertContext(context: StoredContext) {
    const db = this.ensureDb();
    await db.execute(
      `INSERT INTO contexts (
        id, type, title, paper_key, item_key, library_id, item_text, item_kind, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        type = excluded.type,
        title = excluded.title,
        paper_key = excluded.paper_key,
        item_key = excluded.item_key,
        library_id = excluded.library_id,
        item_text = excluded.item_text,
        item_kind = excluded.item_kind,
        updated_at = excluded.updated_at`,
      [
        context.id,
        context.type,
        context.title,
        context.paperKey || null,
        context.itemKey || null,
        context.libraryID ?? null,
        context.itemText || null,
        context.itemKind || null,
        context.updatedAt,
      ],
    );
  }

  private async getContextById(contextId: string): Promise<StoredContext | undefined> {
    const db = this.ensureDb();
    const rows = await db.execute(
      `SELECT id, type, title, paper_key, item_key, library_id, item_text, item_kind, updated_at
       FROM contexts WHERE id = ? LIMIT 1`,
      [contextId],
    );
    if (!rows.length) {
      return undefined;
    }
    return this.rowToContext(rows[0]);
  }

  private rowToContext(row: any): StoredContext {
    const type = this.getRowValue<string>(row, "type") == "item+paper" ? "item+paper" : "paper";
    const itemKindRaw = this.getRowValue<string | null>(row, "item_kind");
    return {
      id: this.getRowValue<string>(row, "id"),
      type,
      title: this.getRowValue<string>(row, "title"),
      paperKey: this.getRowValue<string | null>(row, "paper_key") || undefined,
      itemKey: this.getRowValue<string | null>(row, "item_key") || undefined,
      libraryID: this.getRowValue<number | null>(row, "library_id") ?? undefined,
      itemText: this.getRowValue<string | null>(row, "item_text") || undefined,
      itemKind: itemKindRaw == "note" || itemKindRaw == "annotation" ? itemKindRaw : undefined,
      updatedAt: Number(this.getRowValue<number>(row, "updated_at")),
    };
  }

  private rowToSession(row: any): StoredSession {
    return {
      id: this.getRowValue<string>(row, "id"),
      contextId: this.getRowValue<string>(row, "context_id"),
      title: this.getRowValue<string>(row, "title"),
      createdAt: Number(this.getRowValue<number>(row, "created_at")),
      updatedAt: Number(this.getRowValue<number>(row, "updated_at")),
      provider: this.getRowValue<string | null>(row, "provider") || undefined,
      model: this.getRowValue<string | null>(row, "model") || undefined,
    };
  }

  private rowToMessage(row: any): StoredMessage {
    const rawCitations = this.getRowValue<string | null>(row, "citations_json");
    let citations: Citation[] | undefined;
    if (rawCitations) {
      try {
        citations = JSON.parse(rawCitations) as Citation[];
      } catch {
        citations = undefined;
      }
    }

    return {
      id: this.getRowValue<string>(row, "id"),
      sessionId: this.getRowValue<string>(row, "session_id"),
      role: this.getRowValue<StoredMessage["role"]>(row, "role"),
      content: this.getRowValue<string>(row, "content"),
      createdAt: Number(this.getRowValue<number>(row, "created_at")),
      citations,
    };
  }

  private async getSessionsForContext(contextId: string): Promise<StoredSession[]> {
    const db = this.ensureDb();
    const rows = await db.execute(
      `SELECT id, context_id, title, created_at, updated_at, provider, model
       FROM sessions
       WHERE context_id = ?
       ORDER BY updated_at DESC, created_at DESC`,
      [contextId],
    );
    return rows.map((row) => this.rowToSession(row));
  }

  private async getMessagesForSession(sessionId: string): Promise<StoredMessage[]> {
    const db = this.ensureDb();
    const rows = await db.execute(
      `SELECT id, session_id, role, content, created_at, citations_json
       FROM messages
       WHERE session_id = ?
       ORDER BY created_at ASC`,
      [sessionId],
    );
    return rows.map((row) => this.rowToMessage(row));
  }

  private async buildSnapshot(context: StoredContext, session: StoredSession): Promise<SessionSnapshot> {
    return {
      context,
      session,
      sessions: await this.getSessionsForContext(context.id),
      messages: await this.getMessagesForSession(session.id),
    };
  }

  private async createSession(context: StoredContext, now: number): Promise<StoredSession> {
    const db = this.ensureDb();
    const provider = getProvider();
    const model = getCurrentModel(provider);

    const countRows = await db.execute(
      `SELECT COUNT(*) AS count FROM sessions WHERE context_id = ?`,
      [context.id],
    );
    const count = Number(this.getRowValue<number>(countRows[0], "count") || 0);

    const session: StoredSession = {
      id: createSessionId(now),
      contextId: context.id,
      title: createSessionTitle(getNextSessionIndex(Array.from({ length: count }, (_, i) => ({ id: String(i) })))),
      createdAt: now,
      updatedAt: now,
      provider,
      model,
    };

    await db.execute(
      `INSERT INTO sessions (
        id, context_id, title, created_at, updated_at, provider, model, item_key, paper_key
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        session.id,
        session.contextId,
        session.title,
        session.createdAt,
        session.updatedAt,
        session.provider || null,
        session.model || null,
        context.itemKey || null,
        context.paperKey || null,
      ],
    );

    return session;
  }

  private async touchSession(
    context: StoredContext,
    session: StoredSession,
    now: number,
    options: { provider?: string; model?: string } = {},
  ) {
    const db = this.ensureDb();
    await db.execute(
      `UPDATE contexts SET updated_at = ?, title = ?, paper_key = ?, item_key = ?, library_id = ?, item_text = ?, item_kind = ?
       WHERE id = ?`,
      [
        now,
        context.title,
        context.paperKey || null,
        context.itemKey || null,
        context.libraryID ?? null,
        context.itemText || null,
        context.itemKind || null,
        context.id,
      ],
    );

    session.updatedAt = now;
    if (options.provider) {
      session.provider = options.provider;
    }
    if (options.model) {
      session.model = options.model;
    }

    await db.execute(
      `UPDATE sessions
       SET updated_at = ?, provider = ?, model = ?
       WHERE id = ?`,
      [
        session.updatedAt,
        session.provider || null,
        session.model || null,
        session.id,
      ],
    );

    context.updatedAt = now;
  }

  private async getLatestSession(contextId: string): Promise<StoredSession | undefined> {
    const db = this.ensureDb();
    const rows = await db.execute(
      `SELECT id, context_id, title, created_at, updated_at, provider, model
       FROM sessions WHERE context_id = ?
       ORDER BY updated_at DESC, created_at DESC
       LIMIT 1`,
      [contextId],
    );
    if (!rows.length) {
      return undefined;
    }
    return this.rowToSession(rows[0]);
  }

  public async getOrCreatePaperSession(descriptor: PaperContextDescriptor): Promise<SessionSnapshot> {
    await this.ready();
    const now = Date.now();
    const contextId = createPaperContextId(descriptor.attachmentKey);
    const context: StoredContext = {
      id: contextId,
      type: "paper",
      title: descriptor.title,
      paperKey: descriptor.attachmentKey,
      libraryID: descriptor.libraryID,
      updatedAt: now,
    };

    const db = this.ensureDb();
    await db.executeTransaction(async () => {
      await this.upsertContext(context);
      const latestSession = await this.getLatestSession(contextId);
      const session = latestSession || await this.createSession(context, now);
      await this.touchSession(context, session, now);
    });

    const refreshedContext = await this.getContextById(contextId);
    const session = await this.getLatestSession(contextId);
    if (!refreshedContext || !session) {
      throw new Error("Failed to load paper session after create/update.");
    }
    return await this.buildSnapshot(refreshedContext, session);
  }

  public async getOrCreateItemPaperSession(descriptor: ItemPaperContextDescriptor): Promise<SessionSnapshot> {
    await this.ready();
    const now = Date.now();
    const contextId = createItemPaperContextId(descriptor.itemKey, descriptor.paperAttachmentKey);
    const context: StoredContext = {
      id: contextId,
      type: "item+paper",
      title: descriptor.paperTitle,
      paperKey: descriptor.paperAttachmentKey,
      itemKey: descriptor.itemKey,
      itemText: descriptor.itemText,
      itemKind: descriptor.itemKind,
      libraryID: descriptor.libraryID,
      updatedAt: now,
    };

    const db = this.ensureDb();
    await db.executeTransaction(async () => {
      await this.upsertContext(context);
      const latestSession = await this.getLatestSession(contextId);
      const session = latestSession || await this.createSession(context, now);
      await this.touchSession(context, session, now);
    });

    const refreshedContext = await this.getContextById(contextId);
    const session = await this.getLatestSession(contextId);
    if (!refreshedContext || !session) {
      throw new Error("Failed to load item+paper session after create/update.");
    }
    return await this.buildSnapshot(refreshedContext, session);
  }

  public async createNewSession(contextId: string): Promise<SessionSnapshot | undefined> {
    await this.ready();
    const context = await this.getContextById(contextId);
    if (!context) {
      return undefined;
    }

    const now = Date.now();
    let session: StoredSession | undefined;
    const db = this.ensureDb();
    await db.executeTransaction(async () => {
      session = await this.createSession(context, now);
      await this.touchSession(context, session, now);
    });

    if (!session) {
      return undefined;
    }
    return await this.buildSnapshot(context, session);
  }

  public async getSessionSnapshot(sessionId: string): Promise<SessionSnapshot | undefined> {
    await this.ready();
    const db = this.ensureDb();
    const rows = await db.execute(
      `SELECT id, context_id, title, created_at, updated_at, provider, model
       FROM sessions WHERE id = ? LIMIT 1`,
      [sessionId],
    );
    if (!rows.length) {
      return undefined;
    }

    const session = this.rowToSession(rows[0]);
    const context = await this.getContextById(session.contextId);
    if (!context) {
      return undefined;
    }

    return await this.buildSnapshot(context, session);
  }

  public async appendMessage(
    sessionId: string,
    role: StoredMessage["role"],
    content: string,
    options: { citations?: Citation[]; provider?: string; model?: string; createdAt?: number } = {},
  ): Promise<SessionSnapshot | undefined> {
    await this.ready();
    const db = this.ensureDb();
    const sessionRows = await db.execute(
      `SELECT id, context_id, title, created_at, updated_at, provider, model
       FROM sessions WHERE id = ? LIMIT 1`,
      [sessionId],
    );
    if (!sessionRows.length) {
      return undefined;
    }

    const session = this.rowToSession(sessionRows[0]);
    const context = await this.getContextById(session.contextId);
    if (!context) {
      return undefined;
    }

    const now = options.createdAt || Date.now();
    const message: StoredMessage = {
      id: createMessageId(now),
      sessionId,
      role,
      content,
      createdAt: now,
      citations: options.citations,
    };

    await db.executeTransaction(async () => {
      await db.execute(
        `INSERT INTO messages (id, session_id, role, content, created_at, citations_json)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          message.id,
          message.sessionId,
          message.role,
          message.content,
          message.createdAt,
          message.citations?.length ? JSON.stringify(message.citations) : null,
        ],
      );
      await this.touchSession(context, session, now, options);
    });

    return await this.buildSnapshot(context, session);
  }

  public async clearSessionMessages(sessionId: string): Promise<SessionSnapshot | undefined> {
    await this.ready();
    const db = this.ensureDb();
    const rows = await db.execute(
      `SELECT id, context_id, title, created_at, updated_at, provider, model
       FROM sessions WHERE id = ? LIMIT 1`,
      [sessionId],
    );
    if (!rows.length) {
      return undefined;
    }

    const session = this.rowToSession(rows[0]);
    const context = await this.getContextById(session.contextId);
    if (!context) {
      return undefined;
    }

    const now = Date.now();
    await db.executeTransaction(async () => {
      await db.execute("DELETE FROM messages WHERE session_id = ?", [sessionId]);
      await this.touchSession(context, session, now);
    });

    return await this.buildSnapshot(context, session);
  }

  public async listSessions(contextId: string) {
    await this.ready();
    return sortSessionsByUpdatedAt(await this.getSessionsForContext(contextId));
  }

  public async listSessionsByItemKey(itemKey: string): Promise<StoredSession[]> {
    await this.ready();
    const db = this.ensureDb();
    const rows = await db.execute(
      `SELECT id, context_id, title, created_at, updated_at, provider, model
       FROM sessions
       WHERE item_key = ?
       ORDER BY updated_at DESC, created_at DESC`,
      [itemKey],
    );
    return rows.map((row) => this.rowToSession(row));
  }
}

export default ContextChatStore;
