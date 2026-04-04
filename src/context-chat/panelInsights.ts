import ContextChatStore from "./storage";
import { appendInsightMarkerForContext } from "./insightMarker";
import { SessionSnapshot, StoredInsight, StoredMessage } from "./types";

export interface InsightScope {
  itemKey?: string;
  libraryID?: number;
  annotationKey?: string;
}

export function getInsightScopeForContext(context: SessionSnapshot["context"]): InsightScope {
  const itemKey = context.itemKey || context.paperKey;
  return {
    itemKey,
    libraryID: context.libraryID,
    annotationKey: context.type == "item+paper" && context.itemKind == "annotation" ? context.itemKey : undefined,
  };
}

export interface InsightRefreshContext {
  store: ContextChatStore;
  getSnapshot: () => SessionSnapshot | undefined;
  getInsightRefreshSerial: () => number;
  incrementInsightRefreshSerial: () => number;
  setInsights: (insights: StoredInsight[], loading: boolean) => void;
  render: () => void;
}

export async function refreshInsightsForCurrentContext(ctx: InsightRefreshContext): Promise<void> {
  const refreshSerial = ctx.incrementInsightRefreshSerial();
  const context = ctx.getSnapshot()?.context;
  if (!context) {
    ctx.setInsights([], false);
    ctx.render();
    return;
  }

  const contextId = context.id;
  const { itemKey, libraryID } = getInsightScopeForContext(context);
  if (!itemKey) {
    ctx.setInsights([], false);
    ctx.render();
    return;
  }

  ctx.setInsights([], true);
  ctx.render();
  try {
    const insights = await ctx.store.listInsightsByItemKey(itemKey, libraryID);
    if (refreshSerial != ctx.getInsightRefreshSerial() || ctx.getSnapshot()?.context.id != contextId) {
      return;
    }
    ctx.setInsights(insights, false);
  } catch (error: any) {
    Zotero.logError(error);
    if (refreshSerial != ctx.getInsightRefreshSerial() || ctx.getSnapshot()?.context.id != contextId) {
      return;
    }
    ctx.setInsights([], false);
  } finally {
    if (refreshSerial != ctx.getInsightRefreshSerial() || ctx.getSnapshot()?.context.id != contextId) {
      return;
    }
    ctx.render();
  }
}

export interface InsightSaveContext {
  store: ContextChatStore;
  ownerWindow: Window;
  getSnapshot: () => SessionSnapshot | undefined;
  getSavedInsightId: (messageId: string) => string | undefined;
  setSavedInsightId: (messageId: string, insightId: string) => void;
  refreshInsights: () => Promise<void>;
  render: () => void;
}

export async function saveInsightFromMessage(
  ctx: InsightSaveContext,
  message: StoredMessage,
  button: HTMLButtonElement,
): Promise<void> {
  const snapshot = ctx.getSnapshot();
  if (!snapshot) {
    return;
  }

  const existingInsightId = ctx.getSavedInsightId(message.id);
  if (existingInsightId) {
    ctx.ownerWindow.alert(`Already saved as ${existingInsightId}`);
    return;
  }

  const context = snapshot.context;
  const { itemKey, libraryID, annotationKey } = getInsightScopeForContext(context);
  if (!itemKey) {
    ctx.ownerWindow.alert("Unable to save insight: no item context is available.");
    return;
  }

  try {
    const insight = await ctx.store.createInsight({
      itemKey,
      libraryID,
      annotationKey,
      sessionId: snapshot.session.id,
      messageId: message.id,
      content: message.content,
    });

    let markerWriteFailed = false;
    try {
      await appendInsightMarkerForContext(context, insight.id);
    } catch (markerError: any) {
      markerWriteFailed = true;
      Zotero.logError(markerError);
    }

    ctx.setSavedInsightId(message.id, insight.id);
    const currentSnapshot = ctx.getSnapshot();
    const isSameSessionContext = Boolean(
      currentSnapshot
      && currentSnapshot.session.id == snapshot.session.id
      && currentSnapshot.context.id == context.id,
    );
    if (!isSameSessionContext) {
      return;
    }

    const previous = button.textContent;
    button.textContent = "✓";
    ctx.ownerWindow.setTimeout(() => {
      button.textContent = previous;
    }, 1200);
    await ctx.refreshInsights();
    ctx.render();

    if (markerWriteFailed) {
      ctx.ownerWindow.alert(`Insight saved as ${insight.id}, but failed to write Zotero marker.`);
    }
  } catch (error: any) {
    Zotero.logError(error);
    ctx.ownerWindow.alert(String(error?.message || error || "Failed to save insight."));
  }
}
