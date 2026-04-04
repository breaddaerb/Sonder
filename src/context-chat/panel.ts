import ContextChatService, { PaperContextStatus } from "./chatService";
import { canSendDraft } from "./chatMessages";
import { resolveSelectedItemPaperContextWithSource } from "./itemPaperContext";
import { resolveCurrentPaperContext } from "./paperContext";
import { getCodexLoginReport } from "../modules/Meet/CodexOAuth";
import { getCurrentModel, getProvider, hasCodexCredentials, hasCustomApiConfig, getCustomApiStatusLabel } from "../modules/provider";
import ContextChatStore from "./storage";
import { PageRange, SessionSnapshot, StoredInsight, StoredMessage } from "./types";
import { PANEL_CSS } from "./panelCSS";
import { handleCodexAuth, handleCodexModelConfig, handleCustomApiConfig } from "./panelProviderDialogs";
import { refreshInsightsForCurrentContext, saveInsightFromMessage } from "./panelInsights";
import { renderHistoryDrawer } from "./panelHistory";
import { renderMessageList } from "./panelMessages";

const HTML_NS = "http://www.w3.org/1999/xhtml";

function createHTML<K extends keyof HTMLElementTagNameMap>(doc: Document, tagName: K) {
  return doc.createElementNS(HTML_NS, tagName) as HTMLElementTagNameMap[K];
}

function formatTimestamp(timestamp: number) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(timestamp));
}

function parsePageRangeInput(input: string): PageRange | undefined {
  const match = input.match(/^(\d+)\s*[-–]\s*(\d+)$/);
  if (!match) {
    return undefined;
  }
  const startPage = Number(match[1]);
  const endPage = Number(match[2]);
  if (startPage < 1 || endPage < startPage) {
    return undefined;
  }
  return { startPage, endPage };
}

const PANEL_WIDTH_STORAGE_KEY = "sonder.contextChat.panelWidth";

export class ContextChatPanel {
  private insightRefreshSerial = 0;

  private readonly onCopyShortcut = (event: KeyboardEvent) => {
    const isCopyKey = (event.metaKey || event.ctrlKey) && !event.shiftKey && event.key.toLowerCase() == "c";
    if (!isCopyKey) {
      return;
    }
    const selection = this.ownerWindow.getSelection();
    const selectedText = selection?.toString() || "";
    if (!selectedText.trim()) {
      return;
    }
    const anchor = selection?.anchorNode;
    if (!anchor || !this.panel?.contains(anchor)) {
      return;
    }
    event.preventDefault();
    void this.copySelectedText(selectedText);
  };
  private panel!: HTMLDivElement;
  private resizeHandle!: HTMLDivElement;
  private badge!: HTMLSpanElement;
  private title!: HTMLDivElement;
  private sessionTitle!: HTMLDivElement;
  private status!: HTMLSpanElement;
  private historyButton!: HTMLButtonElement;
  private newSessionButton!: HTMLButtonElement;
  private clearSessionButton!: HTMLButtonElement;
  private codexAuthButton!: HTMLButtonElement;
  private codexModelButton!: HTMLButtonElement;
  private customApiButton!: HTMLButtonElement;
  private pageRangeButton!: HTMLButtonElement;
  private closeButton!: HTMLButtonElement;
  private historyDrawer!: HTMLDivElement;
  private messageList!: HTMLDivElement;
  private composerHint!: HTMLDivElement;
  private composerInput!: HTMLTextAreaElement;
  private composerNote!: HTMLDivElement;
  private sendButton!: HTMLButtonElement;

  private state: {
    visible: boolean;
    loading: boolean;
    loadingPhase?: "opening" | "sending";
    paperStatus: PaperContextStatus;
    paperError?: string;
    historyOpen: boolean;
    viewMode: "raw" | "preview";
    draft: string;
    assistantPreviewText: string;
    snapshot?: SessionSnapshot;
    error?: string;
    panelWidth?: number;
    pageRange?: PageRange;
    savedInsightsByMessage: Record<string, string>;
    insights: StoredInsight[];
    insightsLoading: boolean;
    historySearch: string;
    renamingSessionId?: string;
    renamingSessionDraft: string;
  } = {
    visible: false,
    loading: false,
    paperStatus: "idle",
    historyOpen: false,
    viewMode: "raw",
    draft: "",
    assistantPreviewText: "",
    savedInsightsByMessage: {},
    insights: [],
    insightsLoading: false,
    historySearch: "",
    renamingSessionDraft: "",
  };

  constructor(
    private readonly ownerWindow: Window,
    private readonly store: ContextChatStore,
    private readonly chatService: ContextChatService,
  ) {
    this.state.panelWidth = this.loadSavedPanelWidth();
  }

  public install() {
    const doc = this.ownerWindow.document;
    if (!doc.getElementById("sonder-context-chat-style")) {
      this.installStyle();
    }
    if (doc.getElementById("sonder-context-chat-panel")) {
      return;
    }
    this.buildPanel();
    this.ownerWindow.addEventListener("keydown", this.onCopyShortcut, true);
    this.render();
  }

  public open() {
    void this.openCurrentContext();
  }

  public destroy() {
    this.ownerWindow.removeEventListener("keydown", this.onCopyShortcut, true);
    this.panel?.remove();
    this.ownerWindow.document.getElementById("sonder-context-chat-style")?.remove();
  }

  private installStyle() {
    const style = createHTML(this.ownerWindow.document, "style");
    style.id = "sonder-context-chat-style";
    style.textContent = PANEL_CSS;
    this.ownerWindow.document.documentElement.appendChild(style);
  }

  private buildPanel() {
    const doc = this.ownerWindow.document;
    const panel = createHTML(doc, "div");
    panel.id = "sonder-context-chat-panel";

    const resizeHandle = createHTML(doc, "div");
    resizeHandle.className = "sonder-resize-handle";
    resizeHandle.title = "Drag to resize";
    resizeHandle.addEventListener("mousedown", (event) => {
      this.startResize(event);
    });

    const header = createHTML(doc, "div");
    header.className = "sonder-panel-header";

    const topRow = createHTML(doc, "div");
    topRow.className = "sonder-header-row";

    const titleBlock = createHTML(doc, "div");
    const badge = createHTML(doc, "span");
    badge.className = "sonder-context-badge";
    const title = createHTML(doc, "div");
    title.className = "sonder-context-title";
    const sessionTitle = createHTML(doc, "div");
    sessionTitle.className = "sonder-session-title";
    titleBlock.append(badge, title, sessionTitle);

    const status = createHTML(doc, "span");
    status.className = "sonder-status";

    topRow.append(titleBlock, status);

    const actionRow = createHTML(doc, "div");
    actionRow.className = "sonder-header-actions";

    const sessionGroup = createHTML(doc, "div");
    sessionGroup.className = "sonder-action-group";

    const historyButton = createHTML(doc, "button");
    historyButton.className = "sonder-action";
    historyButton.textContent = "History";
    historyButton.addEventListener("click", () => {
      this.state.historyOpen = !this.state.historyOpen;
      this.render();
    });

    const newSessionButton = createHTML(doc, "button");
    newSessionButton.className = "sonder-action";
    newSessionButton.textContent = "New Session";
    newSessionButton.addEventListener("click", () => {
      void this.createNewSession();
    });

    const clearSessionButton = createHTML(doc, "button");
    clearSessionButton.className = "sonder-action";
    clearSessionButton.textContent = "Clear Session";
    clearSessionButton.addEventListener("click", () => {
      void this.clearCurrentSession();
    });
    const pageRangeButton = createHTML(doc, "button");
    pageRangeButton.className = "sonder-action";
    pageRangeButton.addEventListener("click", () => {
      this.handlePageRangeConfig();
    });

    sessionGroup.append(historyButton, newSessionButton, clearSessionButton, pageRangeButton);

    const providerGroup = createHTML(doc, "div");
    providerGroup.className = "sonder-action-group is-provider-row";

    const codexAuthButton = createHTML(doc, "button");
    codexAuthButton.className = "sonder-action";
    codexAuthButton.addEventListener("click", () => {
      void handleCodexAuth(this.providerDialogContext());
    });

    const codexModelButton = createHTML(doc, "button");
    codexModelButton.className = "sonder-action";
    codexModelButton.addEventListener("click", () => {
      void handleCodexModelConfig(this.providerDialogContext());
    });

    const customApiButton = createHTML(doc, "button");
    customApiButton.className = "sonder-action";
    customApiButton.addEventListener("click", () => {
      void handleCustomApiConfig(this.providerDialogContext());
    });
    providerGroup.append(codexAuthButton, codexModelButton, customApiButton);

    const closeButton = createHTML(doc, "button");
    closeButton.className = "sonder-close";
    closeButton.textContent = "❯";
    closeButton.title = "Fold panel";
    closeButton.addEventListener("click", () => {
      this.state.visible = false;
      this.state.historyOpen = false;
      this.render();
    });

    actionRow.append(sessionGroup, providerGroup);

    const historyDrawer = createHTML(doc, "div");
    historyDrawer.className = "sonder-history-drawer";

    header.append(closeButton, topRow, actionRow, historyDrawer);

    const messageList = createHTML(doc, "div");
    messageList.className = "sonder-message-list";

    const composer = createHTML(doc, "div");
    composer.className = "sonder-composer";

    const composerHint = createHTML(doc, "div");
    composerHint.className = "sonder-composer-hint";

    const composerInput = createHTML(doc, "textarea");
    composerInput.className = "sonder-composer-input";
    composerInput.placeholder = "Ask about this paper";
    composerInput.addEventListener("input", () => {
      this.state.draft = composerInput.value;
      this.syncComposerState();
    });
    composerInput.addEventListener("keydown", (event) => {
      if (event.key == "Enter" && !event.shiftKey) {
        event.preventDefault();
        void this.handleSend();
      }
    });

    const composerActions = createHTML(doc, "div");
    composerActions.className = "sonder-composer-actions";

    const composerNote = createHTML(doc, "div");
    composerNote.className = "sonder-composer-note";

    const sendButton = createHTML(doc, "button");
    sendButton.className = "sonder-send";
    sendButton.textContent = "Send";
    sendButton.addEventListener("click", () => {
      void this.handleSend();
    });

    composerActions.append(composerNote, sendButton);
    composer.append(composerHint, composerInput, composerActions);

    panel.append(resizeHandle, header, messageList, composer);
    doc.documentElement.appendChild(panel);

    this.panel = panel;
    this.resizeHandle = resizeHandle;
    this.applyPanelWidth();
    this.badge = badge;
    this.title = title;
    this.sessionTitle = sessionTitle;
    this.status = status;
    this.historyButton = historyButton;
    this.newSessionButton = newSessionButton;
    this.clearSessionButton = clearSessionButton;
    this.codexAuthButton = codexAuthButton;
    this.codexModelButton = codexModelButton;
    this.customApiButton = customApiButton;
    this.pageRangeButton = pageRangeButton;
    this.closeButton = closeButton;
    this.historyDrawer = historyDrawer;
    this.messageList = messageList;
    this.composerHint = composerHint;
    this.composerInput = composerInput;
    this.composerNote = composerNote;
    this.sendButton = sendButton;
  }

  // --- Provider dialog context ---

  private providerDialogContext() {
    return {
      ownerWindow: this.ownerWindow,
      render: () => this.render(),
      openCurrentContext: () => void this.openCurrentContext(),
    };
  }

  // --- Insight context helpers ---

  private insightRefreshContext() {
    return {
      store: this.store,
      getSnapshot: () => this.state.snapshot,
      getInsightRefreshSerial: () => this.insightRefreshSerial,
      incrementInsightRefreshSerial: () => ++this.insightRefreshSerial,
      setInsights: (insights: StoredInsight[], loading: boolean) => {
        this.state.insights = insights;
        this.state.insightsLoading = loading;
      },
      render: () => this.render(),
    };
  }

  private insightSaveContext() {
    return {
      store: this.store,
      ownerWindow: this.ownerWindow,
      getSnapshot: () => this.state.snapshot,
      getSavedInsightId: (messageId: string) => this.state.savedInsightsByMessage[messageId],
      setSavedInsightId: (messageId: string, insightId: string) => {
        this.state.savedInsightsByMessage[messageId] = insightId;
      },
      refreshInsights: () => refreshInsightsForCurrentContext(this.insightRefreshContext()),
      render: () => this.render(),
    };
  }

  // --- Panel width ---

  private loadSavedPanelWidth() {
    try {
      const raw = this.ownerWindow.localStorage?.getItem(PANEL_WIDTH_STORAGE_KEY);
      const width = Number(raw || NaN);
      return Number.isFinite(width) ? width : undefined;
    } catch {
      return undefined;
    }
  }

  private savePanelWidth(width: number) {
    try {
      this.ownerWindow.localStorage?.setItem(PANEL_WIDTH_STORAGE_KEY, String(width));
    } catch {
      // ignore persistence failures
    }
  }

  private applyPanelWidth() {
    if (!this.panel || !this.state.panelWidth) {
      return;
    }
    this.panel.style.setProperty("--sonder-panel-width", `${Math.round(this.state.panelWidth)}px`);
  }

  private startResize(event: MouseEvent) {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = this.panel.getBoundingClientRect().width;
    const minWidth = 420;
    const maxWidth = Math.floor(this.ownerWindow.innerWidth * 0.85);

    const onMove = (moveEvent: MouseEvent) => {
      const delta = startX - moveEvent.clientX;
      const nextWidth = Math.min(maxWidth, Math.max(minWidth, startWidth + delta));
      this.state.panelWidth = nextWidth;
      this.applyPanelWidth();
    };

    const onUp = () => {
      this.ownerWindow.removeEventListener("mousemove", onMove);
      this.ownerWindow.removeEventListener("mouseup", onUp);
      if (this.state.panelWidth) {
        this.savePanelWidth(this.state.panelWidth);
      }
    };

    this.ownerWindow.addEventListener("mousemove", onMove);
    this.ownerWindow.addEventListener("mouseup", onUp);
  }

  // --- Paper status ---

  private setPaperStatus(status: PaperContextStatus, error?: string) {
    this.state.paperStatus = status;
    this.state.paperError = error;
  }

  private syncPaperStatus() {
    const contextId = this.state.snapshot?.context.id;
    if (!contextId) {
      this.setPaperStatus("idle");
      return;
    }
    const state = this.chatService.getPaperContextState(contextId);
    this.setPaperStatus(state.status, state.error);
  }

  private startPaperPreparation() {
    const context = this.state.snapshot?.context;
    if (!context) {
      this.setPaperStatus("idle");
      return;
    }
    this.syncPaperStatus();
    this.chatService.preparePaperContext(context, (state) => {
      if (this.state.snapshot?.context.id != context.id) {
        return;
      }
      this.setPaperStatus(state.status, state.error);
      if (state.status == "failed" && state.error && !this.state.error) {
        this.state.error = state.error;
      }
      this.render();
    });
  }

  // --- Session management ---

  private async openCurrentContext() {
    this.state.visible = true;
    this.state.loading = true;
    this.state.loadingPhase = "opening";
    this.state.error = undefined;
    this.state.historyOpen = false;
    this.state.assistantPreviewText = "";
    this.setPaperStatus("idle");
    this.render();

    const itemResolution = await resolveSelectedItemPaperContextWithSource();
    const itemPaperContext = itemResolution.context;
    const paperContext = !itemPaperContext ? resolveCurrentPaperContext() : undefined;
    if (!itemPaperContext && !paperContext) {
      this.state.loading = false;
      this.state.loadingPhase = undefined;
      this.state.snapshot = undefined;
      this.state.insights = [];
      this.state.error = "Open a PDF or webpage snapshot, or select an annotation/note item, then click Chat. Other attachment types are not yet supported.";
      this.render();
      return;
    }

    try {
      this.state.snapshot = itemPaperContext
        ? await this.store.getOrCreateItemPaperSession(itemPaperContext)
        : await this.store.getOrCreatePaperSession(paperContext!);
      this.state.savedInsightsByMessage = {};
      this.state.historySearch = "";
      this.state.renamingSessionId = undefined;
      this.state.renamingSessionDraft = "";
      await refreshInsightsForCurrentContext(this.insightRefreshContext());
      this.state.loading = false;
      this.state.loadingPhase = undefined;
      this.state.error = undefined;
      this.syncPaperStatus();
    } catch (error: any) {
      this.state.loading = false;
      this.state.loadingPhase = undefined;
      this.state.snapshot = undefined;
      this.state.insights = [];
      this.state.error = String(error?.message || error || "Failed to open context session.");
      Zotero.logError(error);
    }
    this.render();
    this.startPaperPreparation();
    this.focusComposer();
  }

  private async createNewSession() {
    const contextId = this.state.snapshot?.context.id;
    if (!contextId) {
      return;
    }
    this.state.loading = true;
    this.state.loadingPhase = "opening";
    this.render();
    try {
      const snapshot = await this.store.createNewSession(contextId);
      if (snapshot) {
        this.state.snapshot = snapshot;
        this.state.savedInsightsByMessage = {};
        this.state.renamingSessionId = undefined;
        this.state.renamingSessionDraft = "";
        await refreshInsightsForCurrentContext(this.insightRefreshContext());
        this.syncPaperStatus();
      }
      this.state.historyOpen = false;
      this.state.error = undefined;
      this.state.assistantPreviewText = "";
    } catch (error: any) {
      Zotero.logError(error);
      this.state.error = "Failed to create a new session.";
    } finally {
      this.state.loading = false;
      this.state.loadingPhase = undefined;
      this.render();
      this.startPaperPreparation();
      this.focusComposer();
    }
  }

  private async clearCurrentSession() {
    const sessionId = this.state.snapshot?.session.id;
    if (!sessionId) {
      return;
    }
    if (!this.ownerWindow.confirm("Clear all messages in the current session? This cannot be undone.")) {
      return;
    }
    this.state.loading = true;
    this.state.loadingPhase = "opening";
    this.render();
    try {
      const snapshot = await this.store.clearSessionMessages(sessionId);
      if (snapshot) {
        this.state.snapshot = snapshot;
        this.state.savedInsightsByMessage = {};
        this.state.renamingSessionId = undefined;
        this.state.renamingSessionDraft = "";
        await refreshInsightsForCurrentContext(this.insightRefreshContext());
        this.syncPaperStatus();
      }
      this.state.historyOpen = false;
      this.state.error = undefined;
      this.state.assistantPreviewText = "";
    } catch (error: any) {
      Zotero.logError(error);
      this.state.error = "Failed to clear current session.";
    } finally {
      this.state.loading = false;
      this.state.loadingPhase = undefined;
      this.render();
      this.startPaperPreparation();
      this.focusComposer();
    }
  }

  private async loadSession(sessionId: string) {
    this.state.loading = true;
    this.state.loadingPhase = "opening";
    this.render();
    try {
      const snapshot = await this.store.getSessionSnapshot(sessionId);
      if (snapshot) {
        this.state.snapshot = snapshot;
        this.state.savedInsightsByMessage = {};
        this.state.renamingSessionId = undefined;
        this.state.renamingSessionDraft = "";
        await refreshInsightsForCurrentContext(this.insightRefreshContext());
        this.syncPaperStatus();
      }
      this.state.historyOpen = false;
      this.state.error = undefined;
      this.state.assistantPreviewText = "";
    } catch (error: any) {
      Zotero.logError(error);
      this.state.error = "Failed to load session history.";
    } finally {
      this.state.loading = false;
      this.state.loadingPhase = undefined;
      this.render();
      this.startPaperPreparation();
      this.focusComposer();
    }
  }

  private handlePageRangeConfig() {
    const current = this.state.pageRange;
    const promptMessage = current
      ? `Current page range: ${current.startPage}-${current.endPage}\n\nEnter a new page range (e.g., "1-8") or leave empty to send all pages:`
      : 'All pages are sent to the model by default.\n\nTo limit context to specific pages (e.g., exclude references), enter a page range like "1-8".\nLeave empty to keep sending all pages:';
    const defaultValue = current ? `${current.startPage}-${current.endPage}` : undefined;

    const input = this.ownerWindow.prompt(promptMessage, defaultValue);
    if (input === null) {
      return;
    }
    const trimmed = input.trim();
    if (!trimmed) {
      if (current) {
        this.state.pageRange = undefined;
        this.render();
      }
      return;
    }
    const parsed = parsePageRangeInput(trimmed);
    if (!parsed) {
      this.ownerWindow.alert('Invalid format. Use "start-end" (e.g., "1-8"). Start page must be >= 1 and end page must be >= start page.');
      return;
    }
    this.state.pageRange = parsed;
    this.render();
  }

  // --- History session rename/delete ---

  private beginRenameSession(sessionId: string, currentTitle: string) {
    this.state.renamingSessionId = sessionId;
    this.state.renamingSessionDraft = currentTitle;
    this.render();
    this.ownerWindow.setTimeout(() => {
      const input = this.historyDrawer.querySelector(`.sonder-history-rename-input[data-session-id="${sessionId}"]`) as HTMLInputElement | null;
      input?.focus();
      if (input) {
        const end = input.value.length;
        try {
          input.setSelectionRange(end, end);
        } catch {
          // ignore
        }
      }
    }, 0);
  }

  private cancelRenameSession() {
    this.state.renamingSessionId = undefined;
    this.state.renamingSessionDraft = "";
    this.render();
  }

  private async confirmRenameSession(sessionId: string) {
    const nextTitle = this.state.renamingSessionDraft.trim();
    if (!nextTitle) {
      this.ownerWindow.alert("Session title cannot be empty.");
      return;
    }

    this.state.loading = true;
    this.state.loadingPhase = "opening";
    this.render();
    try {
      const renamed = await this.store.renameSession(sessionId, nextTitle);
      if (!renamed) {
        this.ownerWindow.alert("Failed to rename session.");
        return;
      }
      const currentSessionId = this.state.snapshot?.session.id;
      if (currentSessionId) {
        const snapshot = await this.store.getSessionSnapshot(currentSessionId);
        if (snapshot) {
          this.state.snapshot = snapshot;
        }
      }
      this.state.renamingSessionId = undefined;
      this.state.renamingSessionDraft = "";
      this.state.error = undefined;
    } catch (error: any) {
      Zotero.logError(error);
      this.state.error = "Failed to rename session.";
    } finally {
      this.state.loading = false;
      this.state.loadingPhase = undefined;
      this.render();
    }
  }

  private async deleteSession(sessionId: string) {
    const snapshot = this.state.snapshot;
    if (!snapshot) {
      return;
    }
    if (!this.ownerWindow.confirm("Delete this session? Messages in this session will be removed.")) {
      return;
    }

    this.state.loading = true;
    this.state.loadingPhase = "opening";
    this.render();

    try {
      const deleted = await this.store.deleteSession(sessionId);
      if (!deleted) {
        this.ownerWindow.alert("Session not found.");
        return;
      }
      if (this.state.renamingSessionId == sessionId) {
        this.state.renamingSessionId = undefined;
        this.state.renamingSessionDraft = "";
      }

      const remaining = await this.store.listSessions(deleted.contextId);
      if (remaining.length == 0) {
        const created = await this.store.createNewSession(deleted.contextId);
        this.state.snapshot = created;
      } else if (snapshot.session.id == sessionId) {
        const next = await this.store.getSessionSnapshot(remaining[0].id);
        if (next) {
          this.state.snapshot = next;
        }
      } else {
        const current = await this.store.getSessionSnapshot(snapshot.session.id);
        if (current) {
          this.state.snapshot = current;
        } else {
          const fallback = await this.store.getSessionSnapshot(remaining[0].id);
          if (fallback) {
            this.state.snapshot = fallback;
          }
        }
      }
      await refreshInsightsForCurrentContext(this.insightRefreshContext());
      this.state.error = undefined;
    } catch (error: any) {
      Zotero.logError(error);
      this.state.error = "Failed to delete session.";
    } finally {
      this.state.loading = false;
      this.state.loadingPhase = undefined;
      this.render();
      this.focusComposer();
    }
  }

  // --- Send ---

  private async handleSend() {
    const snapshot = this.state.snapshot;
    const content = this.state.draft.trim();
    if (!snapshot || this.state.loading || !canSendDraft(content)) {
      return;
    }

    this.state.loading = true;
    this.state.loadingPhase = "sending";
    this.state.error = undefined;
    this.state.draft = "";
    this.state.assistantPreviewText = "";
    this.render();

    try {
      const nextSnapshot = await this.chatService.sendMessage(snapshot.session.id, content, {
        onUserSnapshot: (updatedSnapshot) => {
          this.state.snapshot = updatedSnapshot;
          this.render();
        },
        onAssistantDelta: (text) => {
          this.state.assistantPreviewText = text;
          this.render();
        },
        onPaperStatusChange: (state) => {
          this.setPaperStatus(state.status, state.error);
          this.render();
        },
      }, this.state.pageRange);
      this.state.snapshot = nextSnapshot;
      this.state.assistantPreviewText = "";
    } catch (error: any) {
      Zotero.logError(error);
      this.state.error = String(error?.message || error || "Failed to send message.");
    } finally {
      this.state.loading = false;
      this.state.loadingPhase = undefined;
      this.render();
      this.focusComposer();
    }
  }

  // --- Citation jump ---

  private async jumpToCitation(citation: { sourceType: "paper" | "item"; target?: string; page?: number; yOffset?: number }) {
    try {
      if (citation.sourceType == "item" && citation.target?.startsWith("item:")) {
        const [, libraryStr, itemKey] = citation.target.split(":");
        const libraryID = Number(libraryStr || NaN);
        if (!itemKey || Number.isNaN(libraryID)) {
          return;
        }
        const item = Zotero.Items.getByLibraryAndKey(libraryID, itemKey) as Zotero.Item | false;
        if (!item) {
          return;
        }

        ZoteroPane.selectItem(item.id);
        return;
      }

      const target = citation.target;
      const resolvedPage = citation.page || (target?.startsWith("page:") ? Number(target.slice(5)) : 0);
      if (!resolvedPage) {
        return;
      }
      const reader = (Zotero.Reader.getByTabID(Zotero_Tabs.selectedID) || await ztoolkit.Reader.getReader()) as _ZoteroTypes.ReaderInstance;
      if (!reader?._iframeWindow) {
        throw new Error("No active PDF reader is available for citation jump.");
      }
      const pdfApp = (reader._iframeWindow as any).wrappedJSObject.PDFViewerApplication;
      if (!pdfApp?.pdfViewer) {
        return;
      }
      pdfApp.page = resolvedPage;
      pdfApp.pdfViewer.scrollPageIntoView({
        pageNumber: resolvedPage,
        destArray: [null, { name: "XYZ" }, 0, citation.yOffset ?? null, null],
        allowNegativeOffset: false,
        ignoreDestinationZoom: false,
      });
    } catch (error: any) {
      Zotero.logError(error);
    }
  }

  // --- Clipboard ---

  private async copySelectedText(text: string) {
    try {
      if (this.ownerWindow.navigator?.clipboard?.writeText) {
        await this.ownerWindow.navigator.clipboard.writeText(text);
      } else {
        new ztoolkit.Clipboard().addText(text, "text/unicode").copy();
      }
    } catch (error: any) {
      Zotero.logError(error);
    }
  }

  private async copyMessageContent(rawText: string, button: HTMLButtonElement) {
    try {
      if (this.ownerWindow.navigator?.clipboard?.writeText) {
        await this.ownerWindow.navigator.clipboard.writeText(rawText);
      } else {
        new ztoolkit.Clipboard().addText(rawText, "text/unicode").copy();
      }
      const previous = button.textContent;
      button.textContent = "✓";
      this.ownerWindow.setTimeout(() => {
        button.textContent = previous;
      }, 1200);
    } catch (error: any) {
      Zotero.logError(error);
      this.ownerWindow.alert("Failed to copy message.");
    }
  }

  // --- Composer ---

  private syncComposerState() {
    const hasContext = Boolean(this.state.snapshot);
    if (this.composerInput.value != this.state.draft) {
      this.composerInput.value = this.state.draft;
    }
    this.composerInput.disabled = !hasContext || this.state.loading;
    this.composerInput.placeholder = hasContext
      ? this.state.snapshot?.context.type == "item+paper"
        ? "Ask about the selected annotation/note"
        : "Ask about this paper"
      : "Open a PDF or snapshot, or select an annotation/note, then click Chat";
    this.composerHint.textContent = this.getComposerHint();
    this.composerNote.textContent = !hasContext
      ? "Document context is required before you can send a message."
      : this.state.loadingPhase == "sending"
        ? this.state.paperStatus == "preparing"
          ? "Preparing paper context, then generating a grounded response…"
          : `Generating response with the current provider… View mode: ${this.state.viewMode == "raw" ? "Raw Markdown" : "Preview"}`
        : this.state.paperStatus == "preparing"
          ? "Preparing retrievable paper context… You can still press Send."
          : this.state.paperStatus == "failed"
            ? `Paper preparation failed: ${this.state.paperError || "unknown error"}`
            : `Enter to send · Shift+Enter for newline · View mode: ${this.state.viewMode == "raw" ? "Raw Markdown" : "Preview"}`;
    this.sendButton.disabled = !hasContext || this.state.loading || !canSendDraft(this.state.draft);
    this.sendButton.textContent = this.state.loadingPhase == "sending" ? "Sending…" : "Send";
  }

  private focusComposer() {
    if (!this.state.visible || this.composerInput.disabled) {
      return;
    }
    this.ownerWindow.setTimeout(() => {
      try {
        this.composerInput.focus();
      } catch { }
    }, 0);
  }

  private scrollMessagesToEnd() {
    this.ownerWindow.setTimeout(() => {
      this.messageList.scrollTop = this.messageList.scrollHeight;
    }, 0);
  }

  // --- Header labels ---

  private getContextBadgeLabel() {
    const context = this.state.snapshot?.context;
    if (!context) {
      return "Context chat";
    }
    if (context.type == "item+paper") {
      return context.itemKind == "note" ? "Note + Paper" : "Annotation + Paper";
    }
    return "Paper";
  }

  private getContextTitle() {
    const context = this.state.snapshot?.context;
    if (!context) {
      return "Open a PDF or snapshot, or select an annotation/note to start";
    }
    if (context.type == "item+paper") {
      const itemTitle = (context.itemText || "").slice(0, 72);
      return itemTitle.length > 0 ? `${itemTitle}${context.itemText && context.itemText.length > 72 ? "…" : ""}` : "Selected item + paper";
    }
    return context.title;
  }

  private getComposerHint() {
    const context = this.state.snapshot?.context;
    if (!context) {
      return "Open a PDF reader tab or select an annotation/note, then click Chat";
    }
    if (context.type == "item+paper") {
      return context.itemKind == "note"
        ? "Chatting with selected note + parent paper"
        : "Chatting with selected annotation + parent paper";
    }
    return "Chatting with current paper";
  }

  // --- Render ---

  private render() {
    const snapshot = this.state.snapshot;
    const hasContext = Boolean(snapshot);
    this.panel.style.display = this.state.visible ? "flex" : "none";

    this.badge.textContent = this.getContextBadgeLabel();
    this.title.textContent = this.getContextTitle();
    this.sessionTitle.textContent = hasContext
      ? snapshot!.context.type == "item+paper"
        ? `${snapshot!.session.title} · ${snapshot!.context.title} · Updated ${formatTimestamp(snapshot!.session.updatedAt)}`
        : `${snapshot!.session.title} · Updated ${formatTimestamp(snapshot!.session.updatedAt)}`
      : "Persisted context session";

    this.status.textContent = this.state.error || this.state.paperStatus == "failed"
      ? "Failed"
      : this.state.loadingPhase == "sending"
        ? "Responding…"
        : this.state.loading || this.state.paperStatus == "preparing"
          ? "Preparing context…"
          : hasContext
            ? "Ready"
            : "Awaiting paper";
    this.status.classList.toggle("is-pending", (this.state.loading || this.state.paperStatus == "preparing") && !(this.state.error || this.state.paperError));
    this.status.classList.toggle("is-error", Boolean(this.state.error || this.state.paperError));

    this.historyButton.disabled = !hasContext || this.state.loading;
    this.newSessionButton.disabled = !hasContext || this.state.loading;
    this.clearSessionButton.disabled = !hasContext || this.state.loading;

    const provider = getProvider();
    const oauth = getCodexLoginReport();
    this.codexAuthButton.disabled = this.state.loading;
    if (provider != "openai-codex") {
      this.codexAuthButton.textContent = "Enable Codex";
      this.codexAuthButton.title = "Switch provider to openai-codex and start OAuth login";
    } else if (oauth.hasPendingLogin) {
      this.codexAuthButton.textContent = "Finish Login";
      this.codexAuthButton.title = "Paste redirect URL or code to finish Codex OAuth login";
    } else if (hasCodexCredentials()) {
      this.codexAuthButton.textContent = "Logout Codex";
      this.codexAuthButton.title = "Clear stored Codex OAuth credentials";
    } else {
      this.codexAuthButton.textContent = "Login Codex";
      this.codexAuthButton.title = "Start ChatGPT/Codex OAuth login";
    }

    this.codexModelButton.disabled = this.state.loading || provider != "openai-codex";
    this.codexModelButton.style.display = provider == "openai-codex" ? "" : "none";
    this.codexModelButton.textContent = `Codex: ${getCurrentModel("openai-codex")}`;
    this.codexModelButton.title = "Change Codex model";
    this.codexModelButton.classList.toggle("is-active", provider == "openai-codex");

    this.customApiButton.disabled = this.state.loading;
    const apiLabel = getCustomApiStatusLabel();
    this.customApiButton.textContent = apiLabel;
    this.customApiButton.title = hasCustomApiConfig() && provider == "openai-api"
      ? "Reconfigure or clear the custom API endpoint"
      : "Configure a custom OpenAI-compatible API endpoint (base URL + API key + model)";
    this.customApiButton.classList.toggle("is-active", provider == "openai-api" && hasCustomApiConfig());

    this.pageRangeButton.disabled = !hasContext || this.state.loading;
    this.pageRangeButton.textContent = this.state.pageRange
      ? `Pages: ${this.state.pageRange.startPage}-${this.state.pageRange.endPage}`
      : "Pages: All";
    this.pageRangeButton.title = this.state.pageRange
      ? `Sending pages ${this.state.pageRange.startPage}-${this.state.pageRange.endPage} to the model. Click to change or reset.`
      : "Sending all pages to the model. Click to set a page range.";
    this.pageRangeButton.classList.toggle("is-active", Boolean(this.state.pageRange));

    this.closeButton.disabled = false;

    renderHistoryDrawer({
      ownerWindow: this.ownerWindow,
      historyDrawer: this.historyDrawer,
      snapshot: this.state.snapshot,
      historyOpen: this.state.historyOpen,
      historySearch: this.state.historySearch,
      setHistorySearch: (value) => { this.state.historySearch = value; },
      renamingSessionId: this.state.renamingSessionId,
      renamingSessionDraft: this.state.renamingSessionDraft,
      setRenamingSessionDraft: (value) => { this.state.renamingSessionDraft = value; },
      insightsLoading: this.state.insightsLoading,
      insights: this.state.insights,
      loadSession: (sessionId) => { void this.loadSession(sessionId); },
      deleteSession: (sessionId) => { void this.deleteSession(sessionId); },
      beginRenameSession: (sessionId, title) => { this.beginRenameSession(sessionId, title); },
      cancelRenameSession: () => { this.cancelRenameSession(); },
      confirmRenameSession: (sessionId) => { void this.confirmRenameSession(sessionId); },
    });

    renderMessageList({
      ownerWindow: this.ownerWindow,
      messageList: this.messageList,
      snapshot: this.state.snapshot,
      viewMode: this.state.viewMode,
      setViewMode: (mode) => { this.state.viewMode = mode; },
      assistantPreviewText: this.state.assistantPreviewText,
      paperStatus: this.state.paperStatus,
      error: this.state.error,
      savedInsightsByMessage: this.state.savedInsightsByMessage,
      copyMessageContent: (rawText, button) => { void this.copyMessageContent(rawText, button); },
      saveInsightFromMessage: (message, button) => { void saveInsightFromMessage(this.insightSaveContext(), message, button); },
      jumpToCitation: (citation) => { void this.jumpToCitation(citation); },
      render: () => this.render(),
    }, snapshot?.messages || []);

    this.syncComposerState();
    if (this.state.visible) {
      this.scrollMessagesToEnd();
    }
  }
}

export default ContextChatPanel;
