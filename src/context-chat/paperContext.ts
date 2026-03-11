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

export function resolveCurrentPaperContext(): PaperContextDescriptor | undefined {
  try {
    const reader = Zotero.Reader.getByTabID(Zotero_Tabs.selectedID);
    if (!reader?.itemID) {
      return undefined;
    }
    const attachment = Zotero.Items.get(reader.itemID as number);
    if (!attachment || !attachment.isPDFAttachment()) {
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
