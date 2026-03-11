import ContextChatService, { PaperContextStatus } from "./chatService";
import { canSendDraft } from "./chatMessages";
import { resolveSelectedItemPaperContextWithSource } from "./itemPaperContext";
import { resolveCurrentPaperContext } from "./paperContext";
import { renderMessageHTML } from "./render";
import ContextChatStore from "./storage";
import { SessionSnapshot, StoredMessage } from "./types";

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

const PANEL_WIDTH_STORAGE_KEY = "sonder.contextChat.panelWidth";

export class ContextChatPanel {
  private launcherButton!: HTMLButtonElement;
  private panel!: HTMLDivElement;
  private resizeHandle!: HTMLDivElement;
  private badge!: HTMLSpanElement;
  private title!: HTMLDivElement;
  private sessionTitle!: HTMLDivElement;
  private status!: HTMLSpanElement;
  private historyButton!: HTMLButtonElement;
  private newSessionButton!: HTMLButtonElement;
  private clearSessionButton!: HTMLButtonElement;
  private viewModeButton!: HTMLButtonElement;
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
  } = {
    visible: false,
    loading: false,
    paperStatus: "idle",
    historyOpen: false,
    viewMode: "raw",
    draft: "",
    assistantPreviewText: "",
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
    if (doc.getElementById("sonder-context-chat-launcher") || doc.getElementById("sonder-context-chat-panel")) {
      return;
    }
    this.buildLauncher();
    this.buildPanel();
    this.render();
  }

  public open() {
    void this.openCurrentContext();
  }

  public destroy() {
    this.launcherButton?.remove();
    this.panel?.remove();
    this.ownerWindow.document.getElementById("sonder-context-chat-style")?.remove();
  }

  private installStyle() {
    const style = createHTML(this.ownerWindow.document, "style");
    style.id = "sonder-context-chat-style";
    style.textContent = `
      #sonder-context-chat-launcher {
        position: fixed;
        top: 76px;
        right: 18px;
        z-index: 2147483000;
        border: none;
        border-radius: 999px;
        background: linear-gradient(135deg, #1f6feb 0%, #7c3aed 100%);
        color: #fff;
        padding: 10px 16px;
        font-size: 13px;
        font-weight: 600;
        cursor: pointer;
        box-shadow: 0 12px 28px rgba(31, 111, 235, 0.28);
      }
      #sonder-context-chat-launcher:hover {
        transform: translateY(-1px);
        box-shadow: 0 14px 32px rgba(31, 111, 235, 0.35);
      }
      #sonder-context-chat-panel {
        position: fixed;
        top: 0;
        right: 0;
        z-index: 2147482999;
        width: var(--sonder-panel-width, min(46vw, 760px));
        min-width: 420px;
        max-width: 85vw;
        height: 100vh;
        display: none;
        flex-direction: column;
        background: #ffffff;
        color: #111827;
        box-shadow: -18px 0 48px rgba(15, 23, 42, 0.18);
        border-left: 1px solid rgba(148, 163, 184, 0.2);
        font-family: Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      #sonder-context-chat-panel .sonder-resize-handle {
        position: absolute;
        top: 0;
        left: 0;
        width: 8px;
        height: 100%;
        cursor: col-resize;
        z-index: 2;
      }
      #sonder-context-chat-panel .sonder-resize-handle::after {
        content: "";
        position: absolute;
        top: 0;
        right: 0;
        width: 2px;
        height: 100%;
        background: transparent;
        transition: background 120ms ease;
      }
      #sonder-context-chat-panel .sonder-resize-handle:hover::after {
        background: rgba(59, 130, 246, 0.35);
      }
      #sonder-context-chat-panel .sonder-panel-header {
        padding: 18px 20px 16px;
        border-bottom: 1px solid #e5e7eb;
        display: flex;
        flex-direction: column;
        gap: 12px;
        background: linear-gradient(180deg, rgba(248, 250, 252, 0.95), rgba(255, 255, 255, 0.98));
      }
      #sonder-context-chat-panel .sonder-header-row {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 12px;
      }
      #sonder-context-chat-panel .sonder-context-badge {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        border-radius: 999px;
        background: rgba(31, 111, 235, 0.12);
        color: #1d4ed8;
        font-size: 12px;
        font-weight: 700;
        letter-spacing: 0.01em;
        padding: 6px 10px;
        width: fit-content;
      }
      #sonder-context-chat-panel .sonder-context-title {
        font-size: 20px;
        font-weight: 700;
        line-height: 1.3;
      }
      #sonder-context-chat-panel .sonder-session-title {
        margin-top: 4px;
        font-size: 13px;
        color: #475569;
      }
      #sonder-context-chat-panel .sonder-status {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        border-radius: 999px;
        background: #ecfdf5;
        color: #047857;
        font-size: 12px;
        font-weight: 700;
        padding: 6px 10px;
      }
      #sonder-context-chat-panel .sonder-status.is-pending {
        background: #eff6ff;
        color: #1d4ed8;
      }
      #sonder-context-chat-panel .sonder-status.is-error {
        background: #fef2f2;
        color: #b91c1c;
      }
      #sonder-context-chat-panel .sonder-header-actions {
        display: flex;
        align-items: center;
        gap: 8px;
        flex-wrap: wrap;
      }
      #sonder-context-chat-panel .sonder-action,
      #sonder-context-chat-panel .sonder-close,
      #sonder-context-chat-panel .sonder-history-item,
      #sonder-context-chat-panel .sonder-send {
        border: 1px solid #dbe2ea;
        background: #fff;
        color: #0f172a;
        border-radius: 10px;
        padding: 8px 12px;
        font-size: 12px;
        font-weight: 600;
        cursor: pointer;
      }
      #sonder-context-chat-panel .sonder-close {
        padding: 8px 10px;
      }
      #sonder-context-chat-panel .sonder-action:hover,
      #sonder-context-chat-panel .sonder-close:hover,
      #sonder-context-chat-panel .sonder-history-item:hover,
      #sonder-context-chat-panel .sonder-send:hover {
        background: #f8fafc;
      }
      #sonder-context-chat-panel .sonder-action:disabled,
      #sonder-context-chat-panel .sonder-send:disabled {
        cursor: not-allowed;
        color: #94a3b8;
        background: #f8fafc;
      }
      #sonder-context-chat-panel .sonder-action.is-active {
        background: rgba(29, 78, 216, 0.08);
        border-color: #93c5fd;
        color: #1d4ed8;
      }
      #sonder-context-chat-panel .sonder-send:not(:disabled) {
        background: linear-gradient(135deg, #1f6feb 0%, #7c3aed 100%);
        color: #fff;
        border-color: transparent;
      }
      #sonder-context-chat-panel .sonder-history-drawer {
        display: none;
        flex-direction: column;
        gap: 8px;
        border-top: 1px solid #e5e7eb;
        padding-top: 12px;
      }
      #sonder-context-chat-panel .sonder-history-drawer.is-open {
        display: flex;
      }
      #sonder-context-chat-panel .sonder-history-meta {
        font-size: 12px;
        color: #64748b;
      }
      #sonder-context-chat-panel .sonder-history-list {
        display: flex;
        flex-direction: column;
        gap: 8px;
        max-height: 180px;
        overflow: auto;
      }
      #sonder-context-chat-panel .sonder-history-item {
        text-align: left;
        display: flex;
        flex-direction: column;
        gap: 4px;
      }
      #sonder-context-chat-panel .sonder-history-item.is-active {
        border-color: #1d4ed8;
        background: rgba(29, 78, 216, 0.06);
      }
      #sonder-context-chat-panel .sonder-history-item-title {
        font-size: 13px;
        font-weight: 700;
      }
      #sonder-context-chat-panel .sonder-history-item-subtitle {
        font-size: 12px;
        color: #64748b;
      }
      #sonder-context-chat-panel .sonder-message-list {
        flex: 1;
        overflow: auto;
        padding: 20px;
        background: #f8fafc;
      }
      #sonder-context-chat-panel .sonder-empty-state {
        border: 1px dashed #cbd5e1;
        border-radius: 16px;
        background: rgba(255, 255, 255, 0.88);
        padding: 20px;
        display: flex;
        flex-direction: column;
        gap: 10px;
      }
      #sonder-context-chat-panel .sonder-empty-title {
        font-size: 16px;
        font-weight: 700;
      }
      #sonder-context-chat-panel .sonder-empty-copy {
        font-size: 14px;
        line-height: 1.55;
        color: #334155;
      }
      #sonder-context-chat-panel .sonder-message {
        margin-bottom: 12px;
        padding: 14px 16px;
        border-radius: 16px;
        background: #fff;
        border: 1px solid #e2e8f0;
      }
      #sonder-context-chat-panel .sonder-message.is-user {
        background: #eff6ff;
        border-color: #bfdbfe;
        margin-left: 48px;
      }
      #sonder-context-chat-panel .sonder-message.is-assistant {
        margin-right: 24px;
      }
      #sonder-context-chat-panel .sonder-message.is-streaming {
        border-style: dashed;
      }
      #sonder-context-chat-panel .sonder-message-role {
        font-size: 11px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        color: #64748b;
        margin-bottom: 6px;
      }
      #sonder-context-chat-panel .sonder-message-content {
        font-size: 14px;
        line-height: 1.6;
        color: #0f172a;
      }
      #sonder-context-chat-panel .sonder-message-content.is-plain-text {
        white-space: pre-wrap;
        word-break: break-word;
      }
      #sonder-context-chat-panel .sonder-message-content .sonder-raw-markdown {
        margin: 0;
        overflow: auto;
        white-space: pre-wrap;
        word-break: break-word;
        padding: 12px 14px;
        border-radius: 12px;
        background: #f8fafc;
        color: #0f172a;
        border: 1px solid #e2e8f0;
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      }
      #sonder-context-chat-panel .sonder-message-content .sonder-raw-markdown code {
        background: transparent;
        color: inherit;
        padding: 0;
        border-radius: 0;
        white-space: inherit;
        font-family: inherit;
      }
      #sonder-context-chat-panel .sonder-message-content > :first-child {
        margin-top: 0;
      }
      #sonder-context-chat-panel .sonder-message-content > :last-child {
        margin-bottom: 0;
      }
      #sonder-context-chat-panel .sonder-message-content p,
      #sonder-context-chat-panel .sonder-message-content ul,
      #sonder-context-chat-panel .sonder-message-content ol,
      #sonder-context-chat-panel .sonder-message-content pre,
      #sonder-context-chat-panel .sonder-message-content blockquote,
      #sonder-context-chat-panel .sonder-message-content table {
        margin: 0 0 0.9em;
      }
      #sonder-context-chat-panel .sonder-message-content ul,
      #sonder-context-chat-panel .sonder-message-content ol {
        padding-left: 1.4em;
      }
      #sonder-context-chat-panel .sonder-message-content pre {
        overflow: auto;
        padding: 12px 14px;
        border-radius: 12px;
        background: #0f172a;
        color: #e2e8f0;
      }
      #sonder-context-chat-panel .sonder-message-content pre code {
        background: transparent;
        color: inherit;
        padding: 0;
        border-radius: 0;
        white-space: pre;
      }
      #sonder-context-chat-panel .sonder-message-content code {
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
        font-size: 0.92em;
        background: #e2e8f0;
        color: #0f172a;
        padding: 0.12em 0.35em;
        border-radius: 6px;
      }
      #sonder-context-chat-panel .sonder-message-content blockquote {
        border-left: 3px solid #93c5fd;
        margin-left: 0;
        padding-left: 12px;
        color: #334155;
      }
      #sonder-context-chat-panel .sonder-message-content table {
        border-collapse: collapse;
        width: 100%;
        display: block;
        overflow: auto;
      }
      #sonder-context-chat-panel .sonder-message-content th,
      #sonder-context-chat-panel .sonder-message-content td {
        border: 1px solid #cbd5e1;
        padding: 8px 10px;
        text-align: left;
        vertical-align: top;
      }
      #sonder-context-chat-panel .sonder-message-content th {
        background: #f8fafc;
      }
      #sonder-context-chat-panel .sonder-message-content .sonder-math-block {
        margin: 0 0 0.9em;
        overflow-x: auto;
        padding: 8px 0;
      }
      #sonder-context-chat-panel .sonder-message-content .sonder-math-block .katex,
      #sonder-context-chat-panel .sonder-message-content .sonder-inline-math .katex {
        color: #0f172a;
      }
      #sonder-context-chat-panel .sonder-message-content .sonder-math-block math[display="block"] {
        display: block;
      }
      #sonder-context-chat-panel .sonder-message-content .sonder-inline-math {
        display: inline-block;
        padding: 0 0.15em;
        vertical-align: middle;
      }
      #sonder-context-chat-panel .sonder-message-content math {
        font-size: 1.05em;
      }
      #sonder-context-chat-panel .sonder-message-content .sonder-plain-fallback {
        overflow: auto;
        white-space: pre-wrap;
        word-break: break-word;
        padding: 12px 14px;
        border-radius: 12px;
        background: #f8fafc;
        color: #0f172a;
        border: 1px solid #e2e8f0;
      }
      #sonder-context-chat-panel .sonder-citations {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        margin-top: 10px;
      }
      #sonder-context-chat-panel .sonder-citation-chip {
        border: 1px solid #cbd5e1;
        border-radius: 999px;
        background: #f8fafc;
        color: #334155;
        font-size: 12px;
        line-height: 1.3;
        padding: 6px 10px;
        cursor: pointer;
      }
      #sonder-context-chat-panel .sonder-citation-chip:hover {
        background: #eff6ff;
        border-color: #93c5fd;
        color: #1d4ed8;
      }
      #sonder-context-chat-panel .sonder-composer {
        border-top: 1px solid #e5e7eb;
        background: #ffffff;
        padding: 16px 20px 20px;
        display: flex;
        flex-direction: column;
        gap: 10px;
      }
      #sonder-context-chat-panel .sonder-composer-hint {
        font-size: 12px;
        color: #64748b;
      }
      #sonder-context-chat-panel .sonder-composer-input {
        min-height: 110px;
        resize: vertical;
        border-radius: 14px;
        border: 1px solid #cbd5e1;
        padding: 12px 14px;
        font-size: 14px;
        line-height: 1.5;
        color: #0f172a;
      }
      #sonder-context-chat-panel .sonder-composer-input:disabled {
        background: #f8fafc;
        color: #94a3b8;
      }
      #sonder-context-chat-panel .sonder-composer-actions {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
      }
      #sonder-context-chat-panel .sonder-composer-note {
        font-size: 12px;
        color: #94a3b8;
      }
      @media (max-width: 1100px) {
        #sonder-context-chat-panel {
          width: min(92vw, 760px);
          min-width: 340px;
        }
      }
    `;
    this.ownerWindow.document.documentElement.appendChild(style);
  }

  private buildLauncher() {
    const doc = this.ownerWindow.document;
    const button = createHTML(doc, "button");
    button.id = "sonder-context-chat-launcher";
    button.textContent = "Chat";
    button.addEventListener("click", () => {
      void this.openCurrentContext();
    });
    this.launcherButton = button;
    doc.documentElement.appendChild(button);
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

    const viewModeButton = createHTML(doc, "button");
    viewModeButton.className = "sonder-action";
    viewModeButton.addEventListener("click", () => {
      this.state.viewMode = this.state.viewMode == "raw" ? "preview" : "raw";
      this.render();
    });

    const closeButton = createHTML(doc, "button");
    closeButton.className = "sonder-close";
    closeButton.textContent = "Close";
    closeButton.addEventListener("click", () => {
      this.state.visible = false;
      this.state.historyOpen = false;
      this.render();
    });

    actionRow.append(historyButton, newSessionButton, clearSessionButton, viewModeButton, closeButton);

    const historyDrawer = createHTML(doc, "div");
    historyDrawer.className = "sonder-history-drawer";

    header.append(topRow, actionRow, historyDrawer);

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
    this.viewModeButton = viewModeButton;
    this.closeButton = closeButton;
    this.historyDrawer = historyDrawer;
    this.messageList = messageList;
    this.composerHint = composerHint;
    this.composerInput = composerInput;
    this.composerNote = composerNote;
    this.sendButton = sendButton;
  }

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
      this.state.error = "Open a PDF or select an annotation/note item, then click Chat.";
      this.render();
      return;
    }

    try {
      this.state.snapshot = itemPaperContext
        ? await this.store.getOrCreateItemPaperSession(itemPaperContext)
        : await this.store.getOrCreatePaperSession(paperContext!);
      this.state.loading = false;
      this.state.loadingPhase = undefined;
      this.state.error = undefined;
      this.syncPaperStatus();
    } catch (error: any) {
      this.state.loading = false;
      this.state.loadingPhase = undefined;
      this.state.snapshot = undefined;
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
      });
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

  private renderHistory() {
    this.historyDrawer.replaceChildren();
    const snapshot = this.state.snapshot;
    if (!snapshot) {
      this.historyDrawer.classList.remove("is-open");
      return;
    }

    this.historyDrawer.classList.toggle("is-open", this.state.historyOpen);
    if (!this.state.historyOpen) {
      return;
    }

    const doc = this.ownerWindow.document;
    const meta = createHTML(doc, "div");
    meta.className = "sonder-history-meta";
    meta.textContent = `${snapshot.sessions.length} saved session${snapshot.sessions.length == 1 ? "" : "s"} for this paper`;

    const list = createHTML(doc, "div");
    list.className = "sonder-history-list";

    snapshot.sessions.forEach((session) => {
      const button = createHTML(doc, "button");
      button.className = "sonder-history-item" + (session.id == snapshot.session.id ? " is-active" : "");
      button.addEventListener("click", () => {
        void this.loadSession(session.id);
      });

      const title = createHTML(doc, "div");
      title.className = "sonder-history-item-title";
      title.textContent = session.title;

      const subtitle = createHTML(doc, "div");
      subtitle.className = "sonder-history-item-subtitle";
      subtitle.textContent = `Updated ${formatTimestamp(session.updatedAt)} · ${session.provider || "provider"}${session.model ? ` / ${session.model}` : ""}`;

      button.append(title, subtitle);
      list.appendChild(button);
    });

    this.historyDrawer.append(meta, list);
  }

  private async jumpToCitation(citation: { sourceType: "paper" | "item"; target?: string; page?: number }) {
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
      (reader._iframeWindow as any).wrappedJSObject.eval(`
        (() => {
          const viewer = PDFViewerApplication.pdfViewer;
          PDFViewerApplication.page = ${resolvedPage};
          viewer.scrollPageIntoView({
            pageNumber: ${resolvedPage},
            destArray: [null, { name: "XYZ" }, 0, null, null],
            allowNegativeOffset: false,
            ignoreDestinationZoom: false
          });
        })()
      `);
    } catch (error: any) {
      Zotero.logError(error);
    }
  }

  private setRawMessageContent(node: HTMLDivElement, rawText: string) {
    node.classList.add("is-plain-text");
    node.replaceChildren();
    const pre = createHTML(node.ownerDocument, "pre");
    pre.className = "sonder-raw-markdown";
    const code = createHTML(node.ownerDocument, "code");
    code.textContent = rawText;
    pre.appendChild(code);
    node.appendChild(pre);
  }

  private setRenderedMessageContent(node: HTMLDivElement, rawText: string) {
    node.classList.remove("is-plain-text");
    node.replaceChildren();
    try {
      const html = renderMessageHTML(rawText);
      const parser = new DOMParser();
      const parsed = parser.parseFromString(`<div>${html}</div>`, "text/html");
      const wrapper = parsed.body.firstElementChild;
      if (!wrapper) {
        this.setRawMessageContent(node, rawText);
        return;
      }
      const fragment = node.ownerDocument.createDocumentFragment();
      Array.from(wrapper.childNodes).forEach((child) => {
        fragment.appendChild(node.ownerDocument.importNode(child as Node, true));
      });
      node.appendChild(fragment);
      const visibleText = (node.textContent || "").replace(/\s+/g, " ").trim();
      if (rawText.trim().length > 0 && visibleText.length == 0) {
        this.setRawMessageContent(node, rawText);
      }
    } catch {
      this.setRawMessageContent(node, rawText);
    }
  }

  private shouldRenderPreview(message: StoredMessage) {
    return this.state.viewMode == "preview" && message.role == "assistant" && message.id != "assistant-preview";
  }

  private getRenderedMessages(messages: StoredMessage[]) {
    if (!this.state.assistantPreviewText || !this.state.snapshot) {
      return messages;
    }
    return messages.concat({
      id: "assistant-preview",
      sessionId: this.state.snapshot.session.id,
      role: "assistant",
      content: this.state.assistantPreviewText,
      createdAt: Date.now(),
    });
  }

  private renderMessages(messages: StoredMessage[]) {
    this.messageList.replaceChildren();
    const doc = this.ownerWindow.document;
    const renderedMessages = this.getRenderedMessages(messages);

    if (renderedMessages.length == 0) {
      const empty = createHTML(doc, "div");
      empty.className = "sonder-empty-state";

      const title = createHTML(doc, "div");
      title.className = "sonder-empty-title";
      title.textContent = this.state.error
        ? "Context unavailable"
        : this.state.paperStatus == "preparing"
          ? "Preparing paper context"
          : this.state.snapshot?.context.type == "item+paper"
            ? "Item + Paper chat is ready"
            : "Paper chat is ready";

      const copy = createHTML(doc, "div");
      copy.className = "sonder-empty-copy";
      copy.textContent = this.state.error
        ? this.state.error
        : this.state.paperStatus == "preparing"
          ? "Sonder is reading the parent paper and preparing retrievable chunks in the background. You can wait for Ready or send immediately and the panel will wait for preparation."
          : this.state.snapshot?.context.type == "item+paper"
            ? "Ask about the selected annotation/note. Sonder will always force-inject the selected item content and use paper chunks as supplementary context."
            : "Ask your first question about the current paper. This conversation is persisted per paper, and reopening the same PDF restores the latest session automatically.";

      const copy2 = createHTML(doc, "div");
      copy2.className = "sonder-empty-copy";
      copy2.textContent = this.state.error
        ? "Activate a PDF reader tab or select an annotation/note item, then click Chat again to resolve context."
        : "Assistant output is shown as raw markdown by default. Use the Preview button in the header to switch rendered preview on and off.";

      empty.append(title, copy, copy2);
      this.messageList.appendChild(empty);
      return;
    }

    renderedMessages.forEach((message) => {
      const node = createHTML(doc, "div");
      node.className = "sonder-message";
      node.classList.add(message.role == "user" ? "is-user" : "is-assistant");
      if (message.id == "assistant-preview") {
        node.classList.add("is-streaming");
      }

      const role = createHTML(doc, "div");
      role.className = "sonder-message-role";
      role.textContent = message.role == "user" ? "You" : "Sonder";

      const content = createHTML(doc, "div");
      content.className = "sonder-message-content";
      if (this.shouldRenderPreview(message)) {
        this.setRenderedMessageContent(content, message.content);
      } else {
        this.setRawMessageContent(content, message.content);
      }

      node.append(role, content);

      if (message.citations?.length) {
        const citations = createHTML(doc, "div");
        citations.className = "sonder-citations";
        message.citations.forEach((citation) => {
          const chip = createHTML(doc, "button");
          chip.className = "sonder-citation-chip";
          chip.textContent = citation.label;
          if (citation.preview) {
            chip.title = citation.preview;
          }
          chip.addEventListener("click", () => {
            void this.jumpToCitation(citation);
          });
          citations.appendChild(chip);
        });
        node.appendChild(citations);
      }

      this.messageList.appendChild(node);
    });
  }

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
      : "Open a PDF reader tab or select an annotation/note, then click Chat";
    this.composerHint.textContent = this.getComposerHint();
    this.composerNote.textContent = !hasContext
      ? "Paper context is required before you can send a message."
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
      return "Open a PDF or select an annotation/note to start";
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

  private render() {
    const snapshot = this.state.snapshot;
    const hasContext = Boolean(snapshot);
    this.panel.style.display = this.state.visible ? "flex" : "none";
    this.launcherButton.style.display = this.state.visible ? "none" : "";

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
    this.viewModeButton.disabled = false;
    this.viewModeButton.textContent = this.state.viewMode == "raw" ? "Preview" : "Raw Markdown";
    this.viewModeButton.title = this.state.viewMode == "raw"
      ? "Render assistant markdown for preview"
      : "Show the raw markdown source for assistant messages";
    this.viewModeButton.classList.toggle("is-active", this.state.viewMode == "preview");
    this.closeButton.disabled = false;

    this.renderHistory();
    this.renderMessages(snapshot?.messages || []);
    this.syncComposerState();
    if (this.state.visible) {
      this.scrollMessagesToEnd();
    }
  }
}

export default ContextChatPanel;
