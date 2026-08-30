import { config } from "../../../package.json";
import { getPref, setPref } from "../../utils/prefs";
import { showHint } from "../../utils/hint";
import {
  applySettings,
  collectSettings,
  diffSettings,
  getMachineId,
  SETTINGS_PAYLOAD_VERSION,
  type SettingsPayload,
} from "./serialize";
import {
  findSettingsNote,
  isSettingsNote,
  readSettingsNote,
  writeSettingsNote,
} from "./note";

export {
  registerSettingsSync,
  unregisterSettingsSync,
  onSettingsNoteModified,
  pushSettings,
  pullSettings,
  exportSettingsToFile,
  importSettingsFromFile,
  isSettingsNote,
};

/**
 * Settings sync — Update018.
 *
 * Plugin prefs are carried between computers inside a single Zotero note, which
 * Zotero's own data sync replicates. See note.ts for why a note (rather than a
 * cloud folder or an attachment file) is the right channel.
 *
 * Flow:
 *   push — a debounced write after any syncable pref changes locally.
 *   pull — on startup, and whenever the settings note arrives/changes via sync,
 *          compare against local prefs and prompt before applying.
 *
 * Loop avoidance rests on two guards: `applying` suppresses the push that our
 * own applySettings() would otherwise trigger, and the payload's `machineId`
 * makes a machine ignore the echo of its own note write coming back through
 * sync.
 */

const PUSH_DEBOUNCE_MS = 4000;
/** Let Zotero's first sync pass land before reading the note at startup. */
const STARTUP_PULL_DELAY_MS = 15000;

/**
 * A native nsIPrefBranch observer rather than Zotero.Prefs.registerObserver:
 * the latter dispatches on an EXACT pref name, while we need to watch the whole
 * plugin branch (template and colour-label keys are dynamic).
 */
let prefObserver: nsIObserver | null = null;
let pushTimer: number | null = null;
let startupTimer: number | null = null;
let applying = false;

function isEnabled(): boolean {
  return Boolean(getPref("settingsSync.enabled"));
}

function libraryID(): number {
  return Zotero.Libraries.userLibraryID;
}

function prefBranch() {
  return Services.prefs.getBranch(`${config.prefsPrefix}.`);
}

function registerSettingsSync() {
  if (prefObserver) {
    return;
  }
  // Observe the whole plugin branch so any syncable pref — including templates
  // and per-color labels, which have dynamic key names — triggers a push.
  // `data` arrives as the pref name relative to the branch.
  prefObserver = {
    observe: (_subject: nsISupports, _topic: string, data: string) =>
      onPrefChanged(data),
  } as unknown as nsIObserver;
  prefBranch().addObserver("", prefObserver, false);
  if (isEnabled()) {
    startupTimer = Zotero.getMainWindow().setTimeout(() => {
      startupTimer = null;
      pullSettings({ quiet: true }).catch((e) =>
        Zotero.debug(
          `[enhanced-notes] settingsSync: startup pull failed: ${e}`,
        ),
      );
    }, STARTUP_PULL_DELAY_MS);
  }
}

function unregisterSettingsSync() {
  if (prefObserver) {
    try {
      prefBranch().removeObserver("", prefObserver);
    } catch (e) {
      Zotero.debug(
        `[enhanced-notes] settingsSync: removeObserver failed: ${e}`,
      );
    }
    prefObserver = null;
  }
  const win = Zotero.getMainWindow();
  if (pushTimer !== null) {
    win?.clearTimeout(pushTimer);
    pushTimer = null;
  }
  if (startupTimer !== null) {
    win?.clearTimeout(startupTimer);
    startupTimer = null;
  }
}

function onPrefChanged(relKey: string) {
  if (applying || !isEnabled()) {
    return;
  }
  // The feature's own bookkeeping prefs must not trigger a push, or writing the
  // watermark after a pull would immediately schedule a pointless write back.
  if (String(relKey).startsWith("settingsSync.")) {
    return;
  }
  schedulePush();
}

function schedulePush() {
  const win = Zotero.getMainWindow();
  if (!win) {
    return;
  }
  if (pushTimer !== null) {
    win.clearTimeout(pushTimer);
  }
  pushTimer = win.setTimeout(() => {
    pushTimer = null;
    pushSettings().catch((e) =>
      Zotero.debug(`[enhanced-notes] settingsSync: push failed: ${e}`),
    );
  }, PUSH_DEBOUNCE_MS);
}

/** Write this machine's settings to the shared note. */
async function pushSettings(): Promise<void> {
  if (!isEnabled()) {
    return;
  }
  const payload = collectSettings();
  await writeSettingsNote(libraryID(), payload);
  setWatermark(payload.exportedAt);
}

/**
 * Read the shared note and, if it carries newer settings from another machine,
 * ask before applying them.
 *
 * `quiet` suppresses the "nothing to do" feedback, for automatic runs.
 */
async function pullSettings(
  options: { quiet?: boolean } = {},
): Promise<boolean> {
  const { quiet = false } = options;
  if (!isEnabled()) {
    return false;
  }
  const item = await findSettingsNote(libraryID());
  if (!item) {
    if (!quiet) {
      showHint("No synced settings found in this library yet.");
    }
    return false;
  }
  const payload = readSettingsNote(item);
  if (!payload) {
    if (!quiet) {
      showHint("The synced settings note could not be read.");
    }
    return false;
  }
  if (payload.version > SETTINGS_PAYLOAD_VERSION) {
    showHint(
      `These synced settings were written by a newer ${config.addonName}. Update the plugin on this computer first.`,
    );
    return false;
  }
  // Our own write coming back through sync.
  if (payload.machineId === getMachineId()) {
    setWatermark(payload.exportedAt);
    return false;
  }
  if (payload.exportedAt <= getWatermark()) {
    return false;
  }
  const changed = diffSettings(payload);
  if (!changed.length) {
    setWatermark(payload.exportedAt);
    if (!quiet) {
      showHint("Settings are already up to date.");
    }
    return false;
  }
  if (!confirmApply(payload, changed)) {
    // Watermark the ignored payload so the same prompt doesn't reappear on
    // every sync; a later change on the other machine has a newer timestamp.
    setWatermark(payload.exportedAt);
    return false;
  }
  applyPayload(payload);
  setWatermark(payload.exportedAt);
  showHint(`Applied ${changed.length} setting(s) from ${payload.machineName}.`);
  return true;
}

/** Apply a payload with the push observer suppressed. */
function applyPayload(payload: SettingsPayload): string[] {
  applying = true;
  try {
    return applySettings(payload);
  } finally {
    applying = false;
  }
}

function confirmApply(payload: SettingsPayload, changed: string[]): boolean {
  const ps = Services.prompt;
  const shown = changed.slice(0, 12).join("\n  ");
  const more =
    changed.length > 12 ? `\n  …and ${changed.length - 12} more` : "";
  const when = formatTime(payload.exportedAt);
  const flags =
    ps.BUTTON_POS_0! * ps.BUTTON_TITLE_IS_STRING! +
    ps.BUTTON_POS_1! * ps.BUTTON_TITLE_IS_STRING!;
  const index = ps.confirmEx(
    null as unknown as mozIDOMWindowProxy,
    `${config.addonName} settings`,
    `Settings were changed on ${payload.machineName} (${when}).\n\n` +
      `${changed.length} setting(s) differ from this computer:\n  ${shown}${more}\n\n` +
      `Apply them here?`,
    flags,
    "Apply",
    "Ignore",
    null as unknown as string,
    null as unknown as string,
    { value: false },
  );
  return index === 0;
}

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch (e) {
    return iso;
  }
}

/**
 * Timestamp of the last payload this machine wrote or resolved. Prefs written
 * by the plugin's own sync are excluded from the payload, so this stays local.
 */
function getWatermark(): string {
  return String(getPref("settingsSync.lastSeen") || "");
}

function setWatermark(iso: string) {
  setPref("settingsSync.lastSeen", iso);
}

/** Called from onNotify when a note is modified — pulls if it's ours. */
async function onSettingsNoteModified(item: Zotero.Item): Promise<void> {
  if (!isEnabled() || !isSettingsNote(item)) {
    return;
  }
  await pullSettings({ quiet: true });
}

// -------------------------------------------------------------------------
// Manual export / import — the fallback channel, and the way to move settings
// between libraries that don't share a Zotero account.
// -------------------------------------------------------------------------

async function exportSettingsToFile(): Promise<void> {
  const payload = collectSettings();
  const path = await new ztoolkit.FilePicker(
    `Export ${config.addonName} settings`,
    "save",
    [["JSON File(*.json)", "*.json"]],
    `${config.addonRef}-settings.json`,
  ).open();
  if (!path) {
    return;
  }
  await Zotero.File.putContentsAsync(path, JSON.stringify(payload, null, 2));
  showHint(
    `Exported ${Object.keys(payload.prefs).length} setting(s) to ${PathUtils.split(path).pop()}.`,
  );
}

async function importSettingsFromFile(): Promise<void> {
  const path = await new ztoolkit.FilePicker(
    `Import ${config.addonName} settings`,
    "open",
    [["JSON File(*.json)", "*.json"]],
  ).open();
  if (!path) {
    return;
  }
  let payload: SettingsPayload;
  try {
    payload = JSON.parse(
      (await Zotero.File.getContentsAsync(path)) as string,
    ) as SettingsPayload;
  } catch (e) {
    showHint("That file is not valid settings JSON.");
    return;
  }
  if (!payload?.prefs || typeof payload.prefs !== "object") {
    showHint("That file does not contain any settings.");
    return;
  }
  if (payload.version > SETTINGS_PAYLOAD_VERSION) {
    showHint(
      `That file was written by a newer ${config.addonName}. Update the plugin on this computer first.`,
    );
    return;
  }
  const changed = diffSettings(payload);
  if (!changed.length) {
    showHint("Settings are already up to date.");
    return;
  }
  if (
    !confirmApply({ ...payload, machineName: "the imported file" }, changed)
  ) {
    return;
  }
  applyPayload(payload);
  showHint(`Applied ${changed.length} setting(s).`);
}
