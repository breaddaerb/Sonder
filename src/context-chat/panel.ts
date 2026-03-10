import ContextChatStore from "./storage";
import { resolveCurrentPaperContext } from "./paperContext";
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

export class ContextChatPanel {
  private launcherButton!: HTMLButtonElement;
  private panel!: HTMLDivElement;
  private badge!: HTMLSpanElement;
  private title!: HTMLDivElement;
  private sessionTitle!: HTMLDivElement;
  private status!: HTMLSpanElement;
  private historyButton!: HTMLButtonElement;
  private newSessionButton!: HTMLButtonElement;
  private closeButton!: HTMLButtonElement;
  private historyDrawer!: HTMLDivElement;
  private messageList!: HTMLDivElement;
  private composerHint!: HTMLDivElement;
  private composerInput!: HTMLTextAreaElement;
  private sendButton!: HTMLButtonElement;

  private state: {
    visible: boolean;
    loading: boolean;
    historyOpen: boolean;
    snapshot?: SessionSnapshot;
    error?: string;
  } = {
    visible: false,
    loading: false,
    historyOpen: false,
  };

  constructor(private readonly ownerWindow: Window, private readonly store: ContextChatStore) {}

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
        width: min(46vw, 760px);
        min-width: 420px;
        height: 100vh;
        display: none;
        flex-direction: column;
        background: #ffffff;
        color: #111827;
        box-shadow: -18px 0 48px rgba(15, 23, 42, 0.18);
        border-left: 1px solid rgba(148, 163, 184, 0.2);
        font-family: Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
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
      #sonder-context-chat-panel .sonder-message-role {
        font-size: 11px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        color: #64748b;
        margin-bottom: 6px;
      }
      #sonder-context-chat-panel .sonder-message-content {
        white-space: pre-wrap;
        font-size: 14px;
        line-height: 1.6;
        color: #0f172a;
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
      void this.openCurrentPaper();
    });
    this.launcherButton = button;
    doc.documentElement.appendChild(button);
  }

  private buildPanel() {
    const doc = this.ownerWindow.document;
    const panel = createHTML(doc, "div");
    panel.id = "sonder-context-chat-panel";

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

    const closeButton = createHTML(doc, "button");
    closeButton.className = "sonder-close";
    closeButton.textContent = "Close";
    closeButton.addEventListener("click", () => {
      this.state.visible = false;
      this.state.historyOpen = false;
      this.render();
    });

    actionRow.append(historyButton, newSessionButton, closeButton);

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
    composerInput.placeholder = "Message sending will be connected in the next milestone.";

    const composerActions = createHTML(doc, "div");
    composerActions.className = "sonder-composer-actions";

    const composerNote = createHTML(doc, "div");
    composerNote.className = "sonder-composer-note";
    composerNote.textContent = "M1 shell: the composer is mounted, but transport wiring comes next.";

    const sendButton = createHTML(doc, "button");
    sendButton.className = "sonder-send";
    sendButton.textContent = "Send";
    sendButton.disabled = true;
    sendButton.title = "Message sending will be connected in a later milestone.";

    composerActions.append(composerNote, sendButton);
    composer.append(composerHint, composerInput, composerActions);

    panel.append(header, messageList, composer);
    doc.documentElement.appendChild(panel);

    this.panel = panel;
    this.badge = badge;
    this.title = title;
    this.sessionTitle = sessionTitle;
    this.status = status;
    this.historyButton = historyButton;
    this.newSessionButton = newSessionButton;
    this.closeButton = closeButton;
    this.historyDrawer = historyDrawer;
    this.messageList = messageList;
    this.composerHint = composerHint;
    this.composerInput = composerInput;
    this.sendButton = sendButton;
  }

  private async openCurrentPaper() {
    this.state.visible = true;
    this.state.loading = true;
    this.state.error = undefined;
    this.state.historyOpen = false;
    this.render();

    const paperContext = resolveCurrentPaperContext();
    if (!paperContext) {
      this.state.loading = false;
      this.state.snapshot = undefined;
      this.state.error = "Open a PDF reader tab, then click Chat to start a paper session.";
      this.render();
      return;
    }

    try {
      this.state.snapshot = await this.store.getOrCreatePaperSession(paperContext);
      this.state.loading = false;
      this.state.error = undefined;
    } catch (error: any) {
      this.state.loading = false;
      this.state.snapshot = undefined;
      this.state.error = String(error?.message || error || "Failed to open paper session.");
      Zotero.logError(error);
    }
    this.render();
  }

  private async createNewSession() {
    const contextId = this.state.snapshot?.context.id;
    if (!contextId) {
      return;
    }
    this.state.loading = true;
    this.render();
    try {
      const snapshot = await this.store.createNewSession(contextId);
      if (snapshot) {
        this.state.snapshot = snapshot;
      }
      this.state.historyOpen = false;
      this.state.error = undefined;
    } catch (error: any) {
      Zotero.logError(error);
      this.state.error = "Failed to create a new session.";
    } finally {
      this.state.loading = false;
      this.render();
    }
  }

  private async loadSession(sessionId: string) {
    this.state.loading = true;
    this.render();
    try {
      const snapshot = await this.store.getSessionSnapshot(sessionId);
      if (snapshot) {
        this.state.snapshot = snapshot;
      }
      this.state.historyOpen = false;
      this.state.error = undefined;
    } catch (error: any) {
      Zotero.logError(error);
      this.state.error = "Failed to load session history.";
    } finally {
      this.state.loading = false;
      this.render();
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

  private renderMessages(messages: StoredMessage[]) {
    this.messageList.replaceChildren();
    const doc = this.ownerWindow.document;

    if (messages.length == 0) {
      const empty = createHTML(doc, "div");
      empty.className = "sonder-empty-state";

      const title = createHTML(doc, "div");
      title.className = "sonder-empty-title";
      title.textContent = this.state.error ? "Paper context unavailable" : "Paper session shell is ready";

      const copy = createHTML(doc, "div");
      copy.className = "sonder-empty-copy";
      copy.textContent = this.state.error
        ? this.state.error
        : "This is the new persisted paper-session shell. Reopening the same paper restores the latest session, and New Session creates another thread for the same paper.";

      const copy2 = createHTML(doc, "div");
      copy2.className = "sonder-empty-copy";
      copy2.textContent = this.state.error
        ? "Once a PDF reader tab is active, click Chat again and Sonder will resolve the paper context explicitly."
        : "The composer is intentionally mounted but not yet connected to provider transport in this milestone. The legacy command surface still remains available while the new panel is being rewritten.";

      empty.append(title, copy, copy2);
      this.messageList.appendChild(empty);
      return;
    }

    messages.forEach((message) => {
      const node = createHTML(doc, "div");
      node.className = "sonder-message";

      const role = createHTML(doc, "div");
      role.className = "sonder-message-role";
      role.textContent = message.role;

      const content = createHTML(doc, "div");
      content.className = "sonder-message-content";
      content.textContent = message.content;

      node.append(role, content);
      this.messageList.appendChild(node);
    });
  }

  private render() {
    const snapshot = this.state.snapshot;
    const hasContext = Boolean(snapshot);
    this.panel.style.display = this.state.visible ? "flex" : "none";
    this.launcherButton.style.display = this.state.visible ? "none" : "";

    this.badge.textContent = hasContext ? "Paper" : "Paper chat";
    this.title.textContent = hasContext ? snapshot!.context.title : "Open a PDF to start a paper session";
    this.sessionTitle.textContent = hasContext
      ? `${snapshot!.session.title} · Updated ${formatTimestamp(snapshot!.session.updatedAt)}`
      : "Persisted session shell";

    this.status.textContent = this.state.error
      ? "Failed"
      : this.state.loading
        ? "Preparing context…"
        : hasContext
          ? "Ready"
          : "Awaiting paper";
    this.status.classList.toggle("is-pending", this.state.loading && !this.state.error);
    this.status.classList.toggle("is-error", Boolean(this.state.error));

    this.historyButton.disabled = !hasContext || this.state.loading;
    this.newSessionButton.disabled = !hasContext || this.state.loading;
    this.closeButton.disabled = false;

    this.composerInput.disabled = !hasContext;
    this.composerInput.value = "";
    this.composerHint.textContent = hasContext
      ? "Chatting with current paper"
      : "Open a PDF reader tab and click Chat to resolve paper context";
    this.sendButton.disabled = true;

    this.renderHistory();
    this.renderMessages(snapshot?.messages || []);
  }
}

export default ContextChatPanel;
