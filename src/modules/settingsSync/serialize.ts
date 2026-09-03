import { config, version } from "../../../package.json";

export {
  SETTINGS_PAYLOAD_VERSION,
  collectSettings,
  applySettings,
  diffSettings,
  isSyncablePref,
  getMachineId,
};

export type SettingsPayload = {
  version: number;
  exportedAt: string;
  machineId: string;
  machineName: string;
  addonVersion: string;
  prefs: Record<string, string | number | boolean>;
};

const SETTINGS_PAYLOAD_VERSION = 1;

/**
 * Pref keys (relative to `config.prefsPrefix`) that must NEVER travel between
 * machines. Everything else under the plugin's branch is synced, per Update018:
 * "everything associated with the plugin but nothing not associated with it".
 *
 * A trailing "." marks a whole sub-branch; a trailing "-" marks a key prefix.
 *
 *  - `syncNoteIds`            per-note sync state keyed by LOCAL item ids and
 *                             absolute file paths — meaningless on another box.
 *  - `syncDetail-`            the values `syncNoteIds` indexes (one pref per
 *                             note, holding that note's absolute path, filename
 *                             and hashes). Excluding the key list but not the
 *                             values still shipped every local path to the other
 *                             machine, where they landed as unreferenced junk.
 *  - `windows.`               window geometry / last-used tab indexes.
 *  - `linkCreator.recentNotes` machine-local MRU list of note ids.
 *  - `latestTourVersion`      per-install onboarding state; syncing it would
 *                             suppress the guide on a fresh machine.
 *  - `settingsSync.`          this feature's own bookkeeping. Syncing it would
 *                             overwrite the receiving machine's identity and
 *                             its "last applied" watermark, which is how we
 *                             avoid re-prompting in a loop.
 */
const EXCLUDED_KEYS = [
  "syncNoteIds",
  "syncDetail-",
  "windows.",
  "linkCreator.recentNotes",
  "latestTourVersion",
  "settingsSync.",
];

function isSyncablePref(relKey: string): boolean {
  // A trailing "." (sub-branch) or "-" (key prefix, e.g. `syncDetail-<id>`)
  // matches by prefix; anything else is an exact key.
  return !EXCLUDED_KEYS.some((ex) =>
    ex.endsWith(".") || ex.endsWith("-")
      ? relKey.startsWith(ex)
      : relKey === ex,
  );
}

function branch() {
  return Services.prefs.getBranch(`${config.prefsPrefix}.`);
}

/**
 * Read every syncable pref under the plugin's branch.
 *
 * Enumerating the branch (rather than listing keys by hand) means note
 * templates — stored as `template.<name>` by LargePrefHelper — and the
 * per-color `annotationColorLabel.<hex>` entries are picked up automatically,
 * including any added by future updates.
 */
function collectSettings(): SettingsPayload {
  const br = branch();
  const prefs: Record<string, string | number | boolean> = {};
  for (const relKey of br.getChildList("")) {
    if (!isSyncablePref(relKey)) {
      continue;
    }
    try {
      switch (br.getPrefType(relKey)) {
        case Services.prefs.PREF_STRING:
          prefs[relKey] = br.getStringPref(relKey);
          break;
        case Services.prefs.PREF_INT:
          prefs[relKey] = br.getIntPref(relKey);
          break;
        case Services.prefs.PREF_BOOL:
          prefs[relKey] = br.getBoolPref(relKey);
          break;
        default:
          break;
      }
    } catch (e) {
      Zotero.debug(
        `[enhanced-notes] settingsSync: cannot read pref ${relKey}: ${e}`,
      );
    }
  }
  return {
    version: SETTINGS_PAYLOAD_VERSION,
    exportedAt: new Date().toISOString(),
    machineId: getMachineId(),
    machineName: getMachineName(),
    addonVersion: version,
    prefs,
  };
}

/**
 * Write a payload's prefs onto this machine.
 *
 * Keys absent from the payload are left alone rather than cleared: a payload
 * written by an older plugin version must not wipe prefs it never knew about.
 * Returns the keys that actually changed.
 */
function applySettings(payload: SettingsPayload): string[] {
  const br = branch();
  const changed: string[] = [];
  for (const [relKey, value] of Object.entries(payload.prefs || {})) {
    if (!isSyncablePref(relKey)) {
      continue;
    }
    try {
      if (readPref(br, relKey) === value) {
        continue;
      }
      switch (typeof value) {
        case "string":
          br.setStringPref(relKey, value);
          break;
        case "number":
          br.setIntPref(relKey, value);
          break;
        case "boolean":
          br.setBoolPref(relKey, value);
          break;
        default:
          continue;
      }
      changed.push(relKey);
    } catch (e) {
      Zotero.debug(
        `[enhanced-notes] settingsSync: cannot write pref ${relKey}: ${e}`,
      );
    }
  }
  return changed;
}

function readPref(
  br: any,
  relKey: string,
): string | number | boolean | undefined {
  try {
    switch (br.getPrefType(relKey)) {
      case Services.prefs.PREF_STRING:
        return br.getStringPref(relKey);
      case Services.prefs.PREF_INT:
        return br.getIntPref(relKey);
      case Services.prefs.PREF_BOOL:
        return br.getBoolPref(relKey);
      default:
        return undefined;
    }
  } catch (e) {
    return undefined;
  }
}

/** Keys whose value in `payload` differs from what this machine has now. */
function diffSettings(payload: SettingsPayload): string[] {
  const br = branch();
  const changed: string[] = [];
  for (const [relKey, value] of Object.entries(payload.prefs || {})) {
    if (isSyncablePref(relKey) && readPref(br, relKey) !== value) {
      changed.push(relKey);
    }
  }
  return changed.sort();
}

/**
 * Stable per-install id, used to ignore the echo of our own writes coming back
 * through Zotero sync. Excluded from the payload by EXCLUDED_KEYS.
 */
function getMachineId(): string {
  const key = "settingsSync.machineId";
  const br = branch();
  let id = "";
  try {
    id =
      br.getPrefType(key) === Services.prefs.PREF_STRING
        ? br.getStringPref(key)
        : "";
  } catch (e) {
    id = "";
  }
  if (!id) {
    id = Zotero.Utilities.randomString(12);
    br.setStringPref(key, id);
  }
  return id;
}

/** Human-readable machine label for the "changed on another computer" prompt. */
function getMachineName(): string {
  try {
    const host = Services.sysinfo.getProperty("host");
    if (host) {
      return String(host);
    }
  } catch (e) {
    /* fall through */
  }
  return "another computer";
}
