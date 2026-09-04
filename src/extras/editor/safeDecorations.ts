import { DecorationSet } from "prosemirror-view";

export { safeDecorations };

/**
 * U22b: run a `decorations()` builder without letting it break the editor.
 *
 * A ProseMirror `decorations` prop is called on *every* view update. If it
 * throws — a position that no longer exists, an unexpected node shape, a
 * grammar that blows up — the exception propagates out of `updateState`, and
 * the editor stops applying transactions. In Zotero that surfaces as "my typing
 * isn't being saved", because the note is saved from the update cycle that just
 * died. A decorative feature must never be able to cost the user their edits.
 *
 * So: on the first failure the feature disables itself for the rest of the
 * session and logs once (logging on every keystroke would flood the console),
 * and the editor carries on with no decorations from it.
 */
function safeDecorations(
  label: string,
  build: () => DecorationSet,
): DecorationSet {
  if (disabled.has(label)) {
    return DecorationSet.empty;
  }
  try {
    return build();
  } catch (e) {
    disabled.add(label);
    console.error(
      `EN: ${label} decorations failed and have been disabled for this session. Editing is unaffected.`,
      e,
    );
    return DecorationSet.empty;
  }
}

const disabled = new Set<string>();
