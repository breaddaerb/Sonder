export type ContextType = "paper" | "item+paper";

export interface Citation {
  id: string;
  label: string;
  sourceType: "paper" | "item";
  target?: string;
  page?: number;
  /** Y-coordinate for fine-grained scroll position within the page (PDF coordinate system). */
  yOffset?: number;
  /** Y-coordinate of the bottom edge of the cited chunk region (PDF coordinate system). */
  yOffsetBottom?: number;
  preview?: string;
}

export interface StoredContext {
  id: string;
  type: ContextType;
  title: string;
  paperKey?: string;
  itemKey?: string;
  libraryID?: number;
  itemText?: string;
  itemKind?: "annotation" | "note";
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
  libraryID?: number;
  title: string;
}

export interface ItemPaperContextDescriptor {
  itemID: number;
  itemKey: string;
  itemKind: "annotation" | "note";
  itemTitle: string;
  itemText: string;
  paperAttachmentID: number;
  paperAttachmentKey: string;
  paperParentID?: number;
  paperTitle: string;
  libraryID?: number;
}

export interface SessionSnapshot {
  context: StoredContext;
  session: StoredSession;
  sessions: StoredSession[];
  messages: StoredMessage[];
}

export interface StoredInsight {
  id: string;
  itemKey: string;
  libraryID?: number;
  annotationKey?: string;
  sessionId: string;
  messageId?: string;
  content: string;
  createdAt: number;
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

export function createItemPaperContextId(itemKey: string, paperKey: string) {
  return `itempaper:${itemKey}:${paperKey}`;
}

export function createSessionId(now: number = Date.now(), randomValue: number = Math.random()) {
  return `session:${now}:${Math.floor(randomValue * 1e8).toString(36)}`;
}

export function createMessageId(now: number = Date.now(), randomValue: number = Math.random()) {
  return `message:${now}:${Math.floor(randomValue * 1e8).toString(36)}`;
}

export function createInsightId(now: number = Date.now(), randomValue: number = Math.random()) {
  return `insight:${now}:${Math.floor(randomValue * 1e8).toString(36)}`;
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
