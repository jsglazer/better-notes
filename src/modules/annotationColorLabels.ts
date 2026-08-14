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
 * support *appending* menu content, not rewriting the built-in items.
 *
 * Selectors below are verified against Zotero 7's actual bundled reader
 * (`resource/reader/reader.js`, `src/common/components/view-popup/
 * selection-popup.js` and `src/common/components/context-menu.js`), not
 * guessed — but they're still unofficial DOM-patching, so every step here
 * degrades silently on a mismatch instead of breaking the reader. A future
 * Zotero reader update could stop matching without ill effect beyond the
 * rename no longer applying.
 */

// Tried together (union of matches, not first-match), since different
// popups use different markup for the same 8 annotation colors:
// - creating a new highlight: `.selection-popup .colors .color-button`
//   (an icon-only <button title="Yellow">, no visible text)
// - the color picker for an *existing* annotation ("..." -> Add to Note,
//   and the toolbar's color dropdown): a generic `.context-menu` built from
//   reusable `<button class="row basic">` rows, each holding an icon <div>
//   plus a bare trailing text node with the visible label — no title attr.
const COLOR_BUTTON_SELECTORS = [
  ".selection-popup .colors .color-button",
  ".context-menu button.row",
  ".color-button",
];

// The 8 hex values Better Notes already exposes as `annotationColorLabel.<hex>`
// prefs (addon/prefs.js) — Zotero's own default annotation color set
// (`ANNOTATION_COLORS` in the reader bundle). Used only as a last-resort
// fallback to guess a button's color from its (English) title/text when the
// color swatch's fill can't be read from the markup.
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
// overwritten its title/text) doesn't lose the ability to re-detect it.
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

/** Zotero's context-menu rows (`BasicRow` in `context-menu.js`) put the
 * visible label as a bare trailing text node alongside an icon `<div>` —
 * no wrapping element, no `title` attribute. Only touches it when exactly
 * one non-empty text-node child exists, so an ambiguous/unexpected shape
 * degrades silently instead of overwriting the wrong text. */
function replaceButtonLabelText(button: HTMLElement, label: string): boolean {
  const textNodes = Array.from(button.childNodes).filter(
    (node) =>
      node && node.nodeType === Node.TEXT_NODE && !!node.nodeValue?.trim(),
  ) as Text[];
  if (textNodes.length === 1) {
    textNodes[0].nodeValue = label;
    return true;
  }
  return false;
}

/** Last-resort fallback for markup this module doesn't otherwise recognize:
 * a leaf element whose visible text is the color's default English name. */
function replaceLeafColorNameText(
  button: HTMLElement,
  hex: string,
  label: string,
): boolean {
  const expected = DEFAULT_COLOR_NAMES[hex];
  if (!expected) {
    return false;
  }
  const candidates = [button, ...Array.from(button.querySelectorAll("*"))];
  for (const el of candidates) {
    if (
      el instanceof HTMLElement &&
      el.childElementCount === 0 &&
      el.textContent?.trim().toLowerCase() === expected
    ) {
      el.textContent = label;
      return true;
    }
  }
  return false;
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
  if (!replaceButtonLabelText(button, label)) {
    replaceLeafColorNameText(button, hex, label);
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

/** Re-applies the rename whenever the reader re-renders a color popup —
 * these popups (selection popup, context menus) mount well after the
 * triggering reader event fires, so a one-shot pass in the event handler
 * would miss them; the observer catches the actual DOM insertion. */
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
