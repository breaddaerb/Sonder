import ContextChatService, { PaperContextStatus } from "./chatService";
import { canSendDraft } from "./chatMessages";
import { resolveSelectedItemPaperContextWithSource } from "./itemPaperContext";
import { resolveCurrentPaperContext } from "./paperContext";
import { clearCodexLogin, finishCodexOAuthLogin, getCodexLoginReport, startCodexOAuthLogin } from "../modules/Meet/CodexOAuth";
import { getCurrentModel, getProvider, hasCodexCredentials, setProvider, getCustomApiConfig, setCustomApiConfig, hasCustomApiConfig, clearCustomApiConfig, getCustomApiStatusLabel } from "../modules/provider";
import { testCustomApiConnection } from "../modules/Meet/OpenAI";
import { renderMessageHTML } from "./render";
import ContextChatStore from "./storage";
import { appendInsightMarkerForContext } from "./insightMarker";
import { SessionSnapshot, StoredInsight, StoredMessage } from "./types";

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
  private customApiButton!: HTMLButtonElement;
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
    savedInsightsByMessage: Record<string, string>;
    insights: StoredInsight[];
    insightsLoading: boolean;
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
    style.textContent = `
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
        position: relative;
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
        padding-left: 34px;
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
        gap: 10px;
      }
      #sonder-context-chat-panel .sonder-action-group {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        padding: 4px;
        border-radius: 12px;
        background: #f8fafc;
        border: 1px solid #e2e8f0;
      }
      #sonder-context-chat-panel .sonder-header-spacer {
        flex: 1;
      }
      #sonder-context-chat-panel .sonder-action,
      #sonder-context-chat-panel .sonder-close,
      #sonder-context-chat-panel .sonder-send {
        border: 1px solid #dbe2ea;
        background: #fff;
        color: #0f172a;
        border-radius: 10px;
        padding: 8px 12px;
        font-size: 12px;
        font-weight: 600;
        line-height: 1;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
      }
      #sonder-context-chat-panel .sonder-close {
        position: absolute;
        top: 10px;
        left: 10px;
        padding: 6px 8px;
        min-width: 28px;
        z-index: 3;
      }
      #sonder-context-chat-panel .sonder-action:hover,
      #sonder-context-chat-panel .sonder-close:hover,
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
        gap: 10px;
        border-top: 1px solid #e5e7eb;
        padding-top: 12px;
        background: #f8fafc;
        border-radius: 12px;
        padding: 12px;
        width: 100%;
        box-sizing: border-box;
        align-self: stretch;
      }
      #sonder-context-chat-panel .sonder-history-drawer.is-open {
        display: flex;
      }
      #sonder-context-chat-panel .sonder-history-meta {
        width: 100%;
        font-size: 12px;
        color: #64748b;
      }
      #sonder-context-chat-panel .sonder-history-list {
        display: flex;
        flex-direction: column;
        gap: 8px;
        max-height: 220px;
        overflow: auto;
        width: 100%;
      }
      #sonder-context-chat-panel .sonder-history-item {
        width: 100%;
        box-sizing: border-box;
        border: 1px solid #dbe2ea;
        background: #fff;
        color: #0f172a;
        border-radius: 10px;
        padding: 10px 12px;
        text-align: left;
        display: block;
      }
      #sonder-context-chat-panel .sonder-history-item.is-clickable {
        cursor: pointer;
      }
      #sonder-context-chat-panel .sonder-history-item.is-clickable:hover {
        background: #f8fafc;
      }
      #sonder-context-chat-panel .sonder-history-item.is-active {
        border-color: #1d4ed8;
        background: rgba(29, 78, 216, 0.06);
      }
      #sonder-context-chat-panel .sonder-history-item.is-clickable:focus-visible {
        outline: 2px solid #93c5fd;
        outline-offset: 1px;
      }
      #sonder-context-chat-panel .sonder-history-item-title {
        display: block;
        margin-bottom: 4px;
        font-size: 13px;
        font-weight: 700;
      }
      #sonder-context-chat-panel .sonder-history-item-subtitle {
        display: block;
        font-size: 12px;
        line-height: 1.4;
        color: #64748b;
      }
      #sonder-context-chat-panel .sonder-message-list {
        flex: 1;
        overflow: auto;
        padding: 20px;
        background: #f8fafc;
        -moz-user-select: text;
        user-select: text;
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
      #sonder-context-chat-panel .sonder-message-meta {
        margin-bottom: 6px;
      }
      #sonder-context-chat-panel .sonder-message-role {
        font-size: 11px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        color: #64748b;
      }
      #sonder-context-chat-panel .sonder-message-footer {
        display: flex;
        justify-content: flex-end;
        align-items: center;
        gap: 8px;
        margin-top: 8px;
      }
      #sonder-context-chat-panel .sonder-icon-button {
        border: 1px solid #dbe2ea;
        background: #fff;
        color: #334155;
        border-radius: 8px;
        width: 28px;
        height: 28px;
        font-size: 13px;
        line-height: 1;
        white-space: nowrap;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
      }
      #sonder-context-chat-panel .sonder-icon-button:hover {
        background: #f8fafc;
      }
      #sonder-context-chat-panel .sonder-icon-button.is-active {
        background: rgba(29, 78, 216, 0.08);
        border-color: #93c5fd;
        color: #1d4ed8;
      }
      #sonder-context-chat-panel .sonder-text-action {
        border: 1px solid #dbe2ea;
        background: #fff;
        color: #334155;
        border-radius: 8px;
        height: 28px;
        padding: 0 8px;
        font-size: 12px;
        line-height: 1;
        white-space: nowrap;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
      }
      #sonder-context-chat-panel .sonder-text-action:hover {
        background: #f8fafc;
      }
      #sonder-context-chat-panel .sonder-subtle-text {
        font-size: 11px;
        color: #64748b;
      }
      #sonder-context-chat-panel .sonder-message-content {
        font-size: 14px;
        line-height: 1.6;
        color: #0f172a;
        -moz-user-select: text;
        user-select: text;
      }
      #sonder-context-chat-panel .sonder-message-content,
      #sonder-context-chat-panel .sonder-message-content * {
        -moz-user-select: text;
        user-select: text;
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
    sessionGroup.append(historyButton, newSessionButton, clearSessionButton);

    const providerGroup = createHTML(doc, "div");
    providerGroup.className = "sonder-action-group";

    const codexAuthButton = createHTML(doc, "button");
    codexAuthButton.className = "sonder-action";
    codexAuthButton.addEventListener("click", () => {
      void this.handleCodexAuth();
    });

    const customApiButton = createHTML(doc, "button");
    customApiButton.className = "sonder-action";
    customApiButton.addEventListener("click", () => {
      void this.handleCustomApiConfig();
    });
    providerGroup.append(codexAuthButton, customApiButton);

    const spacer = createHTML(doc, "div");
    spacer.className = "sonder-header-spacer";

    const closeButton = createHTML(doc, "button");
    closeButton.className = "sonder-close";
    closeButton.textContent = "❯";
    closeButton.title = "Fold panel";
    closeButton.addEventListener("click", () => {
      this.state.visible = false;
      this.state.historyOpen = false;
      this.render();
    });

    actionRow.append(sessionGroup, providerGroup, spacer);

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
    this.customApiButton = customApiButton;
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
      await this.refreshInsightsForCurrentContext();
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
        await this.refreshInsightsForCurrentContext();
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
        await this.refreshInsightsForCurrentContext();
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

  private async handleCodexAuth() {
    try {
      let provider = getProvider();
      if (provider != "openai-codex") {
        const shouldSwitch = this.ownerWindow.confirm("Switch provider to openai-codex and start Codex OAuth login?");
        if (!shouldSwitch) {
          return;
        }
        setProvider("openai-codex");
        provider = "openai-codex";
      }

      const report = getCodexLoginReport();
      if (report.hasPendingLogin) {
        const pasted = this.ownerWindow.prompt("Paste the redirect URL (or authorization code) to finish Codex login:", "");
        if (!pasted) {
          return;
        }
        const credentials = await finishCodexOAuthLogin(pasted);
        this.ownerWindow.alert(`Codex login succeeded. accountId: ${credentials.accountId.slice(0, 6)}... model: ${getCurrentModel("openai-codex")}`);
        this.render();
        return;
      }

      if (hasCodexCredentials()) {
        const shouldLogout = this.ownerWindow.confirm("Codex is already logged in. Logout now?");
        if (!shouldLogout) {
          return;
        }
        clearCodexLogin();
        this.ownerWindow.alert("Cleared Codex OAuth credentials.");
        this.render();
        return;
      }

      const auth = await startCodexOAuthLogin();
      Zotero.launchURL(auth.url);
      this.ownerWindow.alert([
        "Opened ChatGPT login page in your browser.",
        "",
        "After browser redirect fails on localhost (expected), copy the full URL.",
        "Then click 'Finish Login' in panel header and paste it.",
      ].join("\n"));
      this.render();
    } catch (error: any) {
      this.ownerWindow.alert(String(error?.message || error || "Codex auth failed."));
      this.render();
    }
  }

  private async handleCustomApiConfig() {
    try {
      const provider = getProvider();

      // If already configured, offer reconfigure or clear
      if (provider == "openai-api" && hasCustomApiConfig()) {
        const currentCfg = getCustomApiConfig();
        const action = this.ownerWindow.confirm(
          `Custom API is configured:\n\nBase URL: ${currentCfg.baseUrl}\nModel: ${currentCfg.model}\n\nClick OK to reconfigure, or Cancel to clear the current configuration.`
        );
        if (!action) {
          const shouldClear = this.ownerWindow.confirm("Clear the current custom API configuration?");
          if (shouldClear) {
            clearCustomApiConfig();
            this.ownerWindow.alert("Custom API configuration cleared.");
          }
          this.render();
          return;
        }
      }

      // If currently on Codex, ask to switch
      if (provider == "openai-codex") {
        const shouldSwitch = this.ownerWindow.confirm("Switch provider from Codex to custom API?");
        if (!shouldSwitch) {
          return;
        }
        setProvider("openai-api");
      }

      // Step 1: Base URL
      const currentCfg = getCustomApiConfig();
      const baseUrl = this.ownerWindow.prompt(
        "Enter the API base URL (OpenAI-compatible endpoint):",
        currentCfg.baseUrl || "https://api.openai.com"
      );
      if (baseUrl === null) {
        return;
      }
      const trimmedBaseUrl = baseUrl.trim();
      if (!trimmedBaseUrl) {
        this.ownerWindow.alert("Base URL cannot be empty.");
        return;
      }

      // Step 2: API Key
      const existingKeyHint = currentCfg.apiKey
        ? `${currentCfg.apiKey.slice(0, 4)}${"*".repeat(Math.min(20, Math.max(0, currentCfg.apiKey.length - 8)))}${currentCfg.apiKey.slice(-4)}`
        : "";
      const apiKey = this.ownerWindow.prompt(
        "Enter your API key:",
        existingKeyHint
      );
      if (apiKey === null) {
        return;
      }
      const trimmedApiKey = apiKey.trim();
      if (!trimmedApiKey) {
        this.ownerWindow.alert("API key cannot be empty.");
        return;
      }
      // If user didn't change the masked key, keep the original
      const finalApiKey = trimmedApiKey === existingKeyHint ? currentCfg.apiKey : trimmedApiKey;

      // Step 3: Model Name
      const model = this.ownerWindow.prompt(
        "Enter the model name (e.g. gpt-4o, deepseek-chat, claude-3.5-sonnet):",
        currentCfg.model || "gpt-4o"
      );
      if (model === null) {
        return;
      }
      const trimmedModel = model.trim();
      if (!trimmedModel) {
        this.ownerWindow.alert("Model name cannot be empty.");
        return;
      }

      // Step 4: Test Connection
      this.ownerWindow.alert("Testing connection... This may take a few seconds.");
      const result = await testCustomApiConnection(trimmedBaseUrl, finalApiKey, trimmedModel);

      if (result.success) {
        setCustomApiConfig({ baseUrl: trimmedBaseUrl, apiKey: finalApiKey, model: trimmedModel });
        this.ownerWindow.alert(`Connection successful!\n\nModel: ${result.model}\nBase URL: ${trimmedBaseUrl}\n\nConfiguration saved.`);
        // Re-initialize context to clear any stale error state from paper
        // preparation that may have failed while blocking config dialogs were open.
        void this.openCurrentContext();
        return;
      } else {
        this.ownerWindow.alert(`Connection failed:\n\n${result.error}\n\nConfiguration was NOT saved. Please check your base URL, API key, and model name.`);
      }
      this.render();
    } catch (error: any) {
      this.ownerWindow.alert(String(error?.message || error || "Custom API configuration failed."));
      this.render();
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
        await this.refreshInsightsForCurrentContext();
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
      const item = createHTML(doc, "div");
      item.className = "sonder-history-item is-clickable" + (session.id == snapshot.session.id ? " is-active" : "");
      item.setAttribute("role", "button");
      item.setAttribute("tabindex", "0");
      item.addEventListener("click", () => {
        void this.loadSession(session.id);
      });
      item.addEventListener("keydown", (event) => {
        if (event.key == "Enter" || event.key == " ") {
          event.preventDefault();
          void this.loadSession(session.id);
        }
      });

      const title = createHTML(doc, "div");
      title.className = "sonder-history-item-title";
      title.textContent = session.title;

      const subtitle = createHTML(doc, "div");
      subtitle.className = "sonder-history-item-subtitle";
      subtitle.textContent = `Updated ${formatTimestamp(session.updatedAt)} · ${session.provider || "provider"}${session.model ? ` / ${session.model}` : ""}`;

      item.append(title, subtitle);
      list.appendChild(item);
    });

    const insightsMeta = createHTML(doc, "div");
    insightsMeta.className = "sonder-history-meta";
    insightsMeta.style.marginTop = "10px";
    if (this.state.insightsLoading) {
      insightsMeta.textContent = "Insights for this item: loading…";
    } else {
      insightsMeta.textContent = `Insights for this item: ${this.state.insights.length}`;
    }

    const insightsList = createHTML(doc, "div");
    insightsList.className = "sonder-history-list";

    if (!this.state.insightsLoading && this.state.insights.length == 0) {
      const empty = createHTML(doc, "div");
      empty.className = "sonder-history-item-subtitle";
      empty.textContent = "No saved insights yet for this item.";
      insightsList.appendChild(empty);
    }

    this.state.insights.forEach((insight) => {
      const item = createHTML(doc, "div");
      item.className = "sonder-history-item";

      const title = createHTML(doc, "div");
      title.className = "sonder-history-item-title";
      title.textContent = insight.id;

      const subtitle = createHTML(doc, "div");
      subtitle.className = "sonder-history-item-subtitle";
      subtitle.textContent = `${formatTimestamp(insight.createdAt)}${insight.annotationKey ? ` · annotation ${insight.annotationKey}` : ""}`;

      const preview = createHTML(doc, "div");
      preview.className = "sonder-history-item-subtitle";
      preview.textContent = insight.content.slice(0, 140);

      const openButton = createHTML(doc, "button");
      openButton.className = "sonder-action";
      openButton.style.marginTop = "6px";
      openButton.textContent = "Open Session";
      openButton.addEventListener("click", () => {
        void this.loadSession(insight.sessionId);
      });

      item.append(title, subtitle, preview, openButton);
      insightsList.appendChild(item);
    });

    this.historyDrawer.append(meta, list, insightsMeta, insightsList);
  }

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
      const yPos = citation.yOffset ?? "null";
      (reader._iframeWindow as any).wrappedJSObject.eval(`
        (() => {
          const viewer = PDFViewerApplication.pdfViewer;
          PDFViewerApplication.page = ${resolvedPage};
          viewer.scrollPageIntoView({
            pageNumber: ${resolvedPage},
            destArray: [null, { name: "XYZ" }, 0, ${yPos}, null],
            allowNegativeOffset: false,
            ignoreDestinationZoom: false
          });
        })()
      `);
    } catch (error: any) {
      Zotero.logError(error);
    }
  }

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

  private getInsightScopeForContext(context: SessionSnapshot["context"]) {
    const itemKey = context.itemKey || context.paperKey;
    return {
      itemKey,
      libraryID: context.libraryID,
      annotationKey: context.type == "item+paper" && context.itemKind == "annotation" ? context.itemKey : undefined,
    };
  }

  private async refreshInsightsForCurrentContext() {
    const context = this.state.snapshot?.context;
    if (!context) {
      this.state.insights = [];
      this.state.insightsLoading = false;
      return;
    }

    const { itemKey, libraryID } = this.getInsightScopeForContext(context);
    if (!itemKey) {
      this.state.insights = [];
      this.state.insightsLoading = false;
      return;
    }

    this.state.insightsLoading = true;
    this.render();
    try {
      this.state.insights = await this.store.listInsightsByItemKey(itemKey, libraryID);
    } catch (error: any) {
      Zotero.logError(error);
      this.state.insights = [];
    } finally {
      this.state.insightsLoading = false;
      this.render();
    }
  }

  private async saveInsightFromMessage(message: StoredMessage, button: HTMLButtonElement) {
    const snapshot = this.state.snapshot;
    if (!snapshot) {
      return;
    }

    const context = snapshot.context;
    const { itemKey, libraryID, annotationKey } = this.getInsightScopeForContext(context);
    if (!itemKey) {
      this.ownerWindow.alert("Unable to save insight: no item context is available.");
      return;
    }

    try {
      const insight = await this.store.createInsight({
        itemKey,
        libraryID,
        annotationKey,
        sessionId: snapshot.session.id,
        messageId: message.id,
        content: message.content,
      });

      await appendInsightMarkerForContext(context, insight.id);

      this.state.savedInsightsByMessage[message.id] = insight.id;
      const previous = button.textContent;
      button.textContent = "✓";
      this.ownerWindow.setTimeout(() => {
        button.textContent = previous;
      }, 1200);
      await this.refreshInsightsForCurrentContext();
      this.render();
    } catch (error: any) {
      Zotero.logError(error);
      this.ownerWindow.alert(String(error?.message || error || "Failed to save insight."));
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
        ? "Activate a PDF or snapshot reader tab, or select an annotation/note item, then click Chat again to resolve context."
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

      const meta = createHTML(doc, "div");
      meta.className = "sonder-message-meta";

      const role = createHTML(doc, "div");
      role.className = "sonder-message-role";
      role.textContent = message.role == "user" ? "You" : "Sonder";
      meta.appendChild(role);

      const content = createHTML(doc, "div");
      content.className = "sonder-message-content";
      if (this.shouldRenderPreview(message)) {
        this.setRenderedMessageContent(content, message.content);
      } else {
        this.setRawMessageContent(content, message.content);
      }

      node.append(meta, content);

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

      if (message.role == "assistant" && message.id != "assistant-preview") {
        const footer = createHTML(doc, "div");
        footer.className = "sonder-message-footer";

        const viewToggleButton = createHTML(doc, "button");
        viewToggleButton.className = "sonder-icon-button";
        viewToggleButton.textContent = this.state.viewMode == "raw" ? "👁" : "📝";
        viewToggleButton.title = this.state.viewMode == "raw"
          ? "Switch to Preview"
          : "Switch to Raw Markdown";
        viewToggleButton.classList.toggle("is-active", this.state.viewMode == "preview");
        viewToggleButton.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          this.state.viewMode = this.state.viewMode == "raw" ? "preview" : "raw";
          this.render();
        });

        const copyButton = createHTML(doc, "button");
        copyButton.className = "sonder-icon-button";
        copyButton.textContent = "⧉";
        copyButton.title = "Copy raw markdown";
        copyButton.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          void this.copyMessageContent(message.content, copyButton);
        });

        const saveInsightButton = createHTML(doc, "button");
        saveInsightButton.className = "sonder-text-action";
        saveInsightButton.textContent = "Save";
        saveInsightButton.title = "Save insight";
        saveInsightButton.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          void this.saveInsightFromMessage(message, saveInsightButton);
        });

        const savedInsightId = this.state.savedInsightsByMessage[message.id];
        const savedLabel = createHTML(doc, "span");
        savedLabel.className = "sonder-subtle-text";
        savedLabel.textContent = savedInsightId ? `Saved insight: ${savedInsightId}` : "";

        footer.append(viewToggleButton, copyButton, saveInsightButton, savedLabel);
        node.appendChild(footer);
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

    this.customApiButton.disabled = this.state.loading;
    const apiLabel = getCustomApiStatusLabel();
    this.customApiButton.textContent = apiLabel;
    this.customApiButton.title = hasCustomApiConfig() && provider == "openai-api"
      ? "Reconfigure or clear the custom API endpoint"
      : "Configure a custom OpenAI-compatible API endpoint (base URL + API key + model)";
    this.customApiButton.classList.toggle("is-active", provider == "openai-api" && hasCustomApiConfig());

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
