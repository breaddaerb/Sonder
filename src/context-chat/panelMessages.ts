import { renderMessageHTML } from "./render";
import { PaperContextStatus } from "./chatService";
import { SessionSnapshot, StoredMessage } from "./types";

const HTML_NS = "http://www.w3.org/1999/xhtml";

function createHTML<K extends keyof HTMLElementTagNameMap>(doc: Document, tagName: K) {
  return doc.createElementNS(HTML_NS, tagName) as HTMLElementTagNameMap[K];
}

export interface MessageRenderContext {
  ownerWindow: Window;
  messageList: HTMLDivElement;
  snapshot: SessionSnapshot | undefined;
  viewMode: "raw" | "preview";
  setViewMode: (mode: "raw" | "preview") => void;
  assistantPreviewText: string;
  paperStatus: PaperContextStatus;
  error: string | undefined;
  savedInsightsByMessage: Record<string, string>;
  copyMessageContent: (rawText: string, button: HTMLButtonElement) => void;
  saveInsightFromMessage: (message: StoredMessage, button: HTMLButtonElement) => void;
  jumpToCitation: (citation: { sourceType: "paper" | "item"; target?: string; page?: number; yOffset?: number }) => void;
  render: () => void;
}

function setRawMessageContent(node: HTMLDivElement, rawText: string) {
  node.classList.add("is-plain-text");
  node.replaceChildren();
  const pre = createHTML(node.ownerDocument, "pre");
  pre.className = "sonder-raw-markdown";
  const code = createHTML(node.ownerDocument, "code");
  code.textContent = rawText;
  pre.appendChild(code);
  node.appendChild(pre);
}

function setRenderedMessageContent(node: HTMLDivElement, rawText: string) {
  node.classList.remove("is-plain-text");
  node.replaceChildren();
  try {
    const html = renderMessageHTML(rawText);
    const parser = new DOMParser();
    const parsed = parser.parseFromString(`<div>${html}</div>`, "text/html");
    const wrapper = parsed.body.firstElementChild;
    if (!wrapper) {
      setRawMessageContent(node, rawText);
      return;
    }
    const fragment = node.ownerDocument.createDocumentFragment();
    Array.from(wrapper.childNodes).forEach((child) => {
      fragment.appendChild(node.ownerDocument.importNode(child as Node, true));
    });
    node.appendChild(fragment);
    const visibleText = (node.textContent || "").replace(/\s+/g, " ").trim();
    if (rawText.trim().length > 0 && visibleText.length == 0) {
      setRawMessageContent(node, rawText);
    }
  } catch {
    setRawMessageContent(node, rawText);
  }
}

function getRenderedMessages(ctx: MessageRenderContext, messages: StoredMessage[]): StoredMessage[] {
  if (!ctx.assistantPreviewText || !ctx.snapshot) {
    return messages;
  }
  return messages.concat({
    id: "assistant-preview",
    sessionId: ctx.snapshot.session.id,
    role: "assistant",
    content: ctx.assistantPreviewText,
    createdAt: Date.now(),
  });
}

export function renderMessageList(ctx: MessageRenderContext, messages: StoredMessage[]) {
  ctx.messageList.replaceChildren();
  const doc = ctx.ownerWindow.document;
  const renderedMessages = getRenderedMessages(ctx, messages);

  if (renderedMessages.length == 0) {
    const empty = createHTML(doc, "div");
    empty.className = "sonder-empty-state";

    const title = createHTML(doc, "div");
    title.className = "sonder-empty-title";
    title.textContent = ctx.error
      ? "Context unavailable"
      : ctx.paperStatus == "preparing"
        ? "Preparing paper context"
        : ctx.snapshot?.context.type == "item+paper"
          ? "Item + Paper chat is ready"
          : "Paper chat is ready";

    const copy = createHTML(doc, "div");
    copy.className = "sonder-empty-copy";
    copy.textContent = ctx.error
      ? ctx.error
      : ctx.paperStatus == "preparing"
        ? "Sonder is reading the parent paper and preparing retrievable chunks in the background. You can wait for Ready or send immediately and the panel will wait for preparation."
        : ctx.snapshot?.context.type == "item+paper"
          ? "Ask about the selected annotation/note. Sonder will always force-inject the selected item content and use paper chunks as supplementary context."
          : "Ask your first question about the current paper. This conversation is persisted per paper, and reopening the same PDF restores the latest session automatically.";

    const copy2 = createHTML(doc, "div");
    copy2.className = "sonder-empty-copy";
    copy2.textContent = ctx.error
      ? "Activate a PDF or snapshot reader tab, or select an annotation/note item, then click Chat again to resolve context."
      : "Assistant output is shown as raw markdown by default. Use the Preview button in the header to switch rendered preview on and off.";

    empty.append(title, copy, copy2);
    ctx.messageList.appendChild(empty);
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
    if (ctx.viewMode == "preview" && message.role == "assistant" && message.id != "assistant-preview") {
      setRenderedMessageContent(content, message.content);
    } else {
      setRawMessageContent(content, message.content);
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
          ctx.jumpToCitation(citation);
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
      viewToggleButton.textContent = ctx.viewMode == "raw" ? "👁" : "📝";
      viewToggleButton.title = ctx.viewMode == "raw"
        ? "Switch to Preview"
        : "Switch to Raw Markdown";
      viewToggleButton.classList.toggle("is-active", ctx.viewMode == "preview");
      viewToggleButton.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        ctx.setViewMode(ctx.viewMode == "raw" ? "preview" : "raw");
        ctx.render();
      });

      const copyButton = createHTML(doc, "button");
      copyButton.className = "sonder-icon-button";
      copyButton.textContent = "⧉";
      copyButton.title = "Copy raw markdown";
      copyButton.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        ctx.copyMessageContent(message.content, copyButton);
      });

      const saveInsightButton = createHTML(doc, "button");
      saveInsightButton.className = "sonder-text-action";
      saveInsightButton.textContent = "Save";
      saveInsightButton.title = "Save insight";
      saveInsightButton.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        ctx.saveInsightFromMessage(message, saveInsightButton);
      });

      const savedInsightId = ctx.savedInsightsByMessage[message.id];
      const savedLabel = createHTML(doc, "span");
      savedLabel.className = "sonder-subtle-text";
      savedLabel.textContent = savedInsightId ? `Saved insight: ${savedInsightId}` : "";

      footer.append(viewToggleButton, copyButton, saveInsightButton, savedLabel);
      node.appendChild(footer);
    }

    ctx.messageList.appendChild(node);
  });
}
