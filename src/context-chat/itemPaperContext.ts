import { ItemPaperContextDescriptor } from "./types";

function htmlToText(html: string) {
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html || "", "text/html");
    return (doc.body?.textContent || "").replace(/\s+/g, " ").trim();
  } catch {
    return (html || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  }
}

async function tryLoadDataType(item: Zotero.Item, dataType: string) {
  try {
    await item.loadDataType(dataType);
  } catch {
    // Ignore if type is already loaded or unavailable
  }
}

function getPaperTitleFromAttachment(attachment: Zotero.Item) {
  return (
    attachment.parentItem?.getDisplayTitle()?.trim() ||
    attachment.getField("title")?.trim() ||
    attachment.getDisplayTitle()?.trim() ||
    attachment.key
  );
}

function getAttachmentFromNote(noteItem: Zotero.Item) {
  const parent = noteItem.parentItem;
  if (!parent) {
    return undefined;
  }
  if (parent.isPDFAttachment()) {
    return parent;
  }
  const attachmentIDs = parent.getAttachments(false);
  const attachmentItems = attachmentIDs
    .map((id) => Zotero.Items.get(id))
    .filter((item) => item && item.isPDFAttachment());
  return attachmentItems[0];
}

async function getAnnotationText(annotationItem: Zotero.Item) {
  await tryLoadDataType(annotationItem, "annotation");
  let text = "";
  let comment = "";
  try {
    text = annotationItem.annotationText?.trim() || "";
  } catch {
    text = "";
  }
  try {
    comment = annotationItem.annotationComment?.trim() || "";
  } catch {
    comment = "";
  }
  return text || comment || "(Selected annotation has no text content.)";
}

async function getNoteText(noteItem: Zotero.Item) {
  await tryLoadDataType(noteItem, "note");
  let noteHTML = "";
  try {
    noteHTML = noteItem.getNote() || "";
  } catch {
    noteHTML = "";
  }
  const plain = htmlToText(noteHTML);
  return plain || "(Selected note is empty.)";
}

async function fromAnnotationItem(item: Zotero.Item): Promise<ItemPaperContextDescriptor | undefined> {
  const attachment = item.parentItem;
  if (!attachment || !attachment.isPDFAttachment()) {
    return undefined;
  }
  const itemText = await getAnnotationText(item);
  const itemTitle = itemText.slice(0, 160);
  return {
    itemID: item.id,
    itemKey: item.key,
    itemKind: "annotation",
    itemTitle,
    itemText,
    paperAttachmentID: attachment.id,
    paperAttachmentKey: attachment.key,
    paperParentID: attachment.parentItem?.id,
    paperTitle: getPaperTitleFromAttachment(attachment),
    libraryID: item.libraryID,
  };
}

async function fromNoteItem(item: Zotero.Item): Promise<ItemPaperContextDescriptor | undefined> {
  const attachment = getAttachmentFromNote(item);
  if (!attachment) {
    return undefined;
  }
  const itemText = await getNoteText(item);
  const itemTitle = itemText.slice(0, 160);
  return {
    itemID: item.id,
    itemKey: item.key,
    itemKind: "note",
    itemTitle,
    itemText,
    paperAttachmentID: attachment.id,
    paperAttachmentKey: attachment.key,
    paperParentID: attachment.parentItem?.id,
    paperTitle: getPaperTitleFromAttachment(attachment),
    libraryID: item.libraryID,
  };
}

function findAnnotationByKeyOrID(attachment: Zotero.Item, candidate: any) {
  if (!candidate) {
    return undefined;
  }
  const key = String(candidate.key || candidate.annotationKey || candidate.id || "");
  const numericID = Number(candidate.itemID || candidate.annotationItemID || NaN);
  return attachment.getAnnotations(false).find((anno) => {
    return (!!key && (anno.key == key || String(anno.id) == key)) || (!Number.isNaN(numericID) && anno.id == numericID);
  });
}

async function resolveFromReader(reader: _ZoteroTypes.ReaderInstance | undefined): Promise<ItemPaperContextDescriptor | undefined> {
  if (!reader || !reader.itemID) {
    return undefined;
  }
  const attachment = Zotero.Items.get(reader.itemID) as Zotero.Item | undefined;
  if (!attachment || !attachment.isPDFAttachment()) {
    return undefined;
  }

  const selectedFromAPI = (reader as any)?._internalReader?.getSelectedAnnotations?.() as any[] | undefined;
  const apiSelection = selectedFromAPI?.[0];
  const apiAnnotation = findAnnotationByKeyOrID(attachment, apiSelection);
  if (apiAnnotation) {
    return fromAnnotationItem(apiAnnotation);
  }

  const selectedNodes = reader._iframeWindow?.document?.querySelectorAll("[id^=annotation-].selected") as
    | NodeListOf<Element>
    | undefined;

  const internalState = (reader as any)?._internalReader?._state;
  const selectedIDs = (internalState?.selectedAnnotationIDs || []) as string[];
  const stateAnnotations = (internalState?.annotations || []) as any[];
  if (selectedIDs.length > 0 && stateAnnotations.length > 0) {
    const selectedStateAnnotation = stateAnnotations.find((anno) => selectedIDs.includes(String(anno.id)));
    const matched = findAnnotationByKeyOrID(attachment, selectedStateAnnotation);
    if (matched) {
      return fromAnnotationItem(matched);
    }
  }

  const selectedKey = selectedNodes?.[0]?.id?.split("-")?.[1];
  if (!selectedKey) {
    return undefined;
  }
  const annotation = attachment.getAnnotations(false).find((anno) => anno.key == selectedKey);
  if (!annotation) {
    return undefined;
  }
  return fromAnnotationItem(annotation);
}

async function resolveReaderSelectedAnnotationContext(): Promise<ItemPaperContextDescriptor | undefined> {
  let currentReader: _ZoteroTypes.ReaderInstance | undefined;
  try {
    currentReader = Zotero.Reader.getByTabID(Zotero_Tabs.selectedID);
  } catch {
    currentReader = undefined;
  }
  return await resolveFromReader(currentReader);
}

async function resolveMainWindowSelectedAnnotationContext(): Promise<ItemPaperContextDescriptor | undefined> {
  const doc = Zotero.getMainWindow()?.document;
  if (!doc) {
    return undefined;
  }

  const selectedNode = doc.querySelector(
    "[data-item-id][aria-selected='true'], [data-itemid][aria-selected='true'], [data-id][aria-selected='true'], [id*='annotation'][aria-selected='true'], [id*='annotation'].selected"
  ) as HTMLElement | null;
  if (!selectedNode) {
    return undefined;
  }

  const idCandidates = [
    selectedNode.getAttribute("data-item-id"),
    selectedNode.getAttribute("data-itemid"),
    selectedNode.getAttribute("data-id"),
    selectedNode.getAttribute("item-id"),
    selectedNode.id,
  ].filter(Boolean) as string[];

  for (const value of idCandidates) {
    const numericMatch = value.match(/(\d{2,})/);
    const numericID = Number(numericMatch?.[1] || NaN);
    if (!Number.isNaN(numericID)) {
      const selectedItem = Zotero.Items.get(numericID) as Zotero.Item | undefined;
      if (selectedItem?.isAnnotation()) {
        return fromAnnotationItem(selectedItem);
      }
      if (selectedItem?.isNote()) {
        return fromNoteItem(selectedItem);
      }
    }
  }

  return undefined;
}

export interface ItemPaperResolution {
  context?: ItemPaperContextDescriptor;
  source: "selected-item-annotation" | "selected-item-note" | "reader-selection" | "pane-selection" | "none";
}

export async function resolveSelectedItemPaperContextWithSource(): Promise<ItemPaperResolution> {
  try {
    const item = ZoteroPane.getSelectedItems()?.[0] as Zotero.Item | undefined;
    if (item?.isAnnotation()) {
      return { context: await fromAnnotationItem(item), source: "selected-item-annotation" };
    }
    if (item?.isNote()) {
      return { context: await fromNoteItem(item), source: "selected-item-note" };
    }
    const readerResolved = await resolveReaderSelectedAnnotationContext();
    if (readerResolved) {
      return { context: readerResolved, source: "reader-selection" };
    }
    const paneResolved = await resolveMainWindowSelectedAnnotationContext();
    if (paneResolved) {
      return { context: paneResolved, source: "pane-selection" };
    }
    return { source: "none" };
  } catch (error: any) {
    Zotero.logError(error);
    return { source: "none" };
  }
}

export async function resolveSelectedItemPaperContext(): Promise<ItemPaperContextDescriptor | undefined> {
  return (await resolveSelectedItemPaperContextWithSource()).context;
}
