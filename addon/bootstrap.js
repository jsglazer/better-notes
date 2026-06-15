/**
 * Most of this code is from Zotero team's official Make It Red example[1]
 * or the Zotero 7 documentation[2].
 * [1] https://github.com/zotero/make-it-red
 * [2] https://www.zotero.org/support/dev/zotero_7_for_developers
 */

var chromeHandle;

function install(data, reason) {}

async function startup({ id, version, resourceURI, rootURI }, reason) {
  await Zotero.initializationPromise;

  var aomStartup = Components.classes[
    "@mozilla.org/addons/addon-manager-startup;1"
  ].getService(Components.interfaces.amIAddonManagerStartup);
  var manifestURI = Services.io.newURI(rootURI + "manifest.json");
  chromeHandle = aomStartup.registerChrome(manifestURI, [
    ["content", "__addonRef__", rootURI + "chrome/content/"],
  ]);

  /**
   * Global variables for plugin code.
   * The `_globalThis` is the global root variable of the plugin sandbox environment
   * and all child variables assigned to it is globally accessible.
   * See `src/index.ts` for details.
   */
  const ctx = {
    rootURI,
    // Define main window's document to create a fake browser environment
    document: Zotero.getMainWindow().document,
  };
  ctx._globalThis = ctx;

  Services.scriptloader.loadSubScript(
    `${rootURI}/chrome/content/scripts/__addonRef__.js`,
    ctx,
  );
  await Zotero.__addonInstance__.hooks.onStartup();
}

function onMainWindowLoad({ window: win }) {
  Zotero.__addonInstance__.hooks.onMainWindowLoad(win);
}

function onMainWindowUnload({ window: win }) {
  Zotero.__addonInstance__.hooks.onMainWindowUnload(win);
}

function shutdown({ id, version, resourceURI, rootURI }, reason) {
  // Diagnostic logging (filter the Debug Output for "[BN-SHUTDOWN]"): the goal is
  // to confirm whether a direct "Remove" of the *enabled* plugin even calls this
  // (and runs to completion) vs. only the disable path doing so.
  const dbg = (m) => {
    try {
      Zotero.debug("[BN-SHUTDOWN] " + m);
    } catch (e) {
      /* no-op */
    }
  };
  const reasonName =
    { 1: "APP_STARTUP", 2: "APP_SHUTDOWN", 3: "ADDON_ENABLE", 4: "ADDON_DISABLE", 5: "ADDON_INSTALL", 6: "ADDON_UNINSTALL", 7: "ADDON_UPGRADE", 8: "ADDON_DOWNGRADE" }[reason] ||
    String(reason);
  dbg("shutdown() called, reason=" + reasonName);

  if (reason === APP_SHUTDOWN) {
    dbg("APP_SHUTDOWN — skipping teardown");
    return;
  }

  // Run the plugin's own cleanup, but never let a failure in it abort the
  // teardown below. If onShutdown() threw, chromeHandle.destruct() would be
  // skipped, the chrome registration would leak, and Zotero would refuse to
  // remove the (still-active) plugin without a deactivate + restart.
  try {
    dbg("calling onShutdown()");
    Zotero.__addonInstance__?.hooks?.onShutdown?.();
    dbg("onShutdown() returned normally");
  } catch (e) {
    dbg("onShutdown() THREW: " + e);
  }

  if (chromeHandle) {
    try {
      chromeHandle.destruct();
      dbg("chromeHandle.destruct() ok");
    } catch (e) {
      dbg("chromeHandle.destruct() FAILED: " + e);
    }
    chromeHandle = null;
  } else {
    dbg("no chromeHandle to destruct");
  }
  dbg("shutdown() complete");
}

function uninstall(data, reason) {}
