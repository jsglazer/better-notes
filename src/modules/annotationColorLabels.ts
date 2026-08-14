import { config } from "../../package.json";
import { getAnnotationColorLabel } from "../utils/annotation";

export {
  registerAnnotationColorLabelPatch,
  unregisterAnnotationColorLabelPatch,
};

/**
 * Renames Zotero's own reader color-picker/popup labels (e.g. "Yellow" ->
 * "Key") using the existing per-color `colorLabel` prefs. There is no
 * official Zotero Reader API for this — `createColorContextMenu` etc. only
 * support *appending* menu content, not rewriting the built-in items. This
 * mirrors the confirmed DOM-patch technique from the third-party plugin
 * zotero-annotation-color-customizer (github.com/aidecameron/zotero-annotation-color-customizer):
 * find the reader's color buttons, match them to a color, and rewrite their
 * tooltip/text. It is unofficial and depends on the reader's internal
 * markup, so every step here degrades silently on a mismatch instead of
 * breaking the reader — a future Zotero reader update could stop matching
 * without ill effect beyond the rename no longer applying.
 */

// Tried in order; the first selector that matches anything in a given reader
// document wins. Reader markup has varied across Zotero 7 point releases.
const COLOR_BUTTON_SELECTORS = [
  ".selection-popup .colors .color-button",
  ".annotationPopup .colors .color-button",
  ".colors .color-button",
  ".color-button",
];

// The 8 hex values Better Notes already exposes as `annotationColorLabel.<hex>`
// prefs (addon/prefs.js) — Zotero's own default annotation color set, used
// here only as a fallback to guess a button's color from its title text when
// no fill/background color can be read from its markup.
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

function detectHexFromStyle(button: HTMLElement): string | null {
  const svg = button.querySelector("svg");
  const candidates = [
    svg?.getAttribute("fill"),
    svg?.style?.fill,
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

/** A leaf element whose visible text is the color's default English name
 * (e.g. a text label in a context-menu item), if the button has one. */
function findColorNameNode(
  button: HTMLElement,
  hex: string,
): HTMLElement | null {
  const expected = DEFAULT_COLOR_NAMES[hex];
  if (!expected) {
    return null;
  }
  const candidates = [button, ...Array.from(button.querySelectorAll("*"))];
  for (const el of candidates) {
    if (
      el instanceof HTMLElement &&
      el.childElementCount === 0 &&
      el.textContent?.trim().toLowerCase() === expected
    ) {
      return el;
    }
  }
  return null;
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
  const nameNode = findColorNameNode(button, hex);
  if (nameNode) {
    nameNode.textContent = label;
  }
}

function applyColorLabels(doc: Document): void {
  try {
    let buttons: NodeListOf<Element> | null = null;
    for (const selector of COLOR_BUTTON_SELECTORS) {
      const found = doc.querySelectorAll(selector);
      if (found.length) {
        buttons = found;
        break;
      }
    }
    if (!buttons) {
      return;
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

/** Re-applies the rename whenever the reader re-renders a color popup —
 * mirrors the confirmed zotero-annotation-color-customizer technique. */
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

function handleReaderEvent(event: { doc: Document }): void {
  applyColorLabels(event.doc);
  ensureObserver(event.doc);
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
 * listeners themselves are torn down by Zotero via the pluginID scoping. */
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
