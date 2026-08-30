const _listeners = new Map<Window, (e: KeyboardEvent) => void>();
const _keysets = new Map<Window, Element>();

// The visible right-aligned shortcut column in the Tools menu comes ONLY from a
// real <key> element referenced by the menuitem's `key` attribute — on macOS the
// Tools menu is the native Cocoa menubar, which ignores a JS-set `acceltext` and
// renders a baked-in label hint left-aligned. nsMenuItemX reads the referenced
// <key>'s `key`+`modifiers` to build both the displayed accelerator and the
// native key equivalent. These keys are intentionally COMMAND-LESS: the keydown
// listener below stays the actual handler (it matches on `e.code`, so it is
// immune to macOS Option remapping of the produced character), and a command-less
// key neither fires nor swallows the keystroke. See menu.ts (key= wiring).
const SHORTCUT_KEYS: { id: string; key: string; modifiers: string }[] = [
  { id: "zotero-bn-key-linkCreator", key: "L", modifiers: "control,alt" },
  { id: "zotero-bn-key-syncManager", key: "M", modifiers: "control,alt" },
  { id: "zotero-bn-key-templateEditor", key: "T", modifiers: "control,alt" },
];

export function registerKeyboardShortcuts(win: Window) {
  const listener = (e: KeyboardEvent) => {
    if (!e.ctrlKey || !e.altKey) return;
    switch (e.code) {
      case "KeyL":
        e.preventDefault();
        addon.hooks.onShowLinkCreator();
        break;
      case "KeyS":
        e.preventDefault();
        addon.hooks.onSyncing([], {
          quiet: false,
          skipActive: false,
          reason: "keyboard-shortcut",
        });
        break;
      case "KeyM":
        e.preventDefault();
        addon.hooks.onShowSyncManager();
        break;
      case "KeyT":
        e.preventDefault();
        addon.hooks.onShowTemplateEditor();
        break;
      case "KeyP":
        e.preventDefault();
        Zotero.openInViewer(
          "chrome://mozapps/content/extensions/aboutaddons.html",
          {
            onLoad: (Zotero.getMainWindow() as any).ZoteroStandalone
              ?.updateAddonsPane,
          },
        );
        break;
    }
  };
  win.document.addEventListener("keydown", listener);
  _listeners.set(win, listener);

  // Inject the display-only <key> elements the Tools menu items point at.
  try {
    const doc = win.document;
    if (!_keysets.has(win) && !doc.getElementById("zotero-bn-keyset")) {
      const keyset = doc.createXULElement("keyset");
      keyset.id = "zotero-bn-keyset";
      for (const { id, key, modifiers } of SHORTCUT_KEYS) {
        const keyElem = doc.createXULElement("key");
        keyElem.id = id;
        keyElem.setAttribute("key", key);
        keyElem.setAttribute("modifiers", modifiers);
        keyset.appendChild(keyElem);
      }
      doc.documentElement.appendChild(keyset);
      _keysets.set(win, keyset);
    }
  } catch (e) {
    // Non-fatal: without the keyset the menu hint just won't render.
  }
}

export function unregisterKeyboardShortcuts(win: Window) {
  const listener = _listeners.get(win);
  if (listener) {
    win.document.removeEventListener("keydown", listener);
    _listeners.delete(win);
  }
  const keyset = _keysets.get(win);
  if (keyset) {
    keyset.remove();
    _keysets.delete(win);
  }
}
