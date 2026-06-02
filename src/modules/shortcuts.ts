const _listeners = new Map<Window, (e: KeyboardEvent) => void>();

export function registerKeyboardShortcuts(win: Window) {
  const listener = (e: KeyboardEvent) => {
    if (!e.ctrlKey || !e.altKey) return;
    switch (e.code) {
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
    }
  };
  win.document.addEventListener("keydown", listener);
  _listeners.set(win, listener);
}

export function unregisterKeyboardShortcuts(win: Window) {
  const listener = _listeners.get(win);
  if (listener) {
    win.document.removeEventListener("keydown", listener);
    _listeners.delete(win);
  }
}
