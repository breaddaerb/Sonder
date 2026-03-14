import assert from "node:assert/strict";
import { appendInsightMarkerForContext } from "../src/context-chat/insightMarker";

function makeAnnotationItem(initialComment = "") {
  return {
    annotationComment: initialComment,
    async loadDataType() {},
    async saveTx() {
      return true;
    },
  } as unknown as Zotero.Item;
}

function makeNoteItem(initialHtml = "") {
  let noteHTML = initialHtml;
  return {
    async loadDataType() {},
    getNote() {
      return noteHTML;
    },
    setNote(value: string) {
      noteHTML = value;
      return true;
    },
    async saveTx() {
      return true;
    },
  } as unknown as Zotero.Item;
}

const items = new Map<string, Zotero.Item>();

(globalThis as any).Zotero = {
  Items: {
    getByLibraryAndKey(libraryID: number, itemKey: string) {
      return items.get(`${libraryID}:${itemKey}`) || false;
    },
  },
};

async function main() {
  const annotationItem = makeAnnotationItem("Existing comment");
  items.set("1:ANNO1", annotationItem);

  const annotationWritten = await appendInsightMarkerForContext({
    id: "itempaper:ANNO1:PAPER1",
    type: "item+paper",
    title: "Paper",
    itemKey: "ANNO1",
    itemKind: "annotation",
    libraryID: 1,
    updatedAt: Date.now(),
  }, "insight:1");

  assert.equal(annotationWritten, true);
  assert.match((annotationItem as any).annotationComment, /Existing comment/);
  assert.match((annotationItem as any).annotationComment, /→ Sonder insight \[insight:1\]/);

  const annotationDuplicate = await appendInsightMarkerForContext({
    id: "itempaper:ANNO1:PAPER1",
    type: "item+paper",
    title: "Paper",
    itemKey: "ANNO1",
    itemKind: "annotation",
    libraryID: 1,
    updatedAt: Date.now(),
  }, "insight:1");
  assert.equal(annotationDuplicate, false);

  const noteItem = makeNoteItem("<p>Note body</p>");
  items.set("1:NOTE1", noteItem);

  const noteWritten = await appendInsightMarkerForContext({
    id: "itempaper:NOTE1:PAPER1",
    type: "item+paper",
    title: "Paper",
    itemKey: "NOTE1",
    itemKind: "note",
    libraryID: 1,
    updatedAt: Date.now(),
  }, "insight:2");
  assert.equal(noteWritten, true);
  assert.match((noteItem as any).getNote(), /<p>Note body<\/p>/);
  assert.match((noteItem as any).getNote(), /→ Sonder insight \[insight:2\]/);

  const paperContextSkipped = await appendInsightMarkerForContext({
    id: "paper:PAPER1",
    type: "paper",
    title: "Paper",
    paperKey: "PAPER1",
    libraryID: 1,
    updatedAt: Date.now(),
  }, "insight:3");
  assert.equal(paperContextSkipped, false);

  console.log("context-chat insight marker tests passed");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
