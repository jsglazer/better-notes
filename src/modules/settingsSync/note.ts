import { config } from "../../../package.json";
import type { SettingsPayload } from "./serialize";

export {
  SETTINGS_TAG,
  SETTINGS_COLLECTION_NAME,
  findSettingsNote,
  isSettingsNote,
  readSettingsNote,
  writeSettingsNote,
};

/**
 * The settings note is a plain standalone note carried between machines by
 * Zotero's own DATA sync — the only Zotero-synced channel available to a
 * plugin. (Zotero syncs library data and, optionally, attachment files; it
 * never syncs prefs.js or anything else in the profile/data directory.) A note
 * is preferable to a stored attachment: data sync is on whenever sync is
 * configured, is not quota-limited, and needs no file-sync setup.
 */
const SETTINGS_TAG = "__enhanced-notes-settings";
const SETTINGS_COLLECTION_NAME = "Enhanced Notes";
const PAYLOAD_START = "<!--ENSETTINGS:v1-->";

/** True for the note that holds this library's synced settings. */
function isSettingsNote(item: Zotero.Item | null | undefined): boolean {
  return Boolean(item?.isNote?.() && item.hasTag(SETTINGS_TAG));
}

/**
 * Locate the settings note in a library. Returns the most recently modified
 * one if a sync conflict ever produced duplicates, so both machines converge
 * on the same note rather than ping-ponging between two.
 */
async function findSettingsNote(
  libraryID: number,
): Promise<Zotero.Item | null> {
  const search = new Zotero.Search();
  search.addCondition("libraryID", "is", String(libraryID));
  search.addCondition("itemType", "is", "note");
  search.addCondition("tag", "is", SETTINGS_TAG);
  const ids = await search.search();
  if (!ids.length) {
    return null;
  }
  const items = Zotero.Items.get(ids).filter((item) => !item.deleted);
  if (!items.length) {
    return null;
  }
  items.sort(
    (a, b) =>
      new Date(b.dateModified).getTime() - new Date(a.dateModified).getTime(),
  );
  return items[0];
}

/** Parse the payload out of a settings note, or null if it can't be read. */
function readSettingsNote(item: Zotero.Item): SettingsPayload | null {
  try {
    const html = item.getNote() || "";
    const start = html.indexOf(PAYLOAD_START);
    if (start === -1) {
      return null;
    }
    // The payload is base64 so that neither HTML entity escaping nor the note
    // editor's re-formatting (should the user ever open the note) can corrupt
    // it — any stray whitespace or markup is stripped before decoding.
    const encoded = html
      .slice(start + PAYLOAD_START.length)
      .replace(/<[^>]*>/g, "")
      .replace(/[^A-Za-z0-9+/=]/g, "");
    if (!encoded) {
      return null;
    }
    const payload = JSON.parse(base64ToUTF8(encoded)) as SettingsPayload;
    return payload && payload.prefs ? payload : null;
  } catch (e) {
    Zotero.debug(
      `[enhanced-notes] settingsSync: unreadable settings note: ${e}`,
    );
    return null;
  }
}

/**
 * Write the payload to the library's settings note, creating the note (and the
 * "Enhanced Notes" collection that holds it) on first use.
 */
async function writeSettingsNote(
  libraryID: number,
  payload: SettingsPayload,
): Promise<Zotero.Item> {
  let item = await findSettingsNote(libraryID);
  const isNew = !item;
  if (!item) {
    item = new Zotero.Item("note");
    item.libraryID = libraryID;
    item.addTag(SETTINGS_TAG);
  }
  item.setNote(renderNote(payload));
  // skipBN keeps our own write out of the plugin's note pipeline (markdown
  // sync, link relations) — see onNotify in hooks.ts.
  await item.saveTx({ notifierData: { skipBN: true } });
  if (isNew) {
    const collection = await ensureCollection(libraryID);
    if (collection) {
      item.addToCollection(collection.id);
      await item.saveTx({ notifierData: { skipBN: true } });
    }
  }
  return item;
}

/** The human-readable half of the note, plus the base64 payload. */
function renderNote(payload: SettingsPayload): string {
  const count = Object.keys(payload.prefs || {}).length;
  const encoded = utf8ToBase64(JSON.stringify(payload));
  return [
    `<div><h1>${config.addonName} — synced settings</h1>`,
    `<p><b>Do not edit or delete this note.</b> It carries this library's ${config.addonName} preferences between your computers via Zotero sync. Deleting it only removes the shared copy; your local settings are unaffected.</p>`,
    `<p>Last written: ${escapeHTML(payload.exportedAt)}<br/>`,
    `From: ${escapeHTML(payload.machineName)}<br/>`,
    `Settings stored: ${count}<br/>`,
    `Plugin version: ${escapeHTML(payload.addonVersion)}</p>`,
    `<p>${PAYLOAD_START}${encoded}</p></div>`,
  ].join("");
}

/**
 * UTF-8-safe base64 helpers. btoa/atob are byte-oriented, so the JSON is
 * encoded to UTF-8 bytes first — template bodies and colour labels can contain
 * non-Latin-1 characters.
 */
function utf8ToBase64(str: string): string {
  const bytes = new TextEncoder().encode(str);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return ztoolkit.getGlobal("btoa")(binary);
}

function base64ToUTF8(encoded: string): string {
  const binary = ztoolkit.getGlobal("atob")(encoded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new TextDecoder().decode(bytes);
}

function escapeHTML(str: string): string {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** Find or create the collection the settings note is filed under. */
async function ensureCollection(
  libraryID: number,
): Promise<Zotero.Collection | null> {
  try {
    const existing = Zotero.Collections.getByLibrary(libraryID).find(
      (c) => c.name === SETTINGS_COLLECTION_NAME,
    );
    if (existing) {
      return existing;
    }
    const collection = new Zotero.Collection();
    (collection as any).libraryID = libraryID;
    collection.name = SETTINGS_COLLECTION_NAME;
    await collection.saveTx();
    return collection;
  } catch (e) {
    // A missing collection is cosmetic — the note still syncs. Don't fail the
    // write over it.
    Zotero.debug(
      `[enhanced-notes] settingsSync: cannot create collection: ${e}`,
    );
    return null;
  }
}
