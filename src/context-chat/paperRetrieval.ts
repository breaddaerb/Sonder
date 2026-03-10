import { Citation } from "./types";

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
    "",
    "Retrieved paper context:",
    contextText,
    "",
    `User question: ${args.question}`,
  ].join("\n");
}

export async function readCurrentReaderPaperChunks(expectedAttachmentKey: string, contextId: string, title: string) {
  const reader = await ztoolkit.Reader.getReader() as _ZoteroTypes.ReaderInstance;
  if (!reader?.itemID) {
    throw new Error("No active PDF reader is available to prepare paper context.");
  }
  const attachment = Zotero.Items.get(reader.itemID as number);
  if (!attachment || !attachment.isPDFAttachment() || attachment.key != expectedAttachmentKey) {
    throw new Error("The active PDF reader does not match the current paper context.");
  }

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
  } as PreparedPaperContext;
}
