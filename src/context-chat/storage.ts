import { config } from "../../package.json";
import { getCurrentModel, getProvider } from "../modules/provider";
import {
  Citation,
  ContextChatStoreData,
  PaperContextDescriptor,
  SessionSnapshot,
  StoredContext,
  StoredMessage,
  StoredSession,
  createEmptyStoreData,
  createMessageId,
  createPaperContextId,
  createSessionId,
  createSessionTitle,
  getLatestSession,
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

export class ContextChatStore {
  private filePath = "";
  private cache: ContextChatStoreData = createEmptyStoreData();
  private readonly readyPromise: Promise<void>;

  constructor() {
    this.readyPromise = this.initialize();
  }

  public async ready() {
    await this.readyPromise;
  }

  private getOS() {
    return (Zotero.getMainWindow() as any).OS;
  }

  private async initialize() {
    try {
      const OS = this.getOS();
      const baseDir = OS.Path.join(PathUtils.profileDir, config.addonRef);
      this.filePath = OS.Path.join(baseDir, "context-chat.json");
      await OS.File.makeDir(baseDir, { ignoreExisting: true });
      if (!(await OS.File.exists(this.filePath))) {
        this.cache = createEmptyStoreData();
        return;
      }
      const raw = await Zotero.File.getContentsAsync(this.filePath) as string;
      this.cache = normalizeStoreData(JSON.parse(raw || "{}"));
    } catch (error: any) {
      this.cache = createEmptyStoreData();
      Zotero.logError(error);
    }
  }

  private async persist() {
    if (!this.filePath) {
      return;
    }
    try {
      const OS = this.getOS();
      await OS.File.writeAtomic(
        this.filePath,
        JSON.stringify(this.cache, null, 2),
        { tmpPath: `${this.filePath}.tmp` }
      );
    } catch (error: any) {
      Zotero.logError(error);
    }
  }

  private getSessionsForContext(contextId: string) {
    return sortSessionsByUpdatedAt(
      Object.keys(this.cache.sessions)
        .map((sessionId) => this.cache.sessions[sessionId])
        .filter((session) => session.contextId == contextId)
    );
  }

  private buildSnapshot(context: StoredContext, session: StoredSession): SessionSnapshot {
    return {
      context,
      session,
      sessions: this.getSessionsForContext(context.id),
      messages: [...(this.cache.messages[session.id] || [])],
    };
  }

  private createSession(context: StoredContext, existingSessions: StoredSession[], now: number) {
    const provider = getProvider();
    const session: StoredSession = {
      id: createSessionId(now),
      contextId: context.id,
      title: createSessionTitle(getNextSessionIndex(existingSessions)),
      createdAt: now,
      updatedAt: now,
      provider,
      model: getCurrentModel(provider),
    };
    this.cache.sessions[session.id] = session;
    this.cache.messages[session.id] ||= [];
    return session;
  }

  private touchSession(
    context: StoredContext,
    session: StoredSession,
    now: number,
    options: { provider?: string; model?: string } = {}
  ) {
    context.updatedAt = now;
    session.updatedAt = now;
    if (options.provider) {
      session.provider = options.provider;
    }
    if (options.model) {
      session.model = options.model;
    }
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
      updatedAt: now,
    };
    this.cache.contexts[contextId] = {
      ...(this.cache.contexts[contextId] || context),
      ...context,
    };

    const sessions = this.getSessionsForContext(contextId);
    const latestSession = getLatestSession(sessions);
    const session = latestSession || this.createSession(this.cache.contexts[contextId], sessions, now);
    this.touchSession(this.cache.contexts[contextId], session, now);
    this.cache.sessions[session.id] = session;
    await this.persist();
    return this.buildSnapshot(this.cache.contexts[contextId], session);
  }

  public async createNewSession(contextId: string): Promise<SessionSnapshot | undefined> {
    await this.ready();
    const context = this.cache.contexts[contextId];
    if (!context) {
      return undefined;
    }
    const now = Date.now();
    const sessions = this.getSessionsForContext(contextId);
    const session = this.createSession(context, sessions, now);
    this.touchSession(context, session, now);
    await this.persist();
    return this.buildSnapshot(context, session);
  }

  public async getSessionSnapshot(sessionId: string): Promise<SessionSnapshot | undefined> {
    await this.ready();
    const session = this.cache.sessions[sessionId];
    if (!session) {
      return undefined;
    }
    const context = this.cache.contexts[session.contextId];
    if (!context) {
      return undefined;
    }
    return this.buildSnapshot(context, session);
  }

  public async appendMessage(
    sessionId: string,
    role: StoredMessage["role"],
    content: string,
    options: { citations?: Citation[]; provider?: string; model?: string; createdAt?: number } = {}
  ): Promise<SessionSnapshot | undefined> {
    await this.ready();
    const session = this.cache.sessions[sessionId];
    if (!session) {
      return undefined;
    }
    const context = this.cache.contexts[session.contextId];
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
    this.cache.messages[sessionId] ||= [];
    this.cache.messages[sessionId].push(message);
    this.touchSession(context, session, now, options);
    await this.persist();
    return this.buildSnapshot(context, session);
  }

  public async listSessions(contextId: string) {
    await this.ready();
    return this.getSessionsForContext(contextId);
  }
}

export default ContextChatStore;
