const MarkdownIt = require("markdown-it");
const katex = require("katex");

const markdown = new MarkdownIt({
  breaks: true,
  linkify: true,
  html: false,
  typographer: true,
});

function escapeHTML(text: string) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderKatexMath(expression: string, displayMode: boolean) {
  try {
    return katex.renderToString(expression.trim(), {
      displayMode,
      throwOnError: false,
      strict: "ignore",
      output: "mathml",
    });
  } catch {
    return "";
  }
}

function createMathBlockHTML(expression: string) {
  const rendered = renderKatexMath(expression, true);
  if (rendered) {
    return [
      '<div class="sonder-math-block">',
      rendered,
      '</div>',
    ].join("");
  }
  const escaped = escapeHTML(expression.trim());
  return [
    '<div class="sonder-math-block">',
    '<div class="sonder-math-label">Equation</div>',
    `<pre><code class="language-math">${escaped}</code></pre>`,
    '</div>',
  ].join("");
}

function createInlineMathHTML(expression: string) {
  const rendered = renderKatexMath(expression, false);
  if (rendered) {
    return `<span class="sonder-inline-math">${rendered}</span>`;
  }
  return `<code class="sonder-inline-math">${escapeHTML(expression.trim())}</code>`;
}

function preprocessMath(text: string) {
  let index = 0;
  const placeholders: Array<{ token: string; html: string }> = [];
  const pushPlaceholder = (html: string) => {
    const token = `SONDER_MATH_TOKEN_${index++}`;
    placeholders.push({ token, html });
    return token;
  };

  let next = text
    .replace(/\$\$([\s\S]+?)\$\$/g, (_match: string, expression: string) => {
      return `\n\n${pushPlaceholder(createMathBlockHTML(expression))}\n\n`;
    })
    .replace(/\\\[([\s\S]+?)\\\]/g, (_match: string, expression: string) => {
      return `\n\n${pushPlaceholder(createMathBlockHTML(expression))}\n\n`;
    })
    .replace(/\\\((.+?)\\\)/g, (_match: string, expression: string) => {
      return pushPlaceholder(createInlineMathHTML(expression));
    })
    .replace(/(^|[^$])\$([^$\n]+?)\$(?!\$)/g, (_match: string, prefix: string, expression: string) => {
      return `${prefix}${pushPlaceholder(createInlineMathHTML(expression))}`;
    });

  return {
    text: next,
    placeholders,
  };
}

function renderPlainFallback(text: string) {
  const escaped = escapeHTML(text || "");
  return `<pre class="sonder-plain-fallback"><code>${escaped}</code></pre>`;
}

export function renderMessageHTML(text: string) {
  const source = text || "";
  try {
    const prepared = preprocessMath(source);
    let html = markdown.render(prepared.text);
    prepared.placeholders.forEach((placeholder) => {
      html = html.replace(`<p>${placeholder.token}</p>`, placeholder.html);
      html = html.replace(placeholder.token, placeholder.html);
    });
    if (source.trim().length > 0 && html.replace(/<[^>]+>/g, "").trim().length == 0) {
      return renderPlainFallback(source);
    }
    return html || renderPlainFallback(source);
  } catch {
    return renderPlainFallback(source);
  }
}
