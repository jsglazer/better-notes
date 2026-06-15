import { getPref } from "../../utils/prefs";
import { applyPatch } from "./registry";

export function patchExportItems(win: _ZoteroTypes.MainWindow) {
  const Zotero_File_Interface = win.Zotero_File_Interface;
  applyPatch(
    Zotero_File_Interface,
    "exportItems",
    (origin) =>
      function (this: unknown) {
        if (!getPref("exportNotes.takeover")) {
          return origin.apply(this);
        }
        const items = win.ZoteroPane.getSelectedItems();
        if (items.every((item) => item.isNote())) {
          return addon.hooks.onShowExportNoteOptions(
            items.map((item) => item.id),
          );
        }
        return origin.apply(this);
      },
  );
}
