import { Citation, PageRange } from "./types";
import { isSnapshotAttachment } from "./paperContext";

export interface PaperChunk {
  id: string;
  page: number;
  label: string;
  content: string;
  /** Y-coordinate of the first text line in this chunk (PDF coordinate system, origin bottom-left). */
  topY?: number;
  /** Y-coordinate of the last text line in this chunk (PDF coordinate system, origin bottom-left). */
  bottomY?: number;
}

export interface PreparedPaperContext {
  contextId: string;
  paperKey: string;
  title: string;
  preparedAt: number;
  chunks: PaperChunk[];
  sourceKind: "pdf" | "snapshot";
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

/** A text line with its y-coordinate from PDF text extraction. */
interface PositionedLine {
  text: string;
  y: number;
}

/**
 * Build chunks from lines that carry y-coordinates, so each chunk records
 * the y-position of its first contributing line.
 * This enables fine-grained scroll-to-position when clicking citation chips.
 */
function chunkLinesWithPosition(lines: PositionedLine[], page: number, maxChars: number = 1800): PaperChunk[] {
  if (lines.length === 0) {
    return [];
  }

  const chunks: PaperChunk[] = [];
  let buffer = "";
  let bufferFirstY: number | undefined;
  let bufferLastY: number | undefined;
  let chunkIndex = 0;

  const pushBuffer = () => {
    const content = normalizeText(buffer);
    if (!content) {
      buffer = "";
      bufferFirstY = undefined;
      bufferLastY = undefined;
      return;
    }
    chunkIndex += 1;
    chunks.push({
      id: `p${page}-c${chunkIndex}`,
      page,
      label: `p.${page}`,
      content,
      topY: bufferFirstY,
      bottomY: bufferLastY,
    });
    buffer = "";
    bufferFirstY = undefined;
    bufferLastY = undefined;
  };

  lines.forEach((line) => {
    const text = normalizeText(line.text);
    if (!text) {
      return;
    }

    if ((buffer + " " + text).trim().length > maxChars) {
      if (buffer) {
        pushBuffer();
      }
      // If a single line exceeds maxChars, split it into sub-chunks
      if (text.length > maxChars) {
        for (let offset = 0; offset < text.length; offset += maxChars) {
          buffer = text.slice(offset, offset + maxChars);
          if (bufferFirstY === undefined) {
            bufferFirstY = line.y;
          }
          bufferLastY = line.y;
          pushBuffer();
        }
        return;
      }
    }

    if (bufferFirstY === undefined) {
      bufferFirstY = line.y;
    }
    bufferLastY = line.y;
    buffer = (buffer ? `${buffer} ${text}` : text).trim();
  });
  pushBuffer();
  return chunks;
}

/**
 * Build a single page-level chunk from positioned lines.
 * Aggregates all text on the page into one chunk, preserving the y-coordinates
 * of the first and last lines for citation scroll positioning.
 */
export function chunkByPage(lines: PositionedLine[], page: number): PaperChunk | null {
  const nonEmptyLines = lines.filter((line) => normalizeText(line.text).length > 0);
  if (nonEmptyLines.length === 0) {
    return null;
  }
  const content = nonEmptyLines.map((line) => normalizeText(line.text)).join(" ");
  const normalized = normalizeText(content);
  if (!normalized) {
    return null;
  }
  return {
    id: `p${page}-c1`,
    page,
    label: `p.${page}`,
    content: normalized,
    topY: nonEmptyLines[0].y,
    bottomY: nonEmptyLines[nonEmptyLines.length - 1].y,
  };
}

/**
 * Build a single page-level chunk from plain text (no y-coordinates).
 * Used for snapshot attachments where positional data is unavailable.
 */
export function chunkByPageFromText(text: string, page: number): PaperChunk | null {
  const normalized = normalizeText(text);
  if (!normalized) {
    return null;
  }
  return {
    id: `p${page}-c1`,
    page,
    label: `p.${page}`,
    content: normalized,
  };
}

/**
 * Filter chunks to only include pages within the given range (inclusive).
 * If no range is provided, returns all chunks unchanged.
 */
export function filterChunksByPageRange(chunks: PaperChunk[], pageRange?: PageRange): PaperChunk[] {
  if (!pageRange) {
    return chunks;
  }
  return chunks.filter(
    (chunk) => chunk.page >= pageRange.startPage && chunk.page <= pageRange.endPage,
  );
}

/**
 * Parse citation markers from model response text.
 * Supports standalone markers like [1], [2] as well as grouped/comma-separated
 * forms like [1, 2], [1,2,3], [1, 3, 5].
 * Returns a sorted array of unique 1-based indices that fall within the valid range.
 */
export function parseCitedIndices(responseText: string, maxIndex: number): number[] {
  const cited = new Set<number>();
  // Match bracket groups that contain digits and commas/spaces, e.g. [1], [1, 2], [1,2,3]
  const bracketPattern = /\[([\d,\s]+)\]/g;
  let match: RegExpExecArray | null;
  while ((match = bracketPattern.exec(responseText)) !== null) {
    const inner = match[1];
    // Extract all numbers from within the bracket group
    const numbers = inner.match(/\d+/g);
    if (numbers) {
      for (const numStr of numbers) {
        const index = Number(numStr);
        if (index >= 1 && index <= maxIndex) {
          cited.add(index);
        }
      }
    }
  }
  return [...cited].sort((a, b) => a - b);
}

/**
 * Create citation objects from paper chunks.
 * If `originalIndices` is provided, each entry is the original 1-based index
 * used in the model's response text, so the chip label matches the citation marker.
 * If not provided, sequential 1-based labels are used.
 */
export function createPaperChunkCitations(chunks: PaperChunk[], originalIndices?: number[]): Citation[] {
  return chunks.map((chunk, i) => {
    const displayIndex = originalIndices ? originalIndices[i] : i + 1;
    return {
      id: chunk.id,
      label: `[${displayIndex}] ${chunk.label}`,
      sourceType: "paper" as const,
      target: `page:${chunk.page}`,
      page: chunk.page,
      yOffset: chunk.topY,
      yOffsetBottom: chunk.bottomY,
      preview: chunk.content.slice(0, 220),
    };
  });
}

const FORMAT_INSTRUCTIONS = [
  "When referring to specific parts of the paper, cite page numbers like [1] or [2] (these correspond to the numbered sections below).",
  "Format the answer in clean markdown that stays easy to read and easy to copy into tools like Notion.",
  "Use headings/lists/tables when helpful. Use fenced code blocks for code.",
  "For math, prefer standard markdown math delimiters: use $...$ for inline equations and $...$ for standalone block equations.",
  "Avoid mixing prose and bare un-delimited LaTeX when proper math delimiters can be used.",
].join("\n");

function buildChunkContextText(chunks: PaperChunk[]) {
  return chunks.length > 0
    ? chunks.map((chunk, index) => `[${index + 1}] (${chunk.label}) ${chunk.content}`).join("\n\n")
    : "(No paper content was extracted.)";
}

/**
 * Build a system-level message containing paper context and instructions.
 * This should be pinned at the start of every request to enable prompt prefix caching.
 */
export function buildPaperSystemMessage(args: {
  title: string;
  chunks: PaperChunk[];
}) {
  return [
    `You are helping the user chat with the paper titled: ${args.title}`,
    "The complete paper text is provided below (one section per page). Use it as your primary grounding for factual claims about the paper.",
    FORMAT_INSTRUCTIONS,
    "",
    "Full paper content:",
    buildChunkContextText(args.chunks),
  ].join("\n");
}

/**
 * Build a system-level message for item+paper context.
 * Includes the selected annotation/note as primary anchor plus the full paper.
 */
export function buildItemPaperSystemMessage(args: {
  paperTitle: string;
  itemKind: "annotation" | "note";
  itemText: string;
  chunks: PaperChunk[];
}) {
  const itemLabel = args.itemKind == "annotation" ? "Selected annotation" : "Selected note";
  return [
    `You are helping the user chat with a selected ${args.itemKind} from the paper titled: ${args.paperTitle}`,
    `${itemLabel} (must be treated as primary anchor):`,
    args.itemText,
    "",
    "Always address the selected item directly first, then use the full paper content as supplementary evidence.",
    "The selected item content is mandatory context and must never be ignored.",
    FORMAT_INSTRUCTIONS,
    "",
    "Full paper content:",
    buildChunkContextText(args.chunks),
  ].join("\n");
}

export function buildPaperGroundedUserMessage(args: {
  title: string;
  question: string;
  chunks: PaperChunk[];
}) {
  return [
    buildPaperSystemMessage({ title: args.title, chunks: args.chunks }),
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
  return [
    buildItemPaperSystemMessage({
      paperTitle: args.paperTitle,
      itemKind: args.itemKind,
      itemText: args.itemText,
      chunks: args.chunks,
    }),
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
    const visited = new Set<any>();
    const collected: string[] = [];

    const collectFromDocument = (doc: Document | undefined | null) => {
      if (!doc?.body) {
        return;
      }
      const text = (doc.body.textContent || "").replace(/\s+/g, " ").trim();
      if (text.length > 0) {
        collected.push(text);
      }
      const iframes = doc.querySelectorAll("iframe") as NodeListOf<HTMLIFrameElement>;
      for (let i = 0; i < iframes.length; i++) {
        try {
          const nestedWindow = (iframes[i] as any).contentWindow;
          if (nestedWindow) {
            collectFromWindow(nestedWindow);
          }
          const nestedDoc = iframes[i].contentDocument;
          if (nestedDoc) {
            collectFromDocument(nestedDoc);
          }
        } catch {
          // ignore inaccessible nested frame
        }
      }
    };

    const collectFromWindow = (win: any) => {
      if (!win || visited.has(win)) {
        return;
      }
      visited.add(win);
      try {
        collectFromDocument(win.document);
      } catch {
        // ignore
      }
      try {
        const wrappedDoc = win?.wrappedJSObject?.document;
        if (wrappedDoc) {
          collectFromDocument(wrappedDoc);
        }
      } catch {
        // ignore
      }
      try {
        const frames = win.frames || [];
        for (let i = 0; i < frames.length; i++) {
          collectFromWindow(frames[i]);
        }
      } catch {
        // ignore
      }
    };

    collectFromWindow(iframeWindow);
    try {
      collectFromWindow(iframeWindow?.wrappedJSObject);
    } catch {
      // ignore
    }

    if (collected.length == 0) {
      return "";
    }

    // Keep the richest view when multiple document shells are present.
    return collected.sort((a, b) => b.length - a.length)[0];
  } catch (error: any) {
    Zotero.logError(error);
    return "";
  }
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
 * Uses a multi-strategy approach and prefers the richer extraction result:
 * 1. Read HTML file from disk and parse text
 * 2. Extract from reader iframe DOM (traversing nested iframes)
 * Some snapshot shells contain only partial text in the raw file while full rendered text
 * is available in reader DOM, so we compare both and keep the longer one.
 */
async function readSnapshotChunks(
  reader: _ZoteroTypes.ReaderInstance,
  attachment: Zotero.Item,
  expectedAttachmentKey: string,
  contextId: string,
  title: string,
): Promise<PreparedPaperContext> {
  // Strategy 1: Read from file
  const fileText = await extractSnapshotTextFromFile(attachment);

  // Strategy 2: Extract from reader DOM
  const domText = reader._iframeWindow
    ? extractSnapshotTextFromDom(reader._iframeWindow)
    : "";

  // Prefer richer extraction (longer cleaned text) to avoid file-only partial shells.
  const text = domText.length > fileText.length ? domText : fileText;

  // Build virtual page chunks from snapshot text to avoid single massive prompt blocks.
  // Snapshots have no real page structure, so we use virtual page numbers.
  const normalized = normalizeText(text || "");
  const maxSnapshotChunkChars = 2200;
  const chunks: PaperChunk[] = [];
  if (normalized) {
    for (let offset = 0, i = 0; offset < normalized.length; offset += maxSnapshotChunkChars, i += 1) {
      const content = normalizeText(normalized.slice(offset, offset + maxSnapshotChunkChars));
      if (!content) {
        continue;
      }
      const page = i + 1;
      chunks.push({
        id: `s${page}-c1`,
        page,
        label: `part ${page}`,
        content,
      });
    }
  }

  return {
    contextId,
    paperKey: expectedAttachmentKey,
    title,
    preparedAt: Date.now(),
    chunks,
    sourceKind: "snapshot",
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

    // Build positioned lines and produce one page-level chunk.
    const positionedLines: PositionedLine[] = lines.map((line) => ({
      text: line.text,
      y: line.y,
    }));
    const pageChunk = chunkByPage(positionedLines, pageIndex + 1);
    if (pageChunk) {
      chunks.push(pageChunk);
    }
  }

  return {
    contextId,
    paperKey: expectedAttachmentKey,
    title,
    preparedAt: Date.now(),
    chunks,
    sourceKind: "pdf",
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
