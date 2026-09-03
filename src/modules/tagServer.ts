export { registerTagEndpoint, unregisterTagEndpoint };

const ENDPOINT_PATH = "/enhanced-notes/tag";

// Zotero tag types: 0 = manual (the blue tags a user typed), 1 = automatic
// (the orange ones an importer/translator added, which Zotero will happily
// wipe on a re-import). These are user-meaningful class/term tags, so they
// go in as manual.
const TAG_TYPE_MANUAL = 0;

interface TagRequest {
  itemKey?: string;
  libraryID?: number;
  tags?: unknown;
}

interface TagResult {
  itemKey: string;
  added: string[];
  existing: string[];
}

/**
 * Adds tags to a Zotero item over the local HTTP server (default port 23119) —
 * the write counterpart to `colorLabelsServer`'s read endpoint.
 *
 * This exists because Zotero's own local API (`server_localAPI.js`) is
 * GET-only by construction — all 21 of its endpoints declare
 * `supportedMethods = ["GET"]` — and Better BibTeX's JSON-RPC is likewise
 * read/export only. There is no stock write verb to call, so a consumer that
 * wants to tag an item (Obsidian's "New Source" template, tagging the parent
 * item it just cited) needs a plugin to provide one.
 *
 * POST application/json:
 *   { "itemKey": "ABCD2345", "libraryID": 1, "tags": ["2026-B", "POGO801"] }
 * `libraryID` is optional and defaults to the user library. If `itemKey`
 * resolves to a child item (attachment or note), the tags land on its parent —
 * tagging the source, never the PDF hanging off it.
 *
 * Responds `{ itemKey, added: [...], existing: [...] }`. Tags already on the
 * item are reported under `existing` and not re-added, so a caller may POST
 * the same tags repeatedly (the same source picked for several sessions)
 * without duplicating anything or bumping the item's version.
 */
// Both dispatch styles are supported for the same reason colorLabelsServer
// supports them: depending on client version Zotero.Server either awaits a
// promise of [code, type, body] or passes a sendResponseCallback the endpoint
// must call itself. Declaring only the promise form left a live 9.0.6 client
// waiting forever.
class TagEndpoint {
  supportedMethods = ["POST"];
  supportedDataTypes = ["application/json"];

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

  // The newer dispatch hands over an options object with the parsed body on
  // `.data`; the older one hands the parsed body directly.
  const raw = optionsOrData as { data?: unknown } | undefined;
  const data = (
    raw && typeof raw === "object" && "data" in raw ? raw.data : raw
  ) as TagRequest | string | undefined;

  let request: TagRequest;
  try {
    request =
      typeof data === "string"
        ? (JSON.parse(data) as TagRequest)
        : ((data ?? {}) as TagRequest);
  } catch (e) {
    return respond(400, { error: `Malformed JSON body: ${e}` });
  }

  const itemKey = String(request.itemKey ?? "").trim();
  if (!itemKey) return respond(400, { error: "Missing itemKey" });

  const tags = (Array.isArray(request.tags) ? request.tags : [])
    .map((t) => String(t ?? "").trim())
    .filter((t) => t.length > 0);
  if (tags.length === 0) return respond(400, { error: "Missing tags" });

  const libraryID =
    typeof request.libraryID === "number" && request.libraryID > 0
      ? request.libraryID
      : Zotero.Libraries.userLibraryID;

  try {
    const result = await addTags(libraryID, itemKey, tags);
    return respond(200, result as unknown as Record<string, unknown>);
  } catch (e) {
    const code = (e as { code?: number })?.code === 404 ? 404 : 500;
    return respond(code, { error: String(e) });
  }
}

async function addTags(
  libraryID: number,
  itemKey: string,
  tags: string[],
): Promise<TagResult> {
  let item = (await Zotero.Items.getByLibraryAndKeyAsync(
    libraryID,
    itemKey,
  )) as Zotero.Item | false;
  if (!item) {
    throw Object.assign(new Error(`No item ${itemKey} in library ${libraryID}`), {
      code: 404,
    });
  }

  // Tag the source, not an attachment or note hanging off it.
  if (item.parentItemID) {
    const parent = await Zotero.Items.getAsync(item.parentItemID);
    if (parent) item = parent as Zotero.Item;
  }

  const added: string[] = [];
  const existing: string[] = [];
  for (const tag of tags) {
    if (item.hasTag(tag)) {
      existing.push(tag);
      continue;
    }
    item.addTag(tag, TAG_TYPE_MANUAL);
    added.push(tag);
  }

  // Skip the save entirely when nothing changed, so re-posting the same tags
  // doesn't bump the item version and stir up a sync round-trip.
  if (added.length > 0) await item.saveTx();

  return { itemKey: item.key, added, existing };
}

function registerTagEndpoint(): void {
  Zotero.Server.Endpoints[ENDPOINT_PATH] = TagEndpoint;
}

function unregisterTagEndpoint(): void {
  delete Zotero.Server.Endpoints[ENDPOINT_PATH];
}
