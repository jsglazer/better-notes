/**
 * Per-note "last typed" tracking (U2b-B).
 *
 * Background sync defers importing an external (Obsidian) edit into a note you
 * have open AND focused in Zotero, because the import reloads the live editor —
 * which would disturb the cursor / drop in-progress keystrokes. But "focused" is
 * not the same as "being typed into": a note you're merely *reading* can safely
 * receive the external edit. This module records the last keyboard/IME/paste
 * event time per note id so the sync loop can tell the two apart and let an idle
 * focused note import while still protecting one you're actively typing into.
 *
 * Listeners are attached in capture phase on each editor iframe's document (so
 * they fire regardless of the inner target) and removed on shutdown. Doc refs
 * are held weakly so a closed editor's iframe can still be GC'd.
 */
import { getEditorItem, getEditorWindow } from "./adapter";

/** Default idle window: a note untouched for this long is safe to import into. */
export const IDLE_MS = 3000;

const lastInputAt = new Map<number, number>();
const tracked = new WeakSet<object>();
const registered: Array<{ ref: WeakRef<Document>; handler: EventListener }> =
  [];

const INPUT_EVENTS = ["keydown", "input", "compositionstart", "paste"] as const;

/** Start recording input activity for an editor instance (idempotent per doc). */
export function trackEditorInput(editor: Zotero.EditorInstance): void {
  let doc: Document | undefined;
  let noteId: number | undefined;
  try {
    doc = getEditorWindow(editor)?.document;
    noteId = getEditorItem(editor)?.id;
  } catch (e) {
    return;
  }
  if (!doc || !noteId || tracked.has(doc)) {
    return;
  }
  const id = noteId;
  const handler: EventListener = () => {
    lastInputAt.set(id, Date.now());
  };
  for (const type of INPUT_EVENTS) {
    doc.addEventListener(type, handler, true);
  }
  tracked.add(doc);
  registered.push({ ref: new WeakRef(doc), handler });
}

/** Milliseconds since the last input event in this note, or Infinity if never. */
export function msSinceLastInput(noteId: number): number {
  const t = lastInputAt.get(noteId);
  return t === undefined ? Number.POSITIVE_INFINITY : Date.now() - t;
}

/** True when the note hasn't received input for at least `idleMs`. */
export function isEditorIdle(
  noteId: number,
  idleMs: number = IDLE_MS,
): boolean {
  return msSinceLastInput(noteId) > idleMs;
}

/** Remove every listener and drop all recorded activity. Safe at shutdown. */
export function clearInputActivity(): void {
  for (const { ref, handler } of registered) {
    const doc = ref.deref();
    if (!doc) {
      continue;
    }
    try {
      if (Components.utils.isDeadWrapper(doc)) {
        continue;
      }
      for (const type of INPUT_EVENTS) {
        doc.removeEventListener(type, handler, true);
      }
    } catch (e) {
      // iframe may already be gone — nothing to remove.
    }
  }
  registered.length = 0;
  lastInputAt.clear();
}
