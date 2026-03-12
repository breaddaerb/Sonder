import { PaperContextDescriptor } from "./types";

function getPaperTitle(attachment: Zotero.Item) {
  const parent = attachment.parentItem;
  return (
    parent?.getDisplayTitle()?.trim() ||
    attachment.getField("title")?.trim() ||
    attachment.getDisplayTitle()?.trim() ||
    attachment.key
  );
}

/**
 * Check whether an attachment is a type we can extract text from.
 * Currently supports PDF attachments and HTML/webpage snapshot attachments.
 */
export function isSupportedAttachment(attachment: Zotero.Item): boolean {
  if (attachment.isPDFAttachment()) {
    return true;
  }
  // Webpage snapshots are stored as HTML attachments.
  // Zotero exposes attachmentContentType on attachment items.
  try {
    const contentType = (attachment as any).attachmentContentType as string | undefined;
    if (contentType && (contentType === "text/html" || contentType === "application/xhtml+xml")) {
      return true;
    }
  } catch {
    // fall through
  }
  return false;
}

/**
 * Determine whether an attachment is an HTML/snapshot type (not PDF).
 */
export function isSnapshotAttachment(attachment: Zotero.Item): boolean {
  if (attachment.isPDFAttachment()) {
    return false;
  }
  try {
    const contentType = (attachment as any).attachmentContentType as string | undefined;
    return Boolean(contentType && (contentType === "text/html" || contentType === "application/xhtml+xml"));
  } catch {
    return false;
  }
}

export function resolveCurrentPaperContext(): PaperContextDescriptor | undefined {
  try {
    const reader = Zotero.Reader.getByTabID(Zotero_Tabs.selectedID);
    if (!reader?.itemID) {
      return undefined;
    }
    const attachment = Zotero.Items.get(reader.itemID as number);
    if (!attachment || !isSupportedAttachment(attachment)) {
      return undefined;
    }
    return {
      attachmentItemID: attachment.id,
      attachmentKey: attachment.key,
      parentItemID: attachment.parentItem?.id,
      libraryID: attachment.libraryID,
      title: getPaperTitle(attachment),
    };
  } catch (error: any) {
    Zotero.logError(error);
    return undefined;
  }
}
