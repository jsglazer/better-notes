import { DecorationSet } from "prosemirror-view";

export { safeDecorations, installGroupInterop };

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
 *
 * U24 adds two things beyond the try/catch — see {@link installGroupInterop}
 * and the empty-set short circuit below.
 */
function safeDecorations(
  label: string,
  build: () => DecorationSet,
): DecorationSet | null {
  if (disabled.has(label)) {
    return null;
  }
  installGroupInterop();
  let set: DecorationSet;
  try {
    set = build();
  } catch (e) {
    disabled.add(label);
    console.error(
      `EN: ${label} decorations failed and have been disabled for this session. Editing is unaffected.`,
      e,
    );
    return null;
  }
  // Contribute nothing rather than an empty set. Zotero's `viewDecorations`
  // only skips a result that is identical to *its* `DecorationSet.empty`, and
  // ours is a different object, so an empty set from us would still be counted
  // as a decoration source — see below for why the count matters.
  return set === DecorationSet.empty || set.find().length === 0 ? null : set;
}

const disabled = new Set<string>();

/**
 * U24: make our `DecorationSet`s survive Zotero's `DecorationGroup`.
 *
 * The plugin bundles its own copy of prosemirror-view, so the sets our plugins
 * return are not `instanceof` the `DecorationSet` inside Zotero's note editor.
 * That is invisible until *two or more* decoration sources are active at once,
 * because `DecorationGroup.from` short-circuits on a single member:
 *
 * ```js
 * static from(members) {
 *   switch (members.length) {
 *     case 0: return empty
 *     case 1: return members[0]                       // no instanceof check
 *     default: return new DecorationGroup(members.every(m => m instanceof DecorationSet) ? members
 *       : members.reduce((r, m) => r.concat(m instanceof DecorationSet ? m : m.members), []))
 *   }
 * }
 * ```
 *
 * With two of our plugins on, `every` is false, the fallback reads `m.members`
 * — a property our sets do not have — and `concat(undefined)` puts `undefined`
 * into the group. The next update then dies with
 * `can't access property "localsInner", this.members[r] is undefined`, thrown
 * out of `updateState` → `dispatchTransaction`. Typing still *renders* (the
 * browser already put the character in the DOM) but the transaction never
 * completes, so `docChanged` is never set and Zotero never saves the note. That
 * is the U22 "I can type but nothing is saved" report, and it explains why the
 * bisect only cleared when a single feature was left on.
 *
 * Teaching the prototype to answer `members` with `[this]` makes the fallback
 * build a correct group: the members it collects are our real sets, and Zotero
 * then calls `localsInner` / `forChild` / `eq` / `map` / `forEachSet` on them,
 * all of which our copy implements identically. It goes on the prototype, not
 * on the instances we hand out, because `forChild` and `map` return *new* sets
 * that get grouped in turn.
 *
 * Our own `DecorationGroup.from` is unaffected: for sets from our bundle the
 * `every(m => m instanceof DecorationSet)` test passes, so it never reads the
 * property.
 */
function installGroupInterop() {
  if (interopInstalled) {
    return;
  }
  interopInstalled = true;
  try {
    const proto = DecorationSet.prototype as unknown as Record<string, unknown>;
    if ("members" in proto) {
      return;
    }
    Object.defineProperty(proto, "members", {
      get(this: DecorationSet) {
        return [this];
      },
      configurable: true,
    });
  } catch (e) {
    console.warn("EN: could not install decoration group interop", e);
  }
}

let interopInstalled = false;
