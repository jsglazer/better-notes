import { formatPath, jointPath } from "../utils/str";
import { getCiteKey } from "./template/model";

export { registerLinkEndpoint, unregisterLinkEndpoint };

const ENDPOINT_PATH = "/enhanced-notes/link";

interface LinkRequest {
  citekey?: string;
  path?: string;
  libraryID?: number;
}

interface LinkResult {
  noteKey: string;
  noteID: number;
  itemKey: string;
  created: boolean;
  path: string;
  filename: string;
}

/**
 * Adopt an existing Markdown file as a synced Zotero note, over the local HTTP
 * server — the "start syncing from Obsidian" direction.
 *
 * Zotero can already adopt a file from its own side (Add Note → Import from
 * Markdown File, and Sync Manager → Link…), but both need a human driving the
 * Zotero UI. This lets the vault initiate: an Obsidian Templater script that
 * already knows the cite key can hand the file to Zotero and get back the note
 * key to write into its front matter.
 *
 * POST application/json:
 *   { "citekey": "pindyck-Microeconomics-2018",
 *     "path": "/Users/josh/Vault/Sources/ch3-a.md" }
 *
 * Responds `{ noteKey, noteID, itemKey, created, path, filename }`.
 *
 * Semantics, per the U23 design discussion:
 * - **The file wins.** The note is created from the file's content, then the
 *   file is re-exported so it gains the front matter sync needs.
 * - **Keyed on the file, not the item.** One item may own many notes (a note
 *   per chapter is the motivating case), so an item that already has notes is
 *   never a reason to refuse. But a *file* that is already linked returns its
 *   existing note with `created: false`, so a Templater script can run on every
 *   save without spawning duplicates.
 * - **An unresolved cite key is an error, never a guess.** Zero or multiple
 *   matches both fail: silently attaching a chapter note to the wrong book is
 *   worse than making the caller fix the key.
 */
class LinkEndpoint {
  supportedMethods = ["POST"];
  supportedDataTypes = ["application/json"];

  // Both dispatch styles, for the same reason tagServer supports them:
  // depending on client version Zotero.Server either awaits a promise of
  // [code, type, body] or passes a callback the endpoint must invoke itself.
  init(
    optionsOrData: unknown,
    sendResponseCallback?: (
      code: number,
      contentTypeOrHeaders?: string | Record<string, string>,
      body?: string,
    ) => void,
  ): void | Promise<[number, string, string]> {
    const done = handle(optionsOrData);
    if (typeof sendResponseCallback === "function") {
      done.then(([code, type, body]) => sendResponseCallback(code, type, body));
      return;
    }
    return done;
  }
}

async function handle(
  optionsOrData: unknown,
): Promise<[number, string, string]> {
  const respond = (
    code: number,
    payload: Record<string, unknown>,
  ): [number, string, string] => [
    code,
    "application/json",
    JSON.stringify(payload),
  ];

  const raw = optionsOrData as { data?: unknown } | undefined;
  const data = (
    raw && typeof raw === "object" && "data" in raw ? raw.data : raw
  ) as LinkRequest | string | undefined;

  let request: LinkRequest;
  try {
    request =
      typeof data === "string"
        ? (JSON.parse(data) as LinkRequest)
        : ((data ?? {}) as LinkRequest);
  } catch (e) {
    return respond(400, { error: `Malformed JSON body: ${e}` });
  }

  const citekey = String(request.citekey ?? "").trim();
  if (!citekey) return respond(400, { error: "Missing citekey" });
  const rawPath = String(request.path ?? "").trim();
  if (!rawPath) return respond(400, { error: "Missing path" });

  const libraryID =
    typeof request.libraryID === "number" && request.libraryID > 0
      ? request.libraryID
      : Zotero.Libraries.userLibraryID;

  try {
    const result = await linkFileToItem(libraryID, citekey, rawPath);
    return respond(200, result as unknown as Record<string, unknown>);
  } catch (e) {
    const code = (e as { code?: number })?.code ?? 500;
    return respond(code, { error: (e as Error)?.message ?? String(e) });
  }
}

const fail = (code: number, message: string) =>
  Object.assign(new Error(message), { code });

/**
 * Resolve a cite key to exactly one regular item.
 *
 * Deliberately uses the same `getCiteKey` the rest of the plugin uses for the
 * forward direction (Better BibTeX → `extra` "Citation Key:" → the native
 * `citationKey` field), so a key that produces a given filename resolves back
 * to the item that produced it. A reimplementation here could disagree with
 * the exporter and match a different item.
 */
async function findItemByCiteKey(
  libraryID: number,
  citekey: string,
): Promise<Zotero.Item> {
  // getAll(libraryID, onlyTopLevel) — regular items are top level, so this
  // skips every note and attachment before the cite-key check.
  const items = await Zotero.Items.getAll(libraryID, true);
  const matches = (items as Zotero.Item[]).filter(
    (item) => item.isRegularItem() && getCiteKey(item) === citekey,
  );
  if (matches.length === 0) {
    throw fail(404, `No item with citekey "${citekey}" in library ${libraryID}`);
  }
  if (matches.length > 1) {
    throw fail(
      409,
      `Citekey "${citekey}" matches ${matches.length} items (${matches
        .map((i) => i.key)
        .join(", ")}); cannot choose one.`,
    );
  }
  return matches[0];
}

/** The note already syncing to `filepath`, if there is one. */
async function findNoteSyncedTo(dir: string, filename: string) {
  for (const id of await addon.api.sync.getSyncNoteIds()) {
    const status = addon.api.sync.getSyncStatus(id);
    if (status?.path === dir && status?.filename === filename) {
      const note = Zotero.Items.get(id);
      // A stale record whose note was deleted must not block a re-link.
      if (note?.isNote() && !note.deleted) {
        return note;
      }
    }
  }
  return undefined;
}

async function linkFileToItem(
  libraryID: number,
  citekey: string,
  rawPath: string,
): Promise<LinkResult> {
  const filepath = formatPath(rawPath);
  if (!(await IOUtils.exists(filepath))) {
    throw fail(404, `No file at ${filepath}`);
  }
  const split = PathUtils.split(filepath);
  const filename = split.pop();
  if (!filename) {
    throw fail(400, `Not a file path: ${rawPath}`);
  }
  const dir = formatPath(split.join("/"));

  // Already adopted → hand back the same note rather than making a second one.
  const existing = await findNoteSyncedTo(dir, filename);
  if (existing) {
    return {
      noteKey: existing.key,
      noteID: existing.id,
      itemKey: existing.parentItem?.key ?? "",
      created: false,
      path: dir,
      filename,
    };
  }

  const item = await findItemByCiteKey(libraryID, citekey);

  const note = new Zotero.Item("note");
  note.libraryID = item.libraryID;
  note.parentItemID = item.id;
  await note.saveTx();

  try {
    // Register the pairing before importing so the export step below reuses
    // this exact filename instead of deriving a fresh (cite-key based) one.
    addon.api.sync.updateSyncStatus(note.id, {
      path: dir,
      filename,
      md5: "",
      noteMd5: "",
      lastsync: 0,
      itemID: note.id,
    });
    // File wins: pull its content in, then re-export so the file gains the
    // front matter sync depends on. Mirrors Sync Manager's "File wins" branch.
    await addon.api.$import.fromMD(jointPath(dir, filename), {
      noteId: note.id,
      ignoreVersion: true,
    });
    await addon.api.$export.syncMDBatch(dir, [note.id]);
  } catch (e) {
    // Leave nothing half-linked: drop the record and the empty note we made.
    addon.api.sync.removeSyncNote(note.id);
    try {
      await note.eraseTx();
    } catch (eraseError) {
      ztoolkit.log("linkFileToItem cleanup failed", eraseError);
    }
    throw fail(500, `Could not link ${filename}: ${String(e)}`);
  }

  return {
    noteKey: note.key,
    noteID: note.id,
    itemKey: item.key,
    created: true,
    path: dir,
    filename,
  };
}

function registerLinkEndpoint(): void {
  Zotero.Server.Endpoints[ENDPOINT_PATH] = LinkEndpoint;
}

function unregisterLinkEndpoint(): void {
  delete Zotero.Server.Endpoints[ENDPOINT_PATH];
}
