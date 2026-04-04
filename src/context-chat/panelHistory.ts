import { SessionSnapshot, StoredInsight } from "./types";

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

export interface HistoryRenderContext {
  ownerWindow: Window;
  historyDrawer: HTMLDivElement;
  snapshot: SessionSnapshot | undefined;
  historyOpen: boolean;
  historySearch: string;
  setHistorySearch: (value: string) => void;
  renamingSessionId: string | undefined;
  renamingSessionDraft: string;
  setRenamingSessionDraft: (value: string) => void;
  insightsLoading: boolean;
  insights: StoredInsight[];
  loadSession: (sessionId: string) => void;
  deleteSession: (sessionId: string) => void;
  beginRenameSession: (sessionId: string, currentTitle: string) => void;
  cancelRenameSession: () => void;
  confirmRenameSession: (sessionId: string) => void;
}

export function renderHistoryDrawer(ctx: HistoryRenderContext): void {
  ctx.historyDrawer.replaceChildren();
  const snapshot = ctx.snapshot;
  if (!snapshot) {
    ctx.historyDrawer.classList.remove("is-open");
    return;
  }

  ctx.historyDrawer.classList.toggle("is-open", ctx.historyOpen);
  if (!ctx.historyOpen) {
    return;
  }

  const doc = ctx.ownerWindow.document;
  const searchTerm = ctx.historySearch.trim().toLowerCase();
  const filteredSessions = searchTerm
    ? snapshot.sessions.filter((session) => {
        const haystack = `${session.title} ${session.provider || ""} ${session.model || ""}`.toLowerCase();
        return haystack.includes(searchTerm);
      })
    : snapshot.sessions;

  const meta = createHTML(doc, "div");
  meta.className = "sonder-history-meta";
  meta.textContent = `${filteredSessions.length} of ${snapshot.sessions.length} saved session${snapshot.sessions.length == 1 ? "" : "s"} for this paper`;

  const searchInput = createHTML(doc, "input");
  searchInput.className = "sonder-history-search";
  searchInput.type = "search";
  searchInput.placeholder = "Search sessions by title/model";
  searchInput.value = ctx.historySearch;
  searchInput.addEventListener("input", (event) => {
    ctx.setHistorySearch(searchInput.value);
    const inputEvent = event as InputEvent;
    if (inputEvent.isComposing) {
      return;
    }
    const cursor = searchInput.selectionStart ?? ctx.historySearch.length;
    renderHistoryDrawer(ctx);
    const nextInput = ctx.historyDrawer.querySelector(".sonder-history-search") as HTMLInputElement | null;
    if (nextInput) {
      nextInput.focus();
      const pos = Math.min(cursor, nextInput.value.length);
      try {
        nextInput.setSelectionRange(pos, pos);
      } catch {
        // ignore
      }
    }
  });
  searchInput.addEventListener("compositionend", () => {
    ctx.setHistorySearch(searchInput.value);
    renderHistoryDrawer(ctx);
    const nextInput = ctx.historyDrawer.querySelector(".sonder-history-search") as HTMLInputElement | null;
    nextInput?.focus();
  });

  const list = createHTML(doc, "div");
  list.className = "sonder-history-list";

  filteredSessions.forEach((session) => {
    const item = createHTML(doc, "div");
    item.className = "sonder-history-item" + (session.id == snapshot.session.id ? " is-active" : "");

    const subtitle = createHTML(doc, "div");
    subtitle.className = "sonder-history-item-subtitle";
    subtitle.textContent = `Updated ${formatTimestamp(session.updatedAt)} · ${session.provider || "provider"}${session.model ? ` / ${session.model}` : ""}`;

    const actions = createHTML(doc, "div");
    actions.className = "sonder-history-session-actions";

    if (ctx.renamingSessionId == session.id) {
      item.classList.remove("is-clickable");
      item.removeAttribute("role");
      item.removeAttribute("tabindex");

      const renameInput = createHTML(doc, "input");
      renameInput.className = "sonder-history-rename-input";
      renameInput.type = "text";
      renameInput.value = ctx.renamingSessionDraft;
      renameInput.setAttribute("data-session-id", session.id);
      renameInput.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
      });
      renameInput.addEventListener("input", () => {
        ctx.setRenamingSessionDraft(renameInput.value);
      });
      renameInput.addEventListener("keydown", (event) => {
        const composing = (event as any).isComposing || (event as any).keyCode == 229;
        if (event.key == "Enter") {
          if (composing) {
            return;
          }
          event.preventDefault();
          event.stopPropagation();
          ctx.confirmRenameSession(session.id);
        }
        if (event.key == "Escape") {
          event.preventDefault();
          event.stopPropagation();
          ctx.cancelRenameSession();
        }
      });

      const saveButton = createHTML(doc, "button");
      saveButton.className = "sonder-action sonder-action-small";
      saveButton.textContent = "Save";
      saveButton.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        ctx.confirmRenameSession(session.id);
      });

      const cancelButton = createHTML(doc, "button");
      cancelButton.className = "sonder-action sonder-action-small";
      cancelButton.textContent = "Cancel";
      cancelButton.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        ctx.cancelRenameSession();
      });

      actions.append(saveButton, cancelButton);
      item.append(renameInput, subtitle, actions);
    } else {
      item.classList.add("is-clickable");
      item.setAttribute("role", "button");
      item.setAttribute("tabindex", "0");
      item.addEventListener("click", () => {
        ctx.loadSession(session.id);
      });
      item.addEventListener("keydown", (event) => {
        if (event.target !== item) {
          return;
        }
        if (event.key == "Enter" || event.key == " ") {
          event.preventDefault();
          ctx.loadSession(session.id);
        }
      });

      const title = createHTML(doc, "div");
      title.className = "sonder-history-item-title";
      title.textContent = session.title;

      const renameButton = createHTML(doc, "button");
      renameButton.className = "sonder-action sonder-action-small";
      renameButton.textContent = "Rename";
      renameButton.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        ctx.beginRenameSession(session.id, session.title);
      });

      const deleteButton = createHTML(doc, "button");
      deleteButton.className = "sonder-action sonder-action-small is-danger";
      deleteButton.textContent = "Delete";
      deleteButton.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        ctx.deleteSession(session.id);
      });

      actions.append(renameButton, deleteButton);
      item.append(title, subtitle, actions);
    }

    list.appendChild(item);
  });

  if (filteredSessions.length == 0) {
    const empty = createHTML(doc, "div");
    empty.className = "sonder-history-item-subtitle";
    empty.textContent = searchTerm ? "No sessions match your search." : "No saved sessions for this context yet.";
    list.appendChild(empty);
  }

  const insightsMeta = createHTML(doc, "div");
  insightsMeta.className = "sonder-history-meta";
  insightsMeta.style.marginTop = "10px";
  if (ctx.insightsLoading) {
    insightsMeta.textContent = "Insights for this item: loading…";
  } else {
    insightsMeta.textContent = `Insights for this item: ${ctx.insights.length}`;
  }

  const insightsList = createHTML(doc, "div");
  insightsList.className = "sonder-history-list";

  if (!ctx.insightsLoading && ctx.insights.length == 0) {
    const empty = createHTML(doc, "div");
    empty.className = "sonder-history-item-subtitle";
    empty.textContent = "No saved insights yet for this item.";
    insightsList.appendChild(empty);
  }

  ctx.insights.forEach((insight) => {
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
      ctx.loadSession(insight.sessionId);
    });

    item.append(title, subtitle, preview, openButton);
    insightsList.appendChild(item);
  });

  ctx.historyDrawer.append(meta, searchInput, list, insightsMeta, insightsList);
}
