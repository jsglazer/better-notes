import * as YAML from "yaml";
import { createStore } from "../../utils/store";
import { getPref, setPref } from "../../utils/prefs";
import { config } from "../../../package.json";
import { fileExists, formatPath, jointPath } from "../../utils/str";
import { getMetaField } from "../../utils/meta";
import { buildNoteModel } from "../template/model";

export {
  initSyncList,
  removeSyncNote,
  isSyncNote,
  getSyncNoteIds,
  addSyncNote,
  updateSyncStatus,
  getSyncStatus,
  getNoteStatus,
  getMDStatus,
  getMDStatusFromContent,
  getMDFileName,
  getUniqueMDFileName,
  findAllSyncedFiles,
};

function initSyncList() {
  const rawKeys = getPref("syncNoteIds") as string;
  if (!rawKeys.startsWith("[") || !rawKeys.endsWith("]")) {
    const keys = rawKeys.split(",").map((id) => String(id));
    setPref("syncNoteIds", JSON.stringify(keys));
  }
  addon.data.sync.data = createStore(
    `${config.prefsPrefix}.syncNoteIds`,
    `${config.prefsPrefix}.syncDetail-`,
    "parser",
  );
  // Due to the bug in v1.1.4-22, the sync data may be corrupted
  const keys = addon.data.sync.data?.getKeys().map((key) => String(key));
  setPref("syncNoteIds", JSON.stringify(keys));
}

async function getSyncNoteIds() {
  const keys = addon.data.sync.data
    ?.getKeys()
    .map((key) => Number(key))
    .filter((key) => !!key);
  if (!keys) {
    return [];
  }
  return (await Zotero.Items.getAsync(keys))
    .filter((item) => item.isNote() && !item.deleted)
    .map((item) => item.id);
}

function isSyncNote(noteId: number): boolean {
  return !!addon.data.sync.data?.hasKey(String(noteId));
}

function addSyncNote(noteId: number) {
  addon.data.sync.data?.setKey(String(noteId));
}

function removeSyncNote(noteId: number) {
  addon.data.sync.data?.deleteKey(String(noteId));
}

function updateSyncStatus(noteId: number, status: SyncStatus) {
  addon.data.sync.data?.setValue(String(noteId), status);
}

function getNoteStatus(noteId: number) {
  const noteItem = Zotero.Items.get(noteId);
  if (!noteItem?.isNote()) {
    return;
  }
  const fullContent = noteItem.getNote();
  const ret = {
    meta: "",
    content: "",
    tail: "</div>",
    lastmodify: Zotero.Date.sqlToDate(noteItem.dateModified, true),
  };
  const metaRegex = /^<div[^>]*>/;
  // Not wrapped inside div
  if (!metaRegex.test(fullContent)) {
    ret.meta = `<div data-schema-version="${config.dataSchemaVersion}">`;
    ret.content = fullContent || "";
    return ret;
  }
  const metaMatch = fullContent.match(metaRegex);
  ret.meta = metaMatch ? metaMatch[0] : "";
  ret.content = fullContent.substring(
    ret.meta.length,
    fullContent.length - ret.tail.length,
  );
  return ret;
}

function getSyncStatus(noteId?: number): SyncStatus {
  const defaultStatus = {
    path: "",
    filename: "",
    md5: "",
    noteMd5: "",
    lastsync: new Date().getTime(),
    itemID: -1,
  };
  const status = {
    ...defaultStatus,
    ...(addon.data.sync.data?.getValue(String(noteId)) as SyncStatus),
  };
  status.path = formatPath(status.path);
  return status;
}

function getMDStatusFromContent(contentRaw: string): MDStatus {
  contentRaw = contentRaw.replace(/\r\n/g, "\n");
  // U23: anchored at the very start of the file, and the YAML body is captured
  // rather than reconstructed by stripping every `---` in the match. The old
  // pattern was unanchored (`/gm`) yet sliced as if the match began at index 0,
  // so a `---` rule further down a file WITHOUT front matter was parsed as front
  // matter and that many characters were cut off the body. Stripping all `---`
  // also corrupted any value that legitimately contained them. The lookahead
  // keeps the matched length identical to before for well-formed front matter,
  // so stored md5/baseMd baselines stay valid.
  const result = contentRaw.match(/^---\n([\s\S]*?)\n---(?=\n|$)/);
  const ret: MDStatus = {
    meta: { $version: -1 },
    content: contentRaw,
    filedir: "",
    filename: "",
    lastmodify: new Date(0),
  };
  if (result) {
    ret.content = contentRaw.slice(result[0].length);
    try {
      ret.meta = YAML.parse(result[1]);
    } catch (e) {
      ztoolkit.log(e);
    }
  }
  return ret;
}

async function getMDStatus(
  source: Zotero.Item | number | string,
): Promise<MDStatus> {
  let ret: MDStatus = {
    meta: null,
    content: "",
    filedir: "",
    filename: "",
    lastmodify: new Date(0),
  };
  try {
    let filepath = "";
    if (typeof source === "string") {
      filepath = source;
    } else if (typeof source === "number") {
      const syncStatus = getSyncStatus(source);
      filepath = jointPath(syncStatus.path, syncStatus.filename);
    } else if (source.isNote && source.isNote()) {
      const syncStatus = getSyncStatus(source.id);
      filepath = jointPath(syncStatus.path, syncStatus.filename);
    }
    filepath = formatPath(filepath);
    if (await fileExists(filepath)) {
      const contentRaw = (await Zotero.File.getContentsAsync(
        filepath,
        "utf-8",
      )) as string;
      ret = getMDStatusFromContent(contentRaw);
      const pathSplit = PathUtils.split(filepath);
      ret.filedir = formatPath(pathSplit.slice(0, -1).join("/"));
      ret.filename = pathSplit.pop() || "";
      const stat = await IOUtils.stat(filepath);
      ret.lastmodify = new Date(stat.lastModified || 0);
    }
  } catch (e) {
    ztoolkit.log(e);
  }
  return ret;
}

async function getMDFileName(noteId: number, _searchDir?: string) {
  const noteItem = Zotero.Items.get(noteId);
  // Derive filename from the [ExportMDFileNameV2] Liquid template with the
  // curated note model; note key as the last-resort floor so it's never empty.
  const liquidOut = await addon.api.template.runLiquidIfLiquid(
    "[ExportMDFileNameV2]",
    { note: await buildNoteModel(noteItem), now: new Date() },
  );
  const filename = (liquidOut ?? "").trim();
  return filename || `${noteItem.key}.md`;
}

/**
 * Resolve a *unique* export filename for `noteId` within `syncDir`.
 *
 * Several notes can hang off one Zotero item, but `[ExportMDFileNameV2]` derives
 * the name from the parent's cite key — so every note would map to the same
 * `<citekey>.md` and the second export would collide. Here we keep the clean
 * template name when it's free (the first/only note on an item), and on a
 * collision prompt for a short note ID, using `<stem>-<id>.<ext>` when that's
 * unique. Empty input or a still-colliding ID falls back to the note's stable
 * key so a name is always produced. Prompt-driven, so only call from
 * user-initiated linking — never from the auto-sync timer.
 */
async function getUniqueMDFileName(
  noteId: number,
  syncDir: string,
): Promise<string> {
  const noteItem = Zotero.Items.get(noteId);
  const base = (await getMDFileName(noteId, syncDir)) || `${noteItem.key}.md`;
  const taken = (name: string) => fileExists(jointPath(syncDir, name));

  // Free as-is → keep the clean cite-key name (first/only note on the item).
  if (!(await taken(base))) {
    return base;
  }

  const dot = base.lastIndexOf(".");
  const stem = dot > 0 ? base.slice(0, dot) : base;
  const ext = dot > 0 ? base.slice(dot) : ".md";
  const sanitize = (s: string) =>
    s
      .replace(/[/\\?%*:|"<>\s]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .trim();

  // Collision → ask for a short ID and use it if it makes the name unique.
  const win = Zotero.getMainWindow();
  const input =
    typeof win?.prompt === "function"
      ? win.prompt(
          `A note is already exported as "${base}".\n` +
            `Enter a short ID for this note (used as "${stem}-<id>${ext}"):`,
          "",
        )
      : "";
  const id = sanitize(input || "");
  if (id && !(await taken(`${stem}-${id}${ext}`))) {
    return `${stem}-${id}${ext}`;
  }

  // Empty / still colliding → fall back to the stable, unique note key.
  let fallback = `${stem}-${noteItem.key}${ext}`;
  let n = 2;
  while (await taken(fallback)) {
    fallback = `${stem}-${noteItem.key}-${n++}${ext}`;
  }
  return fallback;
}

async function findAllSyncedFiles(searchDir: string) {
  const results: SyncStatus[] = [];
  const mdRegex = /\.(md|MD|Md|mD)$/;
  await Zotero.File.iterateDirectory(
    searchDir,
    async (entry: OS.File.Entry) => {
      if (entry.isDir) {
        const subDirResults = await findAllSyncedFiles(entry.path);
        results.push(...subDirResults);
        return;
      }
      if (mdRegex.test(entry.name)) {
        const MDStatus = await getMDStatus(entry.path);
        // Accept both the current (`libraryID`/`itemKey`) and the pre-1.0.5
        // `$`-prefixed spelling — the writer dropped the prefix but this reader
        // was never updated, so detection matched nothing at all.
        const libraryID = getMetaField(MDStatus.meta, "libraryID");
        const itemKey = getMetaField(MDStatus.meta, "itemKey");
        if (!libraryID || !itemKey) {
          return;
        }
        const item = await Zotero.Items.getByLibraryAndKeyAsync(
          libraryID,
          itemKey,
        );
        if (!item || !(item as Zotero.Item).isNote()) {
          return;
        }
        results.push({
          path: MDStatus.filedir,
          filename: MDStatus.filename,
          md5: Zotero.Utilities.Internal.md5(MDStatus.content, false),
          noteMd5: Zotero.Utilities.Internal.md5(
            (item as Zotero.Item).getNote(),
            false,
          ),
          lastsync: MDStatus.lastmodify.getTime(),
          itemID: item.id,
        });
      }
    },
  );
  return results;
}
