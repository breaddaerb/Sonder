export type ContextType = "paper" | "item+paper";

export interface Citation {
  id: string;
  label: string;
  sourceType: "paper" | "item";
  target?: string;
}

export interface StoredContext {
  id: string;
  type: ContextType;
  title: string;
  paperKey?: string;
  itemKey?: string;
  updatedAt: number;
}

export interface StoredSession {
  id: string;
  contextId: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  provider?: string;
  model?: string;
}

export interface StoredMessage {
  id: string;
  sessionId: string;
  role: "system" | "user" | "assistant";
  content: string;
  createdAt: number;
  citations?: Citation[];
}

export interface ContextChatStoreData {
  version: 1;
  contexts: Record<string, StoredContext>;
  sessions: Record<string, StoredSession>;
  messages: Record<string, StoredMessage[]>;
}

export interface PaperContextDescriptor {
  attachmentItemID: number;
  attachmentKey: string;
  parentItemID?: number;
  title: string;
}

export interface SessionSnapshot {
  context: StoredContext;
  session: StoredSession;
  sessions: StoredSession[];
  messages: StoredMessage[];
}

export function createEmptyStoreData(): ContextChatStoreData {
  return {
    version: 1,
    contexts: {},
    sessions: {},
    messages: {},
  };
}

export function createPaperContextId(paperKey: string) {
  return `paper:${paperKey}`;
}

export function createSessionId(now: number = Date.now(), randomValue: number = Math.random()) {
  return `session:${now}:${Math.floor(randomValue * 1e8).toString(36)}`;
}

export function createMessageId(now: number = Date.now(), randomValue: number = Math.random()) {
  return `message:${now}:${Math.floor(randomValue * 1e8).toString(36)}`;
}

export function createSessionTitle(index: number) {
  return `Session ${index}`;
}

export function sortSessionsByUpdatedAt<T extends { updatedAt: number; createdAt: number }>(sessions: T[]) {
  return [...sessions].sort((a, b) => b.updatedAt - a.updatedAt || b.createdAt - a.createdAt);
}

export function getLatestSession<T extends { updatedAt: number; createdAt: number }>(sessions: T[]) {
  return sortSessionsByUpdatedAt(sessions)[0];
}

export function getNextSessionIndex(sessions: { id: string }[]) {
  return sessions.length + 1;
}
