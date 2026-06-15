import type { OutlinePane } from "../../elements/workspace/outlinePane";
import { getWorkspaceByUID, WorkspaceTab } from "../../utils/workspace";
import { applyPatch } from "./registry";

export function patchNoteCreation(win: _ZoteroTypes.MainWindow) {
  applyPatch(
    win.ZoteroPane,
    "newNote",
    (origin) =>
      async function (
        this: unknown,
        popup?: boolean,
        parentKey?: string,
        text?: string,
        citeURI?: string,
      ) {
        // Only intercept plain note creation with no pre-set content
        if (text || citeURI) {
          return (origin as any).apply(this, [popup, parentKey, text, citeURI]);
        }
        await addon.hooks.onCreateNoteFromTemplate("standalone");
      },
  );

  applyPatch(
    win.ZoteroPane,
    "newChildNote",
    (_origin) =>
      async function (_popup?: boolean) {
        await addon.hooks.onCreateNoteFromTemplate("item", "library");
      },
  );
}

export function patchNotes() {
  applyPatch(
    Zotero.Notes,
    "toggleSidebar",
    (_origin) =>
      function (open: boolean) {
        const win = Zotero.getMainWindow();
        if (!win) {
          return;
        }
        const tabID = win.Zotero_Tabs.selectedID;
        const workspace = getWorkspaceByUID(tabID);
        if (!workspace) {
          return;
        }
        workspace.toggleOutline(open);
      },
  );

  applyPatch(
    Zotero.Notes,
    "setSidebarWidth",
    (_origin) =>
      function (width: number) {
        const win = Zotero.getMainWindow();
        if (!win) {
          return;
        }
        const tabID = win.Zotero_Tabs.selectedID;
        const workspace = getWorkspaceByUID(tabID) as WorkspaceTab;
        if (!workspace) {
          return;
        }
        workspace.toggleOutline(width);
      },
  );
}
