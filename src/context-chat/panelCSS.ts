export const PANEL_CSS = `
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
        flex-direction: column;
        align-items: flex-start;
        gap: 8px;
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
      #sonder-context-chat-panel .sonder-action-group.is-provider-row {
        margin-left: 0;
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
      #sonder-context-chat-panel .sonder-action.sonder-action-small {
        padding: 6px 10px;
        font-size: 11px;
      }
      #sonder-context-chat-panel .sonder-action.is-danger {
        color: #b91c1c;
        border-color: #fecaca;
        background: #fff5f5;
      }
      #sonder-context-chat-panel .sonder-action.is-danger:hover {
        background: #fee2e2;
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
      #sonder-context-chat-panel .sonder-history-search {
        width: 100%;
        box-sizing: border-box;
        border: 1px solid #dbe2ea;
        border-radius: 8px;
        padding: 8px 10px;
        font-size: 12px;
        background: #fff;
        color: #0f172a;
      }
      #sonder-context-chat-panel .sonder-history-rename-input {
        width: 100%;
        box-sizing: border-box;
        border: 1px solid #93c5fd;
        border-radius: 8px;
        padding: 8px 10px;
        font-size: 13px;
        background: #fff;
        color: #0f172a;
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
      #sonder-context-chat-panel .sonder-history-session-actions {
        margin-top: 8px;
        display: flex;
        gap: 6px;
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
