import { getString } from "../utils/locale";
import { formatPath } from "../utils/str";

export { createNoteFromTemplate, createNoteFromMD, createNote };

function getLibraryParentId() {
  return Zotero.getMainWindow()
    .ZoteroPane.getSelectedItems()
    .filter((item) => item.isRegularItem())[0]?.id;
}

function getReaderParentId() {
  const currentReader = Zotero.Reader.getByTabID(
    Zotero.getMainWindow().Zotero_Tabs.selectedID,
  );
  const parentItemId = Zotero.Items.get(
    currentReader?.itemID || -1,
  ).parentItemID;
  return parentItemId;
}

async function createNoteFromTemplate(noteType: "standalone"): Promise<void>;
async function createNoteFromTemplate(
  noteType: "item",
  parentType: "reader" | "library",
): Promise<void>;
async function createNoteFromTemplate(
  noteType: "standalone" | "item",
  parentType?: "reader" | "library",
) {
  if (noteType === "item") {
    const parentItemId =
      parentType === "reader" ? getReaderParentId() : getLibraryParentId();
    if (!parentItemId) {
      Zotero.getMainWindow().alert(getString("alert-notValidParentItemError"));
      return;
    }
    addon.hooks.onShowTemplatePicker("create", {
      noteType,
      parentItemId,
      // Only pre-select the top item if the parent is a reader item
      topItemIds: parentType === "reader" ? [parentItemId] : undefined,
    });
  } else {
    addon.hooks.onShowTemplatePicker("create", {
      noteType,
    });
  }
}

/**
 * Import one or more Markdown files as notes.
 *
 * U23: `parentType` decides what kind of note is produced. Without it the
 * import has always created *standalone* notes — `createNote()` only consults
 * the selected collection and never sets a parent — which is why the command
 * could not appear under the item pane's Notes + menu, a menu whose whole
 * purpose is child notes. Passing "library"/"reader" attaches each imported
 * note to the current item instead.
 */
async function createNoteFromMD(parentType?: "reader" | "library") {
  const parentItemId =
    parentType === "reader"
      ? getReaderParentId()
      : parentType === "library"
        ? getLibraryParentId()
        : undefined;
  if (parentType && !parentItemId) {
    Zotero.getMainWindow().alert(getString("alert-notValidParentItemError"));
    return;
  }
  // Standalone imports still need a valid collection context; a child note
  // needs only its parent, so the collection check does not apply there.
  if (!parentItemId && !(await createNote({ dryRun: true }))) {
    return;
  }

  const syncNotes = Zotero.getMainWindow().confirm(
    getString("alert-syncImportedNotes"),
  );

  const filepaths = await new ztoolkit.FilePicker(
    "Import MarkDown",
    "multiple",
    [
      [`MarkDown(*.md)`, `*.md`],
      ["All Files", "*"],
    ],
  ).open();

  if (!filepaths) {
    return;
  }

  for (const filepath of filepaths) {
    const noteItem = parentItemId
      ? await createChildNote(parentItemId)
      : await createNote();
    if (!noteItem) {
      continue;
    }
    await addon.api.$import.fromMD(filepath, {
      noteId: noteItem.id,
      ignoreVersion: true,
    });
    if (noteItem && syncNotes) {
      const pathSplit = PathUtils.split(formatPath(filepath));
      addon.api.sync.updateSyncStatus(noteItem.id, {
        itemID: noteItem.id,
        path: formatPath(pathSplit.slice(0, -1).join("/")),
        filename: pathSplit.pop() || "",
        lastsync: new Date().getTime(),
        md5: "",
        noteMd5: Zotero.Utilities.Internal.md5(noteItem.getNote(), false),
      });
    }
  }
}

/** Create an empty child note of `parentItemId`, saved and ready to import into. */
async function createChildNote(parentItemId: number) {
  const parent = Zotero.Items.get(parentItemId);
  if (!parent) {
    return false;
  }
  const noteItem = new Zotero.Item("note");
  noteItem.libraryID = parent.libraryID;
  noteItem.parentItemID = parent.id;
  await noteItem.saveTx();
  return noteItem;
}

async function createNote(): Promise<Zotero.Item | false>;
async function createNote(options: {
  dryRun: true;
  noSave?: boolean;
}): Promise<boolean>;
async function createNote(options: {
  dryRun?: false;
  noSave?: boolean;
}): Promise<Zotero.Item | false>;
async function createNote(
  options: { dryRun?: boolean; noSave?: boolean } = {},
) {
  let noteItem: Zotero.Item;
  const ZoteroPane = Zotero.getActiveZoteroPane();

  const cView = ZoteroPane.collectionsView;
  if (!cView) {
    Zotero.getMainWindow().alert(getString("alert-notValidCollectionError"));
    return false;
  }
  const cRow = cView.selectedTreeRow;
  if (["library", "group", "collection"].includes(cRow.type)) {
    if (options.dryRun) {
      return true;
    }
    noteItem = new Zotero.Item("note");
    noteItem.libraryID = ZoteroPane.getSelectedLibraryID();
    if (cRow.type === "collection") {
      noteItem.addToCollection(cRow.ref.id);
    }
  } else {
    Zotero.getMainWindow().alert(getString("alert-notValidCollectionError"));
    return false;
  }

  if (!options.noSave) {
    await noteItem.saveTx();
  }
  return noteItem;
}
