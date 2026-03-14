import { StoredContext } from "./types";

function buildInsightMarker(insightId: string) {
  return `→ Sonder insight [${insightId}]`;
}

async function tryLoadDataType(item: Zotero.Item, dataType: string) {
  try {
    await item.loadDataType(dataType);
  } catch {
    // ignore
  }
}

function resolveContextItem(context: StoredContext) {
  if (!context.itemKey || context.libraryID == undefined) {
    return undefined;
  }
  return Zotero.Items.getByLibraryAndKey(context.libraryID, context.itemKey) as Zotero.Item | false;
}

export async function appendInsightMarkerForContext(context: StoredContext, insightId: string): Promise<boolean> {
  if (context.type != "item+paper") {
    return false;
  }
  const item = resolveContextItem(context);
  if (!item) {
    return false;
  }

  const marker = buildInsightMarker(insightId);

  if (context.itemKind == "annotation") {
    await tryLoadDataType(item, "annotation");
    const currentComment = item.annotationComment || "";
    if (currentComment.includes(marker)) {
      return false;
    }
    item.annotationComment = currentComment.trim()
      ? `${currentComment.trim()}\n${marker}`
      : marker;
    await item.saveTx();
    return true;
  }

  if (context.itemKind == "note") {
    await tryLoadDataType(item, "note");
    const noteHTML = item.getNote() || "";
    if (noteHTML.includes(marker)) {
      return false;
    }
    const updated = noteHTML.trim()
      ? `${noteHTML}<p>${marker}</p>`
      : `<p>${marker}</p>`;
    item.setNote(updated);
    await item.saveTx();
    return true;
  }

  return false;
}
