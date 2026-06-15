/**
 * A tiny method-patch registry that can FULLY revert its patches on shutdown.
 *
 * The plugin monkey-patches several Zotero/global methods (note creation, export,
 * the note-editor custom element, the notes sidebar). The toolkit's
 * `PatchHelper.disable()` only flips an `enabled` flag — it leaves the wrapper
 * (and its closure over plugin code) installed on the target forever, so plugin
 * code stays reachable from Zotero core after teardown. Here we record the
 * ORIGINAL reference and restore it on shutdown, so nothing of ours lingers.
 *
 * The wrapper preserves the toolkit's safety semantics: run the patched
 * implementation, and on error log it and fall back to the original method.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyFn = (...args: any[]) => any;

interface AppliedPatch {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  target: any;
  key: string;
  original: AnyFn;
}

const applied: AppliedPatch[] = [];

/**
 * Patch `target[key]` with `patcher(original)`, recording the original so
 * {@link revertPatches} can restore it. Errors in the patched implementation are
 * logged and fall back to the original method (matching the previous behavior).
 */
export function applyPatch(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  target: any,
  key: string,
  patcher: (original: AnyFn) => AnyFn,
): void {
  const original = target[key] as AnyFn;
  const patched = patcher(original);
  target[key] = function (this: unknown, ...args: unknown[]) {
    try {
      return patched.apply(this, args);
    } catch (e) {
      Zotero.logError(e as Error);
      return original.apply(this, args);
    }
  };
  applied.push({ target, key, original });
}

/** Restore every patched method to its original reference (LIFO). */
export function revertPatches(): void {
  while (applied.length) {
    const p = applied.pop()!;
    try {
      p.target[p.key] = p.original;
    } catch (e) {
      // target gone (e.g. window closed) — nothing to restore.
    }
  }
}
