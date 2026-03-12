import { Citation } from "./types";
import { isSnapshotAttachment } from "./paperContext";

export interface PaperChunk {
  id: string;
  page: number;
  label: string;
  content: string;
}

export interface PreparedPaperContext {
  contextId: string;
  paperKey: string;
  title: string;
  preparedAt: number;
  chunks: PaperChunk[];
}

function normalizeText(text: string) {
  return text.replace(/\s+/g, " ").trim();
}

function mergeSameLine(items: PDFItem[]) {
  const lines: PDFLine[] = [];
  items.forEach((item) => {
    const text = item.str?.trim();
    if (!text) {
      return;
    }
    const x = Number(item.transform[4].toFixed(1));
    const y = Number(item.transform[5].toFixed(1));
    const width = Math.abs(item.width);
    const line = lines[lines.length - 1];
    if (line && Math.abs(line.y - y) <= Math.max(1.5, item.height * 0.35)) {
      line.text += (line.text.endsWith("-") ? "" : " ") + text;
      line.width += width;
      line._height.push(item.height);
      return;
    }
    lines.push({
      x,
      y,
      text,
      height: item.height,
      _height: [item.height],
      width,
      url: item.url,
    });
  });
  return lines;
}

function chunkText(pageText: string, page: number, maxChars: number = 1800) {
  const normalized = normalizeText(pageText);
  if (!normalized) {
    return [] as PaperChunk[];
  }

  const paragraphs = (normalized.match(/[^.!?]+[.!?]?/g) || [normalized])
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
  const chunks: PaperChunk[] = [];
  let buffer = "";
  let chunkIndex = 0;

  const pushBuffer = () => {
    const content = normalizeText(buffer);
    if (!content) {
      buffer = "";
      return;
    }
    chunkIndex += 1;
    chunks.push({
      id: `p${page}-c${chunkIndex}`,
      page,
      label: `p.${page}`,
      content,
    });
    buffer = "";
  };

  paragraphs.forEach((paragraph) => {
    if (paragraph.length > maxChars) {
      if (buffer) {
        pushBuffer();
      }
      for (let offset = 0; offset < paragraph.length; offset += maxChars) {
        buffer = paragraph.slice(offset, offset + maxChars);
        pushBuffer();
      }
      return;
    }
    if ((buffer + " " + paragraph).trim().length > maxChars) {
      pushBuffer();
    }
    buffer = (buffer ? `${buffer} ${paragraph}` : paragraph).trim();
  });
  pushBuffer();
  return chunks;
}

function fallbackQueryTokens(queryText: string) {
  const tokens = (queryText.toLowerCase().match(/[a-z0-9]{2,}|[\u4e00-\u9fff]{1,8}/g) || [])
    .map((token) => token.trim())
    .filter(Boolean);
  return [...new Set(tokens)];
}

function scoreChunk(queryText: string, chunk: PaperChunk) {
  const text = chunk.content.toLowerCase();
  const query = queryText.toLowerCase().trim();
  const tokens = fallbackQueryTokens(queryText);
  let score = 0;
  if (query.length > 0 && text.indexOf(query) >= 0) {
    score += 120;
  }
  tokens.forEach((token) => {
    const matches = text.split(token).length - 1;
    score += Math.min(matches, 6) * Math.max(1, token.length / 2);
  });
  score += Math.min(chunk.content.length / 500, 6);
  return score;
}

export function selectRelevantPaperChunks(queryText: string, chunks: PaperChunk[], maxChunks: number = 5) {
  return [...chunks]
    .map((chunk) => ({ chunk, score: scoreChunk(queryText, chunk) }))
    .sort((a, b) => b.score - a.score || a.chunk.page - b.chunk.page)
    .slice(0, maxChunks)
    .map((entry) => entry.chunk)
    .sort((a, b) => a.page - b.page || a.id.localeCompare(b.id));
}

export function createPaperChunkCitations(chunks: PaperChunk[]): Citation[] {
  return chunks.map((chunk, index) => ({
    id: chunk.id,
    label: `[${index + 1}] ${chunk.label}`,
    sourceType: "paper",
    target: `page:${chunk.page}`,
    page: chunk.page,
    preview: chunk.content.slice(0, 220),
  }));
}

export function buildPaperGroundedUserMessage(args: {
  title: string;
  question: string;
  chunks: PaperChunk[];
}) {
  const contextText = args.chunks.length > 0
    ? args.chunks.map((chunk, index) => `[${index + 1}] (${chunk.label}) ${chunk.content}`).join("\n\n")
    : "(No paper chunks were retrieved.)";
  return [
    `You are helping the user chat with the paper titled: ${args.title}`,
    "Use the retrieved paper context below as your primary grounding for factual claims about the paper.",
    "If the retrieved context is insufficient, say so briefly and then answer carefully.",
    "When referring to retrieved context, cite chunk numbers like [1] or [2].",
    "Format the answer in clean markdown that stays easy to read and easy to copy into tools like Notion.",
    "Use headings/lists/tables when helpful. Use fenced code blocks for code.",
    "For math, prefer standard markdown math delimiters: use $...$ for inline equations and $$...$$ for standalone block equations.",
    "Avoid mixing prose and bare un-delimited LaTeX when proper math delimiters can be used.",
    "",
    "Retrieved paper context:",
    contextText,
    "",
    `User question: ${args.question}`,
  ].join("\n");
}

export function buildItemPaperGroundedUserMessage(args: {
  paperTitle: string;
  itemKind: "annotation" | "note";
  itemText: string;
  question: string;
  chunks: PaperChunk[];
}) {
  const contextText = args.chunks.length > 0
    ? args.chunks.map((chunk, index) => `[${index + 1}] (${chunk.label}) ${chunk.content}`).join("\n\n")
    : "(No paper chunks were retrieved.)";
  const itemLabel = args.itemKind == "annotation" ? "Selected annotation" : "Selected note";
  return [
    `You are helping the user chat with a selected ${args.itemKind} from the paper titled: ${args.paperTitle}`,
    `${itemLabel} (must be treated as primary anchor):`,
    args.itemText,
    "",
    "Always address the selected item directly first, then use paper context as supplementary evidence.",
    "The selected item content is mandatory context and must never be ignored.",
    "When referring to retrieved paper context, cite chunk numbers like [1] or [2].",
    "Format the answer in clean markdown that stays easy to read and easy to copy into tools like Notion.",
    "Use headings/lists/tables when helpful. Use fenced code blocks for code.",
    "For math, prefer standard markdown math delimiters: use $...$ for inline equations and $$...$$ for standalone block equations.",
    "",
    "Supplementary paper context:",
    contextText,
    "",
    `User question: ${args.question}`,
  ].join("\n");
}

/**
 * Strip HTML tags from a raw HTML string and extract clean text content.
 * Removes script, style, and other non-content elements before extracting text.
 */
function extractTextFromHtmlString(html: string): string {
  if (!html) {
    return "";
  }

  // Remove script and style blocks entirely (including content)
  let cleaned = html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "");

  // Remove nav, header, footer blocks (best-effort for common patterns)
  cleaned = cleaned
    .replace(/<nav[\s\S]*?<\/nav>/gi, "")
    .replace(/<footer[\s\S]*?<\/footer>/gi, "");

  // Replace block-level tags with newlines to preserve paragraph structure
  cleaned = cleaned
    .replace(/<\/?(p|div|br|h[1-6]|li|tr|blockquote|section|article|main|aside|pre|hr)[^>]*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ");

  // Decode common HTML entities
  cleaned = cleaned
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#x27;/gi, "'")
    .replace(/&#(\d+);/g, (_match, code) => String.fromCharCode(Number(code)));

  // Normalize whitespace
  return cleaned
    .replace(/[ \t]+/g, " ")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Try to extract text from the reader's iframe DOM, traversing nested iframes
 * that Zotero's snapshot reader may use to display the actual HTML content.
 */
function extractSnapshotTextFromDom(iframeWindow: any): string {
  try {
    // Strategy 1: Direct document access (may work for simple readers)
    const doc = iframeWindow?.document || iframeWindow?.wrappedJSObject?.document;
    if (doc?.body) {
      const directText = (doc.body.textContent || "").replace(/\s+/g, " ").trim();
      if (directText.length > 200) {
        return directText;
      }

      // Strategy 2: Look for nested iframes that contain the actual snapshot content
      const iframes = doc.querySelectorAll("iframe") as NodeListOf<HTMLIFrameElement>;
      for (let i = 0; i < iframes.length; i++) {
        try {
          const nestedDoc = iframes[i].contentDocument || (iframes[i] as any).contentWindow?.document;
          if (nestedDoc?.body) {
            const nestedText = (nestedDoc.body.textContent || "").replace(/\s+/g, " ").trim();
            if (nestedText.length > 200) {
              return nestedText;
            }
          }
        } catch {
          // Cross-origin or dead wrapper — skip
        }
      }

      // Strategy 3: Try wrappedJSObject for privileged access to nested iframes
      try {
        const wrappedDoc = iframeWindow?.wrappedJSObject?.document;
        if (wrappedDoc) {
          const wrappedIframes = wrappedDoc.querySelectorAll("iframe");
          for (let i = 0; i < wrappedIframes.length; i++) {
            try {
              const nestedDoc = wrappedIframes[i].contentDocument;
              if (nestedDoc?.body) {
                const nestedText = (nestedDoc.body.textContent || "").replace(/\s+/g, " ").trim();
                if (nestedText.length > 200) {
                  return nestedText;
                }
              }
            } catch {
              // Skip inaccessible frames
            }
          }
        }
      } catch {
        // wrappedJSObject access failed
      }

      // Return whatever direct text we got, even if short
      if (directText.length > 0) {
        return directText;
      }
    }
  } catch (error: any) {
    Zotero.logError(error);
  }
  return "";
}

/**
 * Read the HTML snapshot file from disk and extract text content.
 * This is the primary extraction strategy since it doesn't depend on
 * the reader's iframe DOM structure.
 */
async function extractSnapshotTextFromFile(attachment: Zotero.Item): Promise<string> {
  try {
    const filePath = await (attachment as any).getFilePathAsync();
    if (!filePath) {
      return "";
    }

    // Check if the file exists
    if (!(await OS.File.exists(filePath))) {
      return "";
    }

    const htmlContent = await Zotero.File.getContentsAsync(filePath) as string;
    if (!htmlContent) {
      return "";
    }

    return extractTextFromHtmlString(htmlContent);
  } catch (error: any) {
    Zotero.logError(error);
    return "";
  }
}

/**
 * Read text chunks from an HTML snapshot attachment.
 * Uses a multi-strategy approach:
 * 1. Primary: Read HTML file from disk and parse text (most reliable)
 * 2. Fallback: Extract from reader iframe DOM (traversing nested iframes)
 * If both strategies yield no text, returns empty chunks (status will still be "ready").
 */
async function readSnapshotChunks(
  reader: _ZoteroTypes.ReaderInstance,
  attachment: Zotero.Item,
  expectedAttachmentKey: string,
  contextId: string,
  title: string,
): Promise<PreparedPaperContext> {
  // Strategy 1: Read from file (most reliable)
  let text = await extractSnapshotTextFromFile(attachment);

  // Strategy 2: Try DOM extraction as fallback
  if (!text && reader._iframeWindow) {
    text = extractSnapshotTextFromDom(reader._iframeWindow);
  }

  // Chunk whatever text we got (may be empty — that's OK, status will be "ready")
  const chunks = text ? chunkText(text, 1) : [];

  return {
    contextId,
    paperKey: expectedAttachmentKey,
    title,
    preparedAt: Date.now(),
    chunks,
  };
}

/**
 * Read text chunks from a PDF attachment via the active reader's PDF viewer.
 */
async function readPdfChunks(
  reader: _ZoteroTypes.ReaderInstance,
  expectedAttachmentKey: string,
  contextId: string,
  title: string,
): Promise<PreparedPaperContext> {
  const PDFViewerApplication = (reader._iframeWindow as any).wrappedJSObject.PDFViewerApplication;
  await PDFViewerApplication.pdfLoadingTask.promise;
  await PDFViewerApplication.pdfViewer.pagesPromise;

  const pages = PDFViewerApplication.pdfViewer._pages || [];
  const chunks: PaperChunk[] = [];
  for (let pageIndex = 0; pageIndex < pages.length; pageIndex++) {
    const pdfPage = pages[pageIndex].pdfPage;
    const textContent = await pdfPage.getTextContent();
    const items = (textContent.items as PDFItem[]).filter((item) => item.str?.trim().length);
    const lines = mergeSameLine(items);
    const pageText = lines.map((line) => line.text).join("\n");
    chunks.push(...chunkText(pageText, pageIndex + 1));
  }

  return {
    contextId,
    paperKey: expectedAttachmentKey,
    title,
    preparedAt: Date.now(),
    chunks,
  };
}

export async function readCurrentReaderPaperChunks(expectedAttachmentKey: string, contextId: string, title: string) {
  const reader = await ztoolkit.Reader.getReader() as _ZoteroTypes.ReaderInstance;
  if (!reader?.itemID) {
    throw new Error("No active reader is available to prepare context.");
  }
  const attachment = Zotero.Items.get(reader.itemID as number);
  if (!attachment || attachment.key != expectedAttachmentKey) {
    throw new Error("The active reader does not match the current context.");
  }

  if (attachment.isPDFAttachment()) {
    return await readPdfChunks(reader, expectedAttachmentKey, contextId, title);
  }

  if (isSnapshotAttachment(attachment)) {
    return await readSnapshotChunks(reader, attachment, expectedAttachmentKey, contextId, title);
  }

  const contentType = (attachment as any).attachmentContentType || "unknown";
  throw new Error(
    `Unsupported attachment type (${contentType}). Context chat currently supports PDF and webpage snapshot attachments.`
  );
}
