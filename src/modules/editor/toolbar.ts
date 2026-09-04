import { config } from "../../../package.json";
import { ICONS } from "../../utils/config";
import {
  copyNoteLink,
  getLineAtCursor,
  getSectionAtCursor,
} from "../../utils/editor";
import { getString } from "../../utils/locale";
import { showHint } from "../../utils/hint";
import { sanitizeFilename } from "../template/filters";
import { fileExists, jointPath } from "../../utils/str";
import { slice } from "../../utils/str";
import { waitUtilAsync } from "../../utils/wait";
import {
  getEditorInitPromise,
  getEditorItem,
  getEditorWindow,
} from "./adapter";

export async function initEditorToolbar(editor: Zotero.EditorInstance) {
  if (editor._disableUI) {
    return;
  }

  const noteItem = getEditorItem(editor);

  const _window = getEditorWindow(editor);
  const _document = _window.document;
  try {
    await waitUtilAsync(() => !!_document.querySelector(".toolbar"));
  } catch (e) {
    ztoolkit.log("Editor toolbar not found");
  }
  const toolbar = _document.querySelector(".toolbar") as HTMLDivElement;
  if (!toolbar) {
    ztoolkit.log("Editor toolbar not found");
    return;
  }
  // U22b: the Link Creator button was removed from the toolbar. It is still
  // reachable by its shortcut and from the command palette (`ob` / `ib`); the
  // toolbar space is better spent on Rename, which had no entry point at all.
  //
  // Rename. Zotero derives a note's title from its first line and offers no
  // way to edit it directly, so renaming otherwise means hunting for the first
  // line and editing it in place.
  registerEditorToolbarElement(
    editor,
    toolbar,
    "start",
    ztoolkit.UI.createElement(_document, "button", {
      classList: ["toolbar-button"],
      properties: {
        innerHTML: ICONS.rename,
        title: "Rename note",
      },
      listeners: [
        {
          type: "click",
          listener: async (e) => {
            // Flush pending keystrokes first: renaming rewrites the note from
            // its stored HTML, so anything still buffered in the editor would
            // be lost.
            editor.saveSync();
            const win = Zotero.getMainWindow();
            const current = noteItem.getNoteTitle().trim();
            const input = win.prompt("Rename note:", current);
            if (input === null) {
              return;
            }
            if (!input.trim()) {
              showHint("A note title cannot be empty.");
              return;
            }
            try {
              await addon.api.note.renameNote(noteItem, input);
              showHint(`Renamed to "${input.trim()}"`);
              await offerToRenameSyncedFile(noteItem, input.trim(), win);
            } catch (err) {
              ztoolkit.log(err);
              showHint("Rename failed — see the error console.");
            }
          },
        },
      ],
    }) as HTMLButtonElement,
  );

  if (editor._tabID) {
    const sidebarState =
      Zotero.getMainWindow().Zotero_Tabs.getSidebarState("note");
    registerEditorToolbarElement(
      editor,
      toolbar,
      "start",
      ztoolkit.UI.createElement(_document, "button", {
        classList: ["toolbar-button", "bn-toggle-left-pane"],
        properties: {
          innerHTML: ICONS.workspaceToggle,
          title: "Toggle left pane",
        },
        styles: {
          display: sidebarState.open ? "none" : "inherit",
        },
        listeners: [
          {
            type: "click",
            listener: () => {
              Zotero.Notes.toggleSidebar(true);
            },
          },
        ],
      }),
    );
  }

  const settingsButton = _document.querySelector(
    ".toolbar .end .dropdown .toolbar-button",
  ) as HTMLDivElement;

  const MutationObserver = // @ts-ignore
    _window.MutationObserver as typeof window.MutationObserver;
  const observer = new MutationObserver((mutations) => {
    mutations.forEach(async (mutation) => {
      if (
        mutation.type === "attributes" &&
        mutation.attributeName === "class" &&
        mutation.target === settingsButton
      ) {
        if (settingsButton.classList.contains("active")) {
          const dropdown = settingsButton.parentElement!;
          const popup = dropdown.querySelector(".popup") as HTMLDivElement;
          ztoolkit.log(popup);
          registerEditorToolbarPopup(editor, popup, await getMenuData(editor));
        }
      }
    });
  });
  observer.observe(settingsButton, {
    attributes: true,
    attributeFilter: ["class"],
  });
}

async function getMenuData(editor: Zotero.EditorInstance) {
  const noteItem = getEditorItem(editor);

  const currentLine = getLineAtCursor(editor);
  const currentSection = (await getSectionAtCursor(editor)) || "";
  const settingsMenuData: PopupData[] = [
    {
      id: makeId("settings-openAsTab"),
      text: getString("editor-toolbar-settings-openAsTab"),
      callback: (e) => {
        addon.hooks.onOpenNote(noteItem.id, "tab");
      },
    },
    {
      id: makeId("settings-openAsWindow"),
      text: getString("editor-toolbar-settings-openAsWindow"),
      callback: (e) => {
        addon.hooks.onOpenNote(noteItem.id, "window", { forceTakeover: true });
      },
    },
    {
      id: makeId("settings-showInLibrary"),
      text: getString("editor-toolbar-settings-showInLibrary"),
      callback: (e) => {
        Zotero.getMainWindow().ZoteroPane.selectItems([
          getEditorItem(e.editor).id,
        ]);
      },
    },
  ];

  if (currentLine >= 0) {
    settingsMenuData.push(
      ...(<PopupData[]>[
        {
          type: "splitter",
        },
        {
          id: makeId("settings-export"),
          text: getString("editor-toolbar-settings-export"),
          callback: (e) => {
            if (addon.api.sync.isSyncNote(noteItem.id)) {
              addon.hooks.onShowSyncInfo(noteItem.id);
            } else {
              addon.hooks.onShowExportNoteOptions([noteItem.id]);
            }
          },
        },
        {
          type: "splitter",
        },
        {
          id: makeId("settings-insertTemplate"),
          text: getString("editor-toolbar-settings-insertTemplate"),
          callback: (e) => {
            addon.hooks.onShowTemplatePicker("insert", {
              noteId: getEditorItem(e.editor).id,
              lineIndex: currentLine,
            });
          },
        },
        {
          id: makeId("settings-refreshTemplates"),
          text: getString("editor-toolbar-settings-refreshTemplates"),
          callback: (e) => {
            addon.hooks.onRefreshTemplatesInNote(e.editor);
          },
        },
        {
          type: "splitter",
        },
        {
          id: makeId("settings-copyLink"),
          text: getString("editor-toolbar-settings-copyLink", {
            args: {
              line: currentLine,
            },
          }),
          callback: (e) => {
            copyNoteLink(e.editor, "line");
          },
        },
        {
          id: makeId("settings-copyLinkAtSection"),
          text: getString("editor-toolbar-settings-copyLinkAtSection", {
            args: {
              section: slice(currentSection, 10),
            },
          }),
          callback: (e) => {
            copyNoteLink(e.editor, "section");
          },
        },
        {
          id: makeId("settings-updateRelatedNotes"),
          text: getString("editor-toolbar-settings-updateRelatedNotes"),
          callback: (e) => {
            addon.api.relation.updateNoteLinkRelation(
              getEditorItem(e.editor).id,
            );
          },
        },
      ]),
    );
  }

  const parentAttachment = await noteItem.parentItem?.getBestAttachment();
  if (parentAttachment) {
    settingsMenuData.push(
      ...(<PopupData[]>[
        {
          type: "splitter",
        },
        {
          id: makeId("settings-openParent"),
          text: getString("editor-toolbar-settings-openParent"),
          callback: (e) => {
            Zotero.getMainWindow().ZoteroPane.viewAttachment([
              parentAttachment.id,
            ]);
            Zotero.Notifier.trigger("open", "file", parentAttachment.id);
          },
        },
      ]),
    );
  }

  if (addon.api.sync.isSyncNote(noteItem.id)) {
    settingsMenuData.splice(5, 0, {
      id: makeId("settings-refreshSyncing"),
      text: getString("editor-toolbar-settings-refreshSyncing"),
      callback: (e) => {
        addon.hooks.onSyncing([noteItem], {
          quiet: false,
          skipActive: false,
          reason: "manual-editor",
        });
      },
    });
  }

  return settingsMenuData;
}

declare interface PopupData {
  type?: "item" | "splitter";
  id?: string;
  text?: string;
  prefix?: string;
  suffix?: string;
  callback?: (e: MouseEvent & { editor: Zotero.EditorInstance }) => any;
}

async function registerEditorToolbarPopup(
  editor: Zotero.EditorInstance,
  popup: HTMLDivElement,
  popupLines: PopupData[],
) {
  await getEditorInitPromise(editor);
  ztoolkit.UI.appendElement(
    {
      tag: "fragment",
      children: popupLines.map((props) => {
        return props.type === "splitter"
          ? {
              tag: "div",
              classList: ["separator"],
              properties: {
                id: props.id,
              },
            }
          : {
              tag: "button",
              classList: ["option"],
              properties: {
                id: props.id,
                innerHTML:
                  slice((props.prefix || "") + props.text, 50) +
                  (props.suffix || ""),
                title: "",
              },
              listeners: [
                {
                  type: "click",
                  listener: (e) => {
                    Object.assign(e, { editor });
                    props.callback &&
                      props.callback(
                        e as any as MouseEvent & {
                          editor: Zotero.EditorInstance;
                        },
                      );
                  },
                },
              ],
            };
      }),
    },
    popup,
  ) as HTMLDivElement;

  popup.style.removeProperty("left");
  popup.style.right = "0px";
}

async function registerEditorToolbarElement(
  editor: Zotero.EditorInstance,
  toolbar: HTMLDivElement,
  position: "start" | "middle" | "end",
  elem: HTMLElement,
  after: boolean = false,
) {
  await getEditorInitPromise(editor);
  const target = toolbar.querySelector(`.${position}`);
  if (target) {
    if (after) {
      target.append(elem);
    } else {
      target.prepend(elem);
    }
  }
  return elem;
}

function makeId(key: string) {
  return `${config.addonRef}-${key}`;
}

/**
 * U22f: after renaming a note, offer to rename its synced Markdown file too.
 *
 * The export filename normally comes from `[ExportMDFileNameV2]`, which is
 * cite-key based — the note's title is not part of it — and it is frozen into
 * the sync record when the note is first linked. So a rename in Zotero would
 * otherwise never reach the vault.
 *
 * This is deliberately an explicit, per-note prompt rather than automatic
 * behaviour: moving a file out from under Obsidian breaks any `[[wikilinks]]`
 * pointing at it, because Obsidian only rewrites links when it performs the
 * rename itself. Asking keeps the user aware of exactly when that happens.
 */
async function offerToRenameSyncedFile(
  noteItem: Zotero.Item,
  newTitle: string,
  win: Window,
) {
  if (!addon.api.sync.isSyncNote(noteItem.id)) {
    return;
  }
  const status = addon.api.sync.getSyncStatus(noteItem.id);
  if (!status?.path || !status.filename) {
    return;
  }
  const dot = status.filename.lastIndexOf(".");
  const ext = dot > 0 ? status.filename.slice(dot) : ".md";
  const target = `${sanitizeFilename(newTitle)}${ext}`;
  if (target === status.filename) {
    return;
  }

  const oldPath = jointPath(status.path, status.filename);
  const newPath = jointPath(status.path, target);
  if (await fileExists(newPath)) {
    showHint(`"${target}" already exists — the file was not renamed.`);
    return;
  }
  if (
    typeof win?.confirm !== "function" ||
    !win.confirm(
      `Also rename the synced file?\n\n` +
        `${status.filename}  →  ${target}\n\n` +
        `Links to the old name elsewhere in your vault will not be updated.`,
    )
  ) {
    return;
  }

  try {
    await IOUtils.move(oldPath, newPath, { noOverwrite: true });
    // Point the sync record at the new file, or the next sync would recreate
    // the old name and leave two copies of the note in the vault.
    addon.api.sync.updateSyncStatus(noteItem.id, {
      ...status,
      filename: target,
    });
    showHint(`File renamed to "${target}"`);
  } catch (err) {
    ztoolkit.log(err);
    showHint("The note was renamed, but the file could not be.");
  }
}
