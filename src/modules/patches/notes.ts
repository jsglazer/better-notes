import { PatchHelper } from "zotero-plugin-toolkit";
import type { OutlinePane } from "../../elements/workspace/outlinePane";
import { getWorkspaceByUID, WorkspaceTab } from "../../utils/workspace";

export function patchNoteCreation(win: _ZoteroTypes.MainWindow) {
  new PatchHelper().setData({
    target: win.ZoteroPane,
    // @ts-ignore
    funcSign: "newNote",
    patcher: (origin) =>
      async function (
        popup?: boolean,
        parentKey?: string,
        text?: string,
        citeURI?: string,
      ) {
        // Only intercept plain note creation with no pre-set content
        if (text || citeURI) {
          // @ts-ignore
          return (origin as any).apply(this, [popup, parentKey, text, citeURI]);
        }
        await addon.hooks.onCreateNoteFromTemplate("standalone");
      },
    enabled: true,
  });

  new PatchHelper().setData({
    target: win.ZoteroPane,
    // @ts-ignore
    funcSign: "newChildNote",
    patcher: (_origin) =>
      async function (_popup?: boolean) {
        await addon.hooks.onCreateNoteFromTemplate("item", "library");
      },
    enabled: true,
  });
}

export function patchNotes() {
  Zotero.Notes.toggleSidebar = function (open: boolean) {
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
  };

  Zotero.Notes.setSidebarWidth = function (width: number) {
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
  };
}
