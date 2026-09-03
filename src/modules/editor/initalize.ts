import {
  editorInternalsReady,
  getEditorInitPromise,
  getEditorInstances,
  getEditorItem,
  getEditorAPI,
  getEditorWindow,
  isEditorAlive,
} from "./adapter";
import { initEditorImagePreviewer } from "./image";
import {
  registerPrefObserver,
  unregisterPrefObserver,
} from "../../utils/prefs";
import { clearInputActivity, trackEditorInput } from "./inputActivity";
import {
  injectEditorCSS,
  injectEditorKatexCSS,
  injectEditorScripts,
} from "./inject";
import { initEditorPlugins } from "./plugins";
import { initEditorMenu } from "./menu";
import { initEditorPopup } from "./popup";
import { initEditorToolbar } from "./toolbar";

let prefsObserver = Symbol();
let customCSSObserver: symbol | undefined;
let readableWidthObserver: symbol | undefined;

export function registerEditorInstanceHook() {
  Zotero.Notes.registerEditorInstance = new Proxy(
    Zotero.Notes.registerEditorInstance,
    {
      apply: (
        target,
        thisArg,
        argumentsList: [instance: Zotero.EditorInstance],
      ) => {
        target.apply(thisArg, argumentsList);
        argumentsList.forEach(onEditorInstanceCreated);
      },
    },
  );
  getEditorInstances().forEach(onEditorInstanceCreated);

  // For unknown reasons, the css becomes undefined after font size change
  prefsObserver = Zotero.Prefs.registerObserver("note.fontSize", () => {
    getEditorInstances().forEach((editor) => {
      injectEditorCSS(getEditorWindow(editor));
    });
  });

  // Re-inject when the user's custom CSS changes, so an edit in the
  // preferences pane shows up in the notes they already have open instead of
  // waiting for a reopen or a restart.
  customCSSObserver = registerPrefObserver("editor.customCSS", () => {
    getEditorInstances().forEach((editor) => {
      injectEditorCSS(getEditorWindow(editor));
    });
  });

  // Width is a body class, so it can be flipped on open editors directly. The
  // other new editor toggles (callouts, code highlighting, heading collapse,
  // input rules) reconfigure the ProseMirror plugin list, which is only built
  // when an editor opens — those take effect on newly opened notes.
  readableWidthObserver = registerPrefObserver(
    "editor.readableWidth",
    (value) => {
      getEditorInstances().forEach((editor) => {
        try {
          getEditorAPI(editor)?.updateEditorLayout(Boolean(value));
        } catch (e) {
          // A dead or half-initialized editor is expected here.
        }
      });
    },
  );
}

export function unregisterEditorInstanceHook() {
  Zotero.Prefs.unregisterObserver(prefsObserver);
  if (customCSSObserver) {
    unregisterPrefObserver(customCSSObserver);
    customCSSObserver = undefined;
  }
  if (readableWidthObserver) {
    unregisterPrefObserver(readableWidthObserver);
    readableWidthObserver = undefined;
  }
  clearInputActivity();
}

async function onEditorInstanceCreated(editor: Zotero.EditorInstance) {
  await getEditorInitPromise(editor);
  if (!addon.data.alive) {
    return;
  }

  // Degrade gracefully if Zotero's editor internals aren't where we expect.
  if (!editorInternalsReady(editor)) {
    return;
  }
  // item.getNote may not be initialized yet
  if (Zotero.ItemTypes.getID("note") !== getEditorItem(editor).itemTypeID) {
    return;
  }
  // The editor instance may be destroyed before the promise resolves
  try {
    await injectEditorScripts(getEditorWindow(editor));
    injectEditorKatexCSS(getEditorWindow(editor));
    injectEditorCSS(getEditorWindow(editor));
    trackEditorInput(editor);
    initEditorImagePreviewer(editor);
    await initEditorToolbar(editor);
    initEditorPopup(editor);
    initEditorMenu(editor);
    initEditorPlugins(editor);
  } catch (e) {
    // Only surface real errors — a destroyed/dead editor mid-init is expected.
    if (isEditorAlive(editor)) {
      throw e;
    }
  }
}
