import { config } from "../../package.json";
import { getAnnotationColorLabel } from "../utils/annotation";
import { applyPatch } from "./patches/registry";

export {
  registerAnnotationColorLabelPatch,
  unregisterAnnotationColorLabelPatch,
};

/**
 * Renames Zotero's own reader color-picker/popup labels (e.g. "Yellow" ->
 * "Key") using the existing per-color `colorLabel` prefs. There is no
 * official Zotero Reader API for this — `createColorContextMenu` etc. only
 * support *appending* menu content, not rewriting the built-in items.
 *
 * Two entirely different mechanisms are involved, both verified against
 * Zotero 7's actual bundled client code (not guessed):
 *
 * 1. The "create a new highlight" selection popup is real HTML, rendered by
 *    the reader iframe itself (`src/common/components/view-popup/
 *    selection-popup.js`: `.selection-popup .colors .color-button`). We
 *    DOM-patch it directly, refreshed via a `MutationObserver`.
 * 2. Every *context menu* that offers a color (the "..." -> Add to Note
 *    menu on an existing annotation, the toolbar's color dropdown, etc.) is
 *    a native XUL `<menupopup>` built by chrome-side code
 *    (`ReaderInstance._openContextMenu()` in `chrome/content/zotero/xpcom/
 *    reader.js`) from `itemGroups` data — it never touches the reader
 *    iframe's DOM at all, so no amount of DOM-patching there can reach it.
 *    Each color item already carries its raw hex in `item.color`, so we
 *    monkey-patch `_openContextMenu` per reader instance to rewrite
 *    `item.label` before the native menu is built.
 *
 * Both are unofficial and depend on Zotero's internals, so every step here
 * degrades silently on a mismatch instead of breaking the reader. A future
 * Zotero update could stop matching without ill effect beyond the rename no
 * longer applying.
 */

const COLOR_BUTTON_SELECTORS = [".selection-popup .colors .color-button"];

// The 8 hex values Better Notes already exposes as `annotationColorLabel.<hex>`
// prefs (addon/prefs.js) — Zotero's own default annotation color set
// (`ANNOTATION_COLORS` in the reader bundle). Used only as a last-resort
// fallback to guess a selection-popup button's color from its (English)
// title when the color swatch's fill can't be read from the markup.
const DEFAULT_COLOR_NAMES: Record<string, string> = {
  ffd400: "yellow",
  ff6666: "red",
  "5fb236": "green",
  "2ea8e5": "blue",
  a28ae5: "purple",
  e56eee: "magenta",
  f19837: "orange",
  aaaaaa: "gray",
};

// Caches each button's detected color so a later pass (after we've already
// overwritten its title) doesn't lose the ability to re-detect it.
const detectedHex = new WeakMap<Element, string>();

const observedDocs = new WeakSet<Document>();
const activeObservers = new Set<MutationObserver>();
const patchedContextMenuReaders = new WeakSet<object>();

function colorToHex(value?: string | null): string | null {
  if (!value) {
    return null;
  }
  const hexMatch = value.match(/^#?([0-9a-f]{6})$/i);
  if (hexMatch) {
    return hexMatch[1].toLowerCase();
  }
  const rgbMatch = value.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
  if (rgbMatch) {
    return rgbMatch
      .slice(1, 4)
      .map((n) => Number(n).toString(16).padStart(2, "0"))
      .join("");
  }
  return null;
}

/** Zotero's `IconColor16` renders the color on an inner `<path fill>`, not
 * on the `<svg>` itself (the `<svg>` always has `fill="none"`) — checking
 * the outer element alone silently finds nothing. This is language-
 * independent, unlike the title-text fallback below, so it's tried first. */
function detectHexFromStyle(button: HTMLElement): string | null {
  const candidates = [
    button.querySelector("svg path[fill]")?.getAttribute("fill"),
    button.style?.backgroundColor,
    (button.querySelector('[style*="background"]') as HTMLElement | null)?.style
      ?.backgroundColor,
  ];
  for (const candidate of candidates) {
    const hex = colorToHex(candidate);
    if (hex) {
      return hex;
    }
  }
  return null;
}

/** English-name fallback only — Zotero's default color names are localized,
 * so this misses on non-English UIs. Only reached when the SVG fill can't
 * be read at all. */
function detectHexFromTitle(title: string): string | null {
  const lower = title.toLowerCase();
  for (const [hex, name] of Object.entries(DEFAULT_COLOR_NAMES)) {
    if (lower.includes(name)) {
      return hex;
    }
  }
  return null;
}

function getButtonHex(button: HTMLElement): string | null {
  const cached = detectedHex.get(button);
  if (cached) {
    return cached;
  }
  const hex =
    detectHexFromStyle(button) ||
    detectHexFromTitle(button.title || button.getAttribute("aria-label") || "");
  if (hex) {
    detectedHex.set(button, hex);
  }
  return hex;
}

function applyColorLabelToButton(button: HTMLElement): void {
  const hex = getButtonHex(button);
  if (!hex) {
    return;
  }
  const label = getAnnotationColorLabel(hex);
  if (!label) {
    return;
  }
  if (button.title) {
    button.title = label;
  }
  if (button.hasAttribute("aria-label")) {
    button.setAttribute("aria-label", label);
  }
}

function applyColorLabels(doc: Document): void {
  try {
    const buttons = new Set<Element>();
    for (const selector of COLOR_BUTTON_SELECTORS) {
      doc.querySelectorAll(selector).forEach((el) => buttons.add(el));
    }
    buttons.forEach((el) => {
      try {
        applyColorLabelToButton(el as HTMLElement);
      } catch (e) {
        // one bad button must not stop the rest.
      }
    });
  } catch (e) {
    // reader markup didn't match what we expect — degrade silently rather
    // than breaking the reader (see module doc comment above).
  }
}

/** Re-applies the rename whenever the reader re-renders the selection
 * popup — it mounts well after the triggering reader event fires, so a
 * one-shot pass in the event handler would miss it; the observer catches
 * the actual DOM insertion. */
function ensureObserver(doc: Document): void {
  if (observedDocs.has(doc) || !doc.body || !doc.defaultView) {
    return;
  }
  observedDocs.add(doc);
  try {
    const observer = new doc.defaultView.MutationObserver(() => {
      applyColorLabels(doc);
    });
    observer.observe(doc.body, { childList: true, subtree: true });
    activeObservers.add(observer);
  } catch (e) {
    // doc/window already gone — nothing to observe.
  }
}

interface ContextMenuItem {
  label?: string;
  color?: string;
}

interface ContextMenuData {
  itemGroups: ContextMenuItem[][];
}

/** Every reader context menu that offers a color (existing-annotation
 * "Add to Note" menu, toolbar color dropdown, ...) is a native XUL
 * `<menupopup>` built by `_openContextMenu` directly from `itemGroups` —
 * there's no HTML to DOM-patch. Each color item already carries its raw
 * hex in `.color`, so we rewrite `.label` before the menu is built.
 * Patched per reader instance (own-property shadow, not the shared
 * prototype) via the shared patch registry, so it's reverted on shutdown
 * along with the rest of this plugin's patches. */
function patchReaderContextMenu(reader: unknown): void {
  const target = reader as
    | { _openContextMenu?: (data: ContextMenuData) => unknown }
    | null
    | undefined;
  if (
    !target ||
    typeof target._openContextMenu !== "function" ||
    patchedContextMenuReaders.has(target)
  ) {
    return;
  }
  patchedContextMenuReaders.add(target);
  applyPatch(
    target,
    "_openContextMenu",
    (original) =>
      function (this: unknown, data: ContextMenuData) {
        for (const group of data?.itemGroups || []) {
          for (const item of group) {
            if (item?.color) {
              const label = getAnnotationColorLabel(item.color);
              if (label) {
                item.label = label;
              }
            }
          }
        }
        return original.call(this, data);
      },
  );
}

function handleReaderEvent(event: {
  doc: Document;
  reader: _ZoteroTypes.ReaderInstance;
}): void {
  applyColorLabels(event.doc);
  ensureObserver(event.doc);
  patchReaderContextMenu(event.reader);
}

/** Registered once at startup; Zotero scopes reader event listeners to our
 * pluginID and clears them on teardown, same as `registerReaderAnnotationButton`. */
function registerAnnotationColorLabelPatch(): void {
  Zotero.Reader.registerEventListener(
    "renderTextSelectionPopup",
    handleReaderEvent,
    config.addonID,
  );
  Zotero.Reader.registerEventListener(
    "renderSidebarAnnotationHeader",
    handleReaderEvent,
    config.addonID,
  );
  Zotero.Reader.registerEventListener(
    "createColorContextMenu",
    handleReaderEvent,
    config.addonID,
  );
  Zotero.Reader.registerEventListener(
    "createAnnotationContextMenu",
    handleReaderEvent,
    config.addonID,
  );
}

/** Disconnects observers we attached to reader documents. The reader event
 * listeners themselves are torn down by Zotero via the pluginID scoping;
 * the `_openContextMenu` per-instance patches are torn down by the shared
 * `revertPatches()` call in `onShutdown`. */
function unregisterAnnotationColorLabelPatch(): void {
  for (const observer of activeObservers) {
    try {
      observer.disconnect();
    } catch (e) {
      // doc/window already gone.
    }
  }
  activeObservers.clear();
}
