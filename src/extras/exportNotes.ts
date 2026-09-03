import { getPref, setPref } from "../utils/prefs";

let io: {
  targetData: {
    left: number;
    title: string;
  };
  accepted: boolean;
  useBuiltInExport: boolean;
  deferred: _ZoteroTypes.Promise.DeferredPromise<void>;
  embedLink: boolean;
  standaloneLink: boolean;
  exportNote: boolean;
  exportMD: boolean;
  setAutoSync: boolean;
  autoMDFileName: boolean;
  withYAMLHeader: boolean;
  exportDocx: boolean;
  exportPDF: boolean;
  exportFreeMind: boolean;
  exportLatex: boolean;
  mergeLatex: boolean;
};

window.onload = async function () {
  if (document.readyState === "complete") {
    setTimeout(init, 0);
    return;
  }
  document.addEventListener("DOMContentLoaded", init, { once: true });
};

window.onunload = function () {
  io.deferred && io.deferred.resolve();
};

function init() {
  const dialog = document.querySelector("dialog")!;
  Zotero.UIProperties.registerRoot(dialog);

  io = window.arguments[0];

  window.addEventListener("dialogaccept", doAccept);
  window.addEventListener("dialogextra1", () => doUseBuiltInExport());

  document
    .querySelector("#format")!
    .addEventListener("command", onFormatChange);

  document
    .querySelector("#linkMode")!
    .addEventListener("command", updateMarkdownOptions);

  document
    .querySelector("#markdown-autoSync")!
    .addEventListener("command", updateMarkdownOptions);

  document
    .querySelector("#useDefaultExport")!
    .addEventListener("command", () => {
      doUseBuiltInExport();
    });

  (document.querySelector("#target") as XULElement).dataset.l10nArgs =
    JSON.stringify(io.targetData);

  restore();

  onFormatChange();
  updateMarkdownOptions();
}

function restore() {
  let format = getPref("export.format") as string;
  if (
    !["markdown", "msword", "pdf", "freemind", "note", "latex"].includes(format)
  ) {
    format = "markdown";
  }
  (document.querySelector("#format") as XULMenuListElement).value = format;

  let linkMode = getPref("export.linkMode") as string;
  if (!["keep", "embed", "standalone", "remove"].includes(linkMode)) {
    linkMode = "keep";
  }
  (document.querySelector("#linkMode") as XULRadioGroupElement).value =
    linkMode;

  const markdownPrefs = ["autoSync", "withYAMLHeader", "autoFilename"];
  for (const pref of markdownPrefs) {
    (
      document.querySelector(`#markdown-${pref}`) as XULCheckboxElement
    ).checked = getPref(`export.markdown-${pref}`) as boolean;
  }
}

function cache() {
  setPref(
    "export.format",
    (document.querySelector("#format") as XULMenuListElement).value,
  );
  setPref(
    "export.linkMode",
    (document.querySelector("#linkMode") as XULRadioGroupElement).value,
  );

  const markdownPrefs = ["autoSync", "withYAMLHeader", "autoFilename"];
  for (const pref of markdownPrefs) {
    const el = document.querySelector(
      `#markdown-${pref}`,
    ) as XULCheckboxElement;
    // A disabled checkbox is showing a state this dialog forced (or blocked),
    // not the user's choice — writing it back would silently overwrite their
    // stored preference. Leave the pref alone and let restore() bring the real
    // choice back next time.
    if (el.disabled) {
      continue;
    }
    setPref(`export.markdown-${pref}`, el.checked);
  }
}

function onFormatChange() {
  const format = (document.querySelector("#format") as XULMenuListElement)
    .value;
  const isMD = format === "markdown";
  const isLaTeX = format === "latex";

  const noteItems = Zotero.getMainWindow().ZoteroPane.getSelectedItems();

  (document.querySelector("#markdown-options") as XULBoxElement).hidden = !isMD;
  (document.querySelector("#latex-options") as XULBoxElement).hidden =
    !isLaTeX || noteItems.length == 1;

  window.sizeToContent();
}

function updateMarkdownOptions() {
  const linkModeRadio = document.querySelector(
    "#linkMode",
  ) as XULRadioGroupElement;
  const autoSyncRadio = document.querySelector(
    "#markdown-autoSync",
  ) as XULCheckboxElement;

  // Auto-sync conflicts with ONE link mode: "embed". exportNotes() skips
  // embedLinkedNotes() whenever setAutoSync is set, so the two can't both apply.
  // It has no quarrel with "keep" — but this used to require "standalone", so on
  // a default install (linkMode has no pref default and restore() falls back to
  // "keep") the Sync checkbox was permanently unchecked and greyed out. Exporting
  // Markdown therefore never registered a sync entry, the note silently never
  // synced, and the Sync Manager had nothing to show. Worse, restore() would
  // check the box from the saved pref and this function would immediately clear
  // it, so cache() then persisted `false` — erasing the setting for good.
  const syncable = linkModeRadio.value !== "embed";
  if (!syncable) {
    autoSyncRadio.checked = false;
    autoSyncRadio.disabled = true;
    autoSyncRadio.tooltipText =
      "Not available with embedded links — embedding rewrites the note, so there is nothing stable to sync.";
  } else {
    if (autoSyncRadio.disabled) {
      // Re-enabling: bring back the user's stored choice, which cache() kept.
      autoSyncRadio.checked = getPref("export.markdown-autoSync") as boolean;
    }
    autoSyncRadio.disabled = false;
    autoSyncRadio.tooltipText = "";
  }

  const autoFilename = document.querySelector(
    "#markdown-autoFilename",
  ) as XULCheckboxElement;
  const withYAMLHeader = document.querySelector(
    "#markdown-withYAMLHeader",
  ) as XULCheckboxElement;

  // Syncing requires both, so show them forced on — cache() won't write these
  // forced values over the user's own preference.
  const forced: Array<[XULCheckboxElement, string]> = [
    [autoFilename, "autoFilename"],
    [withYAMLHeader, "withYAMLHeader"],
  ];
  for (const [el, prefName] of forced) {
    if (autoSyncRadio.checked) {
      el.checked = true;
      el.disabled = true;
    } else {
      if (el.disabled) {
        el.checked = getPref(`export.markdown-${prefName}`) as boolean;
      }
      el.disabled = false;
    }
  }
}

function doAccept() {
  cache();

  // Format
  const format = (document.querySelector("#format") as XULMenuListElement)
    .value;
  io.exportMD = format === "markdown";
  io.exportDocx = format === "msword";
  io.exportPDF = format === "pdf";
  io.exportFreeMind = format === "freemind";
  io.exportNote = format === "note";
  io.exportLatex = format === "latex";

  // Markdown options
  io.autoMDFileName = (
    document.querySelector("#markdown-autoFilename") as XULCheckboxElement
  ).checked;
  io.withYAMLHeader = (
    document.querySelector("#markdown-withYAMLHeader") as XULCheckboxElement
  ).checked;
  // A disabled Sync box can never mean "sync" — guard so a forced state can't
  // switch the export mode behind the user's back.
  const autoSyncEl = document.querySelector(
    "#markdown-autoSync",
  ) as XULCheckboxElement;
  io.setAutoSync = autoSyncEl.checked && !autoSyncEl.disabled;

  // LaTeX options
  io.mergeLatex = (
    document.querySelector("#latex-merge") as XULCheckboxElement
  ).checked;

  // Link mode
  const linkMode = (document.querySelector("#linkMode") as XULRadioGroupElement)
    .value;
  io.embedLink = linkMode === "embed";
  io.standaloneLink = linkMode === "standalone";

  io.accepted = true;
}

function doUseBuiltInExport() {
  io.useBuiltInExport = true;
  window.close();
}
