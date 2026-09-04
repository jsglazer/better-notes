import { config } from "../../package.json";

// NOTE on keyboard-shortcut hints: these Tools items show a right-aligned
// accelerator (⌃⌥L/M/T) by pointing their `key` attribute at a real <key>
// element (registered in shortcuts.ts). On macOS the Tools menu is the native
// Cocoa menubar, which derives the right-aligned shortcut column from that
// <key> — it ignores a JS-set `acceltext` (a prior attempt that rendered
// nothing) and only renders a label-baked hint left-aligned. The `key`
// attribute is set in onShowing (MenuManager builds the menuitem on
// popupshowing, before native menu construction, so the equivalent is present
// when the native item is built). The <key> elements are command-less, so the
// keydown listener in shortcuts.ts remains the actual handler.

function setShortcutKey(
  context: { menuElem: XULElement },
  keyId: string,
): void {
  try {
    context.menuElem.setAttribute("key", keyId);
  } catch (e) {
    // menu element not ready / detached — no hint, no harm.
  }
}

export function registerMenus() {
  Zotero.MenuManager.registerMenu({
    menuID: `${config.addonRef}-menuTools`,
    pluginID: config.addonID,
    target: "main/menubar/tools",
    menus: [
      {
        menuType: "separator",
      },
      {
        menuType: "menuitem",
        l10nID: `${config.addonRef}-menuTools-linkCreator`,
        icon: `chrome://${config.addonRef}/content/icons/favicon.png`,
        onShowing: (_, context) =>
          setShortcutKey(context, "zotero-bn-key-linkCreator"),
        onCommand: () => {
          addon.hooks.onShowLinkCreator();
        },
      },
      {
        menuType: "menuitem",
        l10nID: `${config.addonRef}-menuTools-syncManager`,
        icon: `chrome://${config.addonRef}/content/icons/favicon.png`,
        onShowing: (_, context) =>
          setShortcutKey(context, "zotero-bn-key-syncManager"),
        onCommand: () => {
          addon.hooks.onShowSyncManager();
        },
      },
      {
        menuType: "menuitem",
        l10nID: `${config.addonRef}-menuTools-templateEditor`,
        icon: `chrome://${config.addonRef}/content/icons/favicon.png`,
        onShowing: (_, context) =>
          setShortcutKey(context, "zotero-bn-key-templateEditor"),
        onCommand: () => {
          addon.hooks.onShowTemplateEditor();
        },
      },
      {
        menuType: "menuitem",
        l10nID: `${config.addonRef}-menuTools-importTemplateFromClipboard`,
        icon: `chrome://${config.addonRef}/content/icons/favicon.png`,
        onCommand: () => {
          addon.hooks.onImportTemplateFromClipboard();
        },
      },
    ],
  });

  Zotero.MenuManager.registerMenu({
    menuID: `${config.addonRef}-menuFile`,
    pluginID: config.addonID,
    target: "main/menubar/file",
    menus: [
      {
        menuType: "separator",
      },
      {
        menuType: "menuitem",
        l10nID: `${config.addonRef}-menuFile-exportTemplate`,
        icon: `chrome://${config.addonRef}/content/icons/favicon.png`,
        onCommand: () => {
          addon.hooks.onShowTemplatePicker("export");
        },
      },
    ],
  });

  Zotero.MenuManager.registerMenu({
    menuID: `${config.addonRef}-menuNewNote`,
    pluginID: config.addonID,
    target: "main/library/addNote",
    menus: [
      {
        menuType: "menuitem",
        l10nID: `${config.addonRef}-menuAddNote-importMD`,
        icon: `chrome://${config.addonRef}/content/icons/favicon.png`,
        onCommand: () => addon.hooks.onCreateNoteFromMD(),
      },
      {
        menuType: "menuitem",
        l10nID: `${config.addonRef}-menuAddNote-newTemplateItemNote`,
        icon: `chrome://${config.addonRef}/content/icons/favicon.png`,
        onCommand: () =>
          addon.hooks.onCreateNoteFromTemplate("item", "library"),
      },
      {
        menuType: "menuitem",
        l10nID: `${config.addonRef}-menuAddNote-newTemplateStandaloneNote`,
        icon: `chrome://${config.addonRef}/content/icons/favicon.png`,
        onCommand: () => addon.hooks.onCreateNoteFromTemplate("standalone"),
      },
    ],
  });

  Zotero.MenuManager.registerMenu({
    menuID: `${config.addonRef}-menuCollectionExportNotes`,
    pluginID: config.addonID,
    target: "main/library/collection",
    menus: [
      {
        menuType: "menuitem",
        l10nID: `${config.addonRef}-menuCollection-exportNotes`,
        icon: `chrome://${config.addonRef}/content/icons/favicon.png`,
        onShowing: (_, context) => {
          context.setVisible(context.collectionTreeRow?.type === "collection");
        },
        onCommand: (_, context) => {
          const collection = context.collectionTreeRow?.ref as
            | Zotero.Collection
            | undefined;
          if (!collection) {
            return;
          }
          addon.hooks.onShowExportNoteOptions(
            collection.getChildItems(true, false),
          );
        },
      },
    ],
  });

  Zotero.MenuManager.registerMenu({
    menuID: `${config.addonRef}-menuHelp`,
    pluginID: config.addonID,
    target: "main/menubar/help",
    menus: [
      {
        menuType: "menuitem",
        l10nID: `${config.addonRef}-menuHelp-openUserGuide`,
        icon: `chrome://${config.addonRef}/content/icons/favicon.png`,
        onCommand: () =>
          addon.hooks.onShowUserGuide(Zotero.getMainWindow(), true),
      },
    ],
  });

  Zotero.MenuManager.registerMenu({
    menuID: `${config.addonRef}-menuAddNotesPaneStandaloneNote`,
    pluginID: config.addonID,
    target: "notesPane/addStandaloneNote",
    menus: [
      {
        menuType: "menuitem",
        l10nID: `${config.addonRef}-menuAddNote-newTemplateStandaloneNote`,
        icon: `chrome://${config.addonRef}/content/icons/favicon.png`,
        onCommand: () => addon.hooks.onCreateNoteFromTemplate("standalone"),
      },
    ],
  });

  Zotero.MenuManager.registerMenu({
    menuID: `${config.addonRef}-menuAddNotesPaneItemNote`,
    pluginID: config.addonID,
    target: "notesPane/addItemNote",
    menus: [
      {
        menuType: "menuitem",
        l10nID: `${config.addonRef}-menuAddNote-newTemplateItemNote`,
        icon: `chrome://${config.addonRef}/content/icons/favicon.png`,
        onCommand: () => addon.hooks.onCreateNoteFromTemplate("item", "reader"),
      },
      {
        // U23: the item-note counterpart of the library toolbar's import.
        // "library" (not "reader") because this menu is driven by the item
        // selected in the pane, which is what getLibraryParentId reads.
        menuType: "menuitem",
        l10nID: `${config.addonRef}-menuAddNote-importMDItemNote`,
        icon: `chrome://${config.addonRef}/content/icons/favicon.png`,
        onCommand: () => addon.hooks.onCreateNoteFromMD("library"),
      },
    ],
  });

  Zotero.MenuManager.registerMenu({
    menuID: `${config.addonRef}-menuTabMoveNewWindow`,
    pluginID: config.addonID,
    target: "main/tab",
    menus: [
      {
        menuType: "menuitem",
        l10nID: `${config.addonRef}-menuTab-moveNewWindow`,
        onShowing(_, context) {
          context.setVisible(context.tabType.startsWith("note"));
        },
        onCommand: (_, context) => {
          addon.hooks.onOpenNote(context.items[0].id, "window", {
            forceTakeover: true,
          });
          (
            context.menuElem.ownerGlobal as _ZoteroTypes.MainWindow
          ).Zotero_Tabs.close(context.tabID);
        },
      },
    ],
  });

  Zotero.MenuManager.registerMenu({
    menuID: `${config.addonRef}-menuItemEnhancedNotes`,
    pluginID: config.addonID,
    target: "main/library/item",
    menus: [
      {
        menuType: "submenu",
        l10nID: `${config.addonRef}-menuItem-enhancedNotes`,
        icon: `chrome://${config.addonRef}/content/icons/favicon.png`,
        menus: [
          {
            menuType: "menuitem",
            l10nID: `${config.addonRef}-menuItem-newItemNoteFromTemplate`,
            onShowing: (_, context) => {
              context.setVisible(
                !!context.items?.some((item) => !item.isNote()),
              );
            },
            onCommand: (_, context) => {
              addon.hooks.onCreateNoteFromTemplate("item", "library");
            },
          },
          {
            menuType: "menuitem",
            l10nID: `${config.addonRef}-menuItem-exportCurrentNote`,
            onShowing: (_, context) => {
              context.setVisible(
                !!context.items?.every((item) => item.isNote()),
              );
            },
            onCommand: (_, context) => {
              const noteIds = (context.items || []).map((item) => item.id);
              if (noteIds.length) {
                addon.hooks.onShowExportNoteOptions(noteIds);
              }
            },
          },
        ],
      },
    ],
  });

  Zotero.MenuManager.registerMenu({
    menuID: `${config.addonRef}-openNoteAsBNWindow`,
    pluginID: config.addonID,
    target: "main/library/item",
    menus: [
      {
        menuType: "menuitem",
        l10nID: `${config.addonRef}-menu-openNoteAsBNWindow`,
        icon: `chrome://${config.addonRef}/content/icons/favicon.png`,
        onShowing: (_, context) => {
          context.setVisible(!!context.items?.every((item) => item.isNote()));
        },
        onCommand: (_, context) => {
          if (!context.items?.length) {
            return;
          }
          addon.hooks.onOpenNote(context.items[0].id, "window", {
            forceTakeover: true,
          });
        },
      },
    ],
  });
}
