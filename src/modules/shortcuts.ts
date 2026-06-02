const _listeners = new Map<Window, (e: KeyboardEvent) => void>();

export function registerKeyboardShortcuts(win: Window) {
  const listener = (e: KeyboardEvent) => {
    if (!e.ctrlKey || !e.altKey) return;
    switch (e.key.toLowerCase()) {
      case "s":
        e.preventDefault();
        addon.hooks.onShowSyncManager();
        break;
      case "t":
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
