/**
 * Editor coupling adapter (U6).
 *
 * Single, documented point of contact with Zotero's **internal** note-editor
 * (`EditorInstance`) and the injected ProseMirror bridge. These are private,
 * undocumented Zotero internals that can move or be renamed across Zotero
 * versions; centralizing them here means such a change touches one file, and
 * lets the plugin **feature-detect** and degrade gracefully (disable a feature)
 * instead of throwing deep inside the editor UI.
 *
 * Coupled internals:
 * - `editor._iframeWindow` — the editor `<iframe>`'s window
 * - `editor._item` — the note item being edited
 * - `editor._popup` — the editor popup element
 * - `editor._initPromise` — resolves once the editor is initialized
 * - `editor._iframeWindow.wrappedJSObject._currentEditorInstance._editorCore`
 *   — the injected ProseMirror `EditorCore` (the most fragile coupling)
 * - `editor._iframeWindow.wrappedJSObject.EnhancedNotesEditorAPI`
 *   — the API the injected script exposes back to the plugin
 *
 * Stable accessors (`getEditorWindow`/`getEditorItem`/…) are provided for call
 * sites to adopt; the fragile bridge (`getEditorCore`/`getEditorAPI`) and the
 * lifecycle guards (`isEditorAlive`/`editorInternalsReady`) are the parts that
 * matter most and are used by the injection lifecycle and the `utils/editor`
 * bridge functions.
 */

type EI = Zotero.EditorInstance;

export function getEditorWindow(editor: EI): Window {
  return editor._iframeWindow as unknown as Window;
}

export function getEditorItem(editor: EI): Zotero.Item {
  return editor._item;
}

export function getEditorPopup(editor: EI): Element | undefined {
  return editor._popup as unknown as Element | undefined;
}

export function getEditorInitPromise(editor: EI): Promise<unknown> | undefined {
  return editor._initPromise as unknown as Promise<unknown> | undefined;
}

export function getEditorInstances(): EI[] {
  return Zotero.Notes._editorInstances;
}

/** True when the editor's iframe is still a live (non-dead) wrapper. */
export function isEditorAlive(editor: EI): boolean {
  try {
    return (
      getEditorInstances().includes(editor) &&
      !Components.utils.isDeadWrapper(editor._iframeWindow)
    );
  } catch (e) {
    return false;
  }
}

/** Feature-detect: are the basic internals this plugin needs present? */
export function editorInternalsReady(editor: EI): boolean {
  return !!editor && !!editor._iframeWindow && !!editor._item;
}

/** Find a live editor instance editing the given note id, if one is open. */
export function findEditorInstance(noteId: number): EI | undefined {
  return getEditorInstances().find(
    (e) => e._item?.id === noteId && isEditorAlive(e),
  );
}

function injectedGlobals(editor: EI): any {
  return (editor._iframeWindow as any)?.wrappedJSObject;
}

/** The injected ProseMirror `EditorCore`, or undefined if the bridge isn't ready. */
export function tryGetEditorCore(editor: EI): EditorCore | undefined {
  return injectedGlobals(editor)?._currentEditorInstance?._editorCore;
}

/**
 * The injected `EditorCore`. Throws with context when the bridge is missing —
 * callers that can proceed without it should use {@link tryGetEditorCore}.
 */
export function getEditorCore(editor: EI): EditorCore {
  const core = tryGetEditorCore(editor);
  if (!core) {
    throw new Error(
      "[EnhancedNotes] editor core unavailable — Zotero editor internals may have changed.",
    );
  }
  return core;
}

/** The API the injected script exposes, or undefined if not ready. */
export function getEditorAPI(editor: EI): EditorAPI | undefined {
  return injectedGlobals(editor)?.EnhancedNotesEditorAPI as EditorAPI | undefined;
}
