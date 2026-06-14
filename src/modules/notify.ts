export { registerNotify, unregisterNotify };

// The id of the global item observer. Kept at module scope so it can be torn
// down explicitly on plugin shutdown — `Zotero.Notifier.registerObserver` takes
// no pluginID, so Zotero won't auto-unregister it, and the window `unload`
// listener below never fires on an uninstall (the window stays open). A leaked
// observer keeps a live closure into the plugin's scope, which is what forces a
// Zotero restart before the plugin can be removed.
let notifyID: string | undefined;

function registerNotify(types: _ZoteroTypes.Notifier.Type[], win: Window) {
  const callback = {
    notify: async (...data: Parameters<_ZoteroTypes.Notifier.Notify>) => {
      if (!addon?.data.alive) {
        unregisterNotify();
        return;
      }
      addon.hooks.onNotify(...data);
    },
  };

  // Register the callback in Zotero as an item observer
  notifyID = Zotero.Notifier.registerObserver(callback, types);

  // Unregister callback when the window closes (important to avoid a memory leak)
  win.addEventListener(
    "unload",
    () => {
      unregisterNotify();
    },
    false,
  );
}

function unregisterNotify() {
  if (notifyID) {
    Zotero.Notifier.unregisterObserver(notifyID);
    notifyID = undefined;
  }
}
