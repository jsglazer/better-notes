import { config } from "../package.json";
import { initLocale, getString } from "./utils/locale";
import { registerPrefsWindow } from "./modules/preferenceWindow";
import { registerNoteLinkProxyHandler } from "./modules/noteLink";
import {
  registerEditorInstanceHook,
  unregisterEditorInstanceHook,
} from "./modules/editor/initalize";
import {
  importTemplateFromClipboard,
  initTemplates,
} from "./modules/template/controller";
import { registerMenus } from "./modules/menu";
import { initWorkspace } from "./modules/workspace/content";
import { openWorkspaceWindow } from "./modules/workspace/window";
import { openNotePreview } from "./modules/workspace/preview";
import { registerNotify, unregisterNotify } from "./modules/notify";
import {
  registerReaderAnnotationButton,
  syncAnnotationNoteTags,
} from "./modules/annotationNote";
import {
  registerAnnotationColorLabelPatch,
  unregisterAnnotationColorLabelPatch,
} from "./modules/annotationColorLabels";
import {
  registerColorLabelsEndpoint,
  unregisterColorLabelsEndpoint,
} from "./modules/colorLabelsServer";
import { registerTagEndpoint, unregisterTagEndpoint } from "./modules/tagServer";
import {
  registerLinkEndpoint,
  unregisterLinkEndpoint,
} from "./modules/linkServer";
import { setSyncing, unsetSyncing, callSyncing } from "./modules/sync/hooks";
import { showTemplatePicker } from "./modules/template/picker";
import { showImageViewer } from "./modules/imageViewer";
import { showExportNoteOptions } from "./modules/export/exportWindow";
import { showSyncDiff } from "./modules/sync/diffWindow";
import { showSyncInfo } from "./modules/sync/infoWindow";
import { showSyncManager } from "./modules/sync/managerWindow";
import { showTemplateEditor } from "./modules/template/editorWindow";
import { getEditorInstances, getEditorItem } from "./modules/editor/adapter";
import {
  createNoteFromTemplate,
  createNoteFromMD,
  createNote,
} from "./modules/createNote";
import { createZToolkit } from "./utils/ztoolkit";
import { waitUtilAsync } from "./utils/wait";
import { initSyncList } from "./modules/sync/api";
import { getFocusedWindow } from "./utils/window";
import { closeRelationServer } from "./utils/relation";
import { showUserGuide } from "./modules/userGuide";
import { refreshTemplatesInNote } from "./modules/template/refresh";
import { closeParsingServer } from "./utils/parsing";
import { patchExportItems } from "./modules/patches/exportItems";
import { closeConvertServer } from "./utils/convert";
import { patchNoteEditorCE } from "./modules/patches/noteEditor";
import { openLinkCreator } from "./utils/linkCreator";
import { showHint } from "./utils/hint";
import { patchNoteCreation, patchNotes } from "./modules/patches/notes";
import { revertPatches } from "./modules/patches/registry";
import {
  registerKeyboardShortcuts,
  unregisterKeyboardShortcuts,
} from "./modules/shortcuts";
import {
  registerSettingsSync,
  unregisterSettingsSync,
  onSettingsNoteModified,
  isSettingsNote,
  pushSettings,
  pullSettings,
  exportSettingsToFile,
  importSettingsFromFile,
} from "./modules/settingsSync";

async function onStartup() {
  await Promise.all([
    Zotero.initializationPromise,
    Zotero.unlockPromise,
    Zotero.uiReadyPromise,
  ]);
  initLocale();
  ztoolkit.ProgressWindow.setIconURI(
    "default",
    `chrome://${config.addonRef}/content/icons/favicon.png`,
  );

  registerMenus();

  registerNoteLinkProxyHandler();

  registerEditorInstanceHook();

  registerPrefsWindow();

  registerReaderAnnotationButton();

  registerAnnotationColorLabelPatch();

  registerColorLabelsEndpoint();

  registerTagEndpoint();

  registerLinkEndpoint();

  patchNotes();

  initSyncList();

  registerSettingsSync();

  setSyncing();

  await Promise.all(Zotero.getMainWindows().map(onMainWindowLoad));

  // For testing
  addon.data.initialized = true;
}

async function onMainWindowLoad(win: _ZoteroTypes.MainWindow): Promise<void> {
  await waitUtilAsync(() => win.document.readyState === "complete");

  Services.scriptloader.loadSubScript(
    `chrome://${config.addonRef}/content/scripts/customElements.js`,
    win,
  );

  win.document.l10n?.addResourceIds([`${config.addonRef}-mainWindow.ftl`]);

  // Create ztoolkit for every window
  addon.data.ztoolkit = createZToolkit();

  registerNotify(["tab", "item", "item-tag"], win);

  initTemplates();

  patchExportItems(win);

  patchNoteCreation(win);

  patchNoteEditorCE(win);

  registerKeyboardShortcuts(win);

  showUserGuide(win);
}

async function onMainWindowUnload(win: Window): Promise<void> {
  win.document.l10n?.removeResourceIds([
    `${config.addonRef}-mainWindow.ftl`,
    `${config.addonRef}-notePreview.ftl`,
    `${config.addonRef}-outline.ftl`,
  ]);
  unregisterKeyboardShortcuts(win);
  ztoolkit.unregisterAll();
}

function onShutdown(): void {
  // Each teardown step is isolated AND labeled: a failure in one (e.g. a worker
  // that's already gone) must not prevent the others — or the caller's chrome
  // teardown — from running, which would leave the plugin un-removable without a
  // restart. Failures are logged via Zotero.debug (ztoolkit is torn down here).
  const step = (label: string, fn: () => void) => {
    try {
      fn();
    } catch (e) {
      try {
        Zotero.debug(
          `[enhanced-notes] onShutdown step '${label}' failed: ${e}`,
        );
      } catch (_e) {
        /* no-op */
      }
    }
  };

  // Stop the recurring auto-sync timer FIRST: a live setInterval keeps the
  // plugin's code in use and makes Zotero defer removal to a restart.
  step("unsetSyncing", () => unsetSyncing());

  step("unregisterSettingsSync", () => unregisterSettingsSync());

  step("closeRelationServer", () => closeRelationServer());
  step("closeParsingServer", () => closeParsingServer());
  step("closeConvertServer", () => closeConvertServer());

  // Tear down the global item observer — no pluginID, so Zotero won't auto-
  // unregister it, and its window-unload listener doesn't fire on an uninstall.
  step("unregisterNotify", () => unregisterNotify());

  step("unregisterEditorInstanceHook", () => unregisterEditorInstanceHook());

  step("unregisterAnnotationColorLabelPatch", () =>
    unregisterAnnotationColorLabelPatch(),
  );

  step("unregisterColorLabelsEndpoint", () => unregisterColorLabelsEndpoint());

  step("unregisterTagEndpoint", () => unregisterTagEndpoint());
  step("unregisterLinkEndpoint", () => unregisterLinkEndpoint());

  // Restore every monkey-patched Zotero/global method to its original, so no
  // plugin code stays reachable from Zotero core after teardown.
  step("revertPatches", () => revertPatches());

  Zotero.getMainWindows().forEach((win, i) => {
    step("onMainWindowUnload#" + i, () => onMainWindowUnload(win));
  });

  step("ztoolkit.unregisterAll", () => ztoolkit.unregisterAll());
  // Remove addon object
  addon.data.alive = false;
  // @ts-ignore plugin instance
  delete Zotero[config.addonInstance];
}

/**
 * This function is just an example of dispatcher for Notify events.
 * Any operations should be placed in a function to keep this funcion clear.
 */
async function onNotify(
  event: Parameters<_ZoteroTypes.Notifier.Notify>["0"],
  type: Parameters<_ZoteroTypes.Notifier.Notify>["1"],
  ids: Parameters<_ZoteroTypes.Notifier.Notify>["2"],
  extraData: Parameters<_ZoteroTypes.Notifier.Notify>["3"],
) {
  if (extraData?.skipBN) {
    return;
  }
  if (
    ["add", "close"].includes(event) &&
    type === "tab" &&
    extraData[ids[0]]?.type === "note"
  ) {
    Zotero.Session.debounceSave();
  }
  if (event === "delete" && type === "item") {
    for (const id of ids) {
      const noteId = Number(id);
      if (addon.api.sync.isSyncNote(noteId)) {
        addon.api.sync.removeSyncNote(noteId);
      }
    }
  }
  if (event === "modify" && type === "item") {
    const allModifiedNotes = Zotero.Items.get(ids).filter((item) =>
      item.isNote(),
    );
    // The settings note is plugin bookkeeping, not user content: pull from it,
    // but keep it out of markdown sync and link-relation maintenance.
    const settingsNotes = allModifiedNotes.filter(isSettingsNote);
    for (const item of settingsNotes) {
      await onSettingsNoteModified(item);
    }
    const modifiedNotes = allModifiedNotes.filter(
      (item) => !isSettingsNote(item),
    );
    if (modifiedNotes.length) {
      addon.hooks.onSyncing(modifiedNotes, {
        quiet: true,
        skipActive: true,
        reason: "item-modify",
      });
      for (const item of modifiedNotes) {
        await addon.api.relation.updateNoteLinkRelation(item.id);
      }
    }
  }
  if (type === "item-tag") {
    for (const itemTagID of ids) {
      await syncAnnotationNoteTags(
        Number((itemTagID as string).split("-")[0]),
        event as "add" | "remove",
        extraData[itemTagID],
      );
    }
  }
}

/**
 * This function is just an example of dispatcher for Preference UI events.
 * Any operations should be placed in a function to keep this funcion clear.
 * @param type event type
 * @param data event data
 */
async function onPrefsEvent(type: string, data: { [key: string]: any }) {
  switch (type) {
    case "load":
      // registerPrefsScripts(data.window);
      break;
    default:
      return;
  }
}

interface OpenNoteReturns {
  auto: Window | string | void;
  preview: void;
  tab: string | void;
  window: Window | void;
  builtin: void;
}

async function onOpenNote<K extends keyof OpenNoteReturns>(
  noteId: number,
  mode: K = "auto" as K,
  options: {
    workspaceUID?: string;
    lineIndex?: number;
    sectionName?: string;
    forceTakeover?: boolean;
  } = {},
): Promise<OpenNoteReturns[K]> {
  const win = Zotero.getMainWindow();
  if (!win) {
    return;
  }
  if (!options.forceTakeover) {
    win.ZoteroPane.openNote(noteId);
    return;
  }
  let { workspaceUID } = options;
  const noteItem = Zotero.Items.get(noteId);
  if (!noteItem?.isNote()) {
    ztoolkit.log(`onOpenNote: ${noteId} is not a note.`);
    return;
  }
  if (mode === "auto") {
    const currentWindow = getFocusedWindow();

    if (
      (currentWindow as _ZoteroTypes.MainWindow)?.Zotero_Tabs?.selectedType ===
      "note"
    ) {
      mode = "preview" as K;
      workspaceUID = (
        currentWindow as _ZoteroTypes.MainWindow
      ).Zotero_Tabs.getTabInfo().id;
    } else if (currentWindow?.document.querySelector("body.workspace-window")) {
      mode = "preview" as K;
      workspaceUID = (
        currentWindow.document.querySelector("bn-workspace") as
          | HTMLElement
          | undefined
      )?.dataset.uid;
    } else {
      mode = "tab" as K;
    }
  }
  switch (mode) {
    case "preview":
      if (!workspaceUID) {
        throw new Error(
          "enhanced-notes onOpenNote mode=preview must have workspaceUID provided.",
        );
      }
      openNotePreview(noteItem, workspaceUID, options);
      break;
    case "tab":
      return win.ZoteroPane.openNote(noteId, { openInWindow: false }) as any;
      break;
    case "window":
      return (await openWorkspaceWindow(noteItem, options)) as any;
      break;
    case "builtin":
      win.ZoteroPane.openNote(noteId);
      break;
    default:
      break;
  }
}

const onInitWorkspace = initWorkspace;

const onSyncing = callSyncing;

const onShowTemplatePicker = showTemplatePicker;

const onImportTemplateFromClipboard = importTemplateFromClipboard;

const onRefreshTemplatesInNote = refreshTemplatesInNote;

const onShowImageViewer = showImageViewer;

const onShowExportNoteOptions = showExportNoteOptions;

const onShowSyncInfo = showSyncInfo;

const onShowSyncManager = showSyncManager;

const onShowSyncDiff = showSyncDiff;

const onShowTemplateEditor = showTemplateEditor;

const onCreateNoteFromTemplate = createNoteFromTemplate;

const onCreateNote = createNote;

const onCreateNoteFromMD = createNoteFromMD;

const onShowUserGuide = showUserGuide;

function onShowLinkCreator() {
  const editors = getEditorInstances().filter((e) => getEditorItem(e));
  if (!editors.length) {
    showHint(getString("alert-linkCreator-emptyNote"));
    return;
  }
  const noteItem = getEditorItem(editors[0]);
  setTimeout(() => openLinkCreator(noteItem), 0);
}

function onSettingsSyncPush() {
  pushSettings()
    .then(() => showHint("Settings written to the shared Zotero note."))
    .catch((e) => showHint(`Could not write settings: ${e}`));
}

function onSettingsSyncPull() {
  pullSettings({ quiet: false }).catch((e) =>
    showHint(`Could not read settings: ${e}`),
  );
}

function onSettingsSyncExport() {
  exportSettingsToFile().catch((e) => showHint(`Export failed: ${e}`));
}

function onSettingsSyncImport() {
  importSettingsFromFile().catch((e) => showHint(`Import failed: ${e}`));
}

// Add your hooks here. For element click, etc.
// Keep in mind hooks only do dispatch. Don't add code that does real jobs in hooks.
// Otherwise the code would be hard to read and maintain.

export default {
  onStartup,
  onMainWindowLoad,
  onMainWindowUnload,
  onShutdown,
  onNotify,
  onPrefsEvent,
  onOpenNote,
  onInitWorkspace,
  onSyncing,
  onShowTemplatePicker,
  onImportTemplateFromClipboard,
  onRefreshTemplatesInNote,
  onShowImageViewer,
  onShowExportNoteOptions,
  onShowSyncDiff,
  onShowSyncInfo,
  onShowSyncManager,
  onShowTemplateEditor,
  onCreateNoteFromTemplate,
  onCreateNoteFromMD,
  onCreateNote,
  onShowUserGuide,
  onShowLinkCreator,
  onSettingsSyncPush,
  onSettingsSyncPull,
  onSettingsSyncExport,
  onSettingsSyncImport,
};
