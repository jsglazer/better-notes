import { showHint } from "../../utils/hint";
import { getString } from "../../utils/locale";
import { getPref } from "../../utils/prefs";
import { jointPath } from "../../utils/str";
import { isElementVisible } from "../../utils/window";

export { setSyncing, callSyncing };

function setSyncing() {
  const syncPeriod = getPref("syncPeriodSeconds") as number;
  const enableHint = addon.data.env === "development";
  if (syncPeriod > 0) {
    enableHint && showHint(`${getString("sync-start-hint")} ${syncPeriod} s`);
    const timer = ztoolkit.getGlobal("setInterval")(
      () => {
        if (!addon.data.alive) {
          showHint(getString("sync-stop-hint"));
          ztoolkit.getGlobal("clearInterval")(timer);
        }
        // Only when Zotero is active and focused
        if (
          Zotero.getMainWindow().document.hasFocus() &&
          (getPref("syncPeriodSeconds") as number) > 0
        ) {
          callSyncing(undefined, {
            quiet: true,
            skipActive: true,
            reason: "auto",
          });
        }
      },
      Number(syncPeriod) * 1000,
    );
  }
}

async function callSyncing(
  items: Zotero.Item[] = [],
  { quiet, skipActive, reason } = {
    quiet: true,
    skipActive: true,
    reason: "unknown",
  },
) {
  // Always log in development mode
  if (addon.data.env === "development") {
    quiet = false;
  }
  if (addon.data.sync.lock) {
    // Only allow one task
    return;
  }
  let progress;
  // Wrap the code in try...catch so that the lock can be released anyway
  try {
    addon.data.sync.lock = true;
    let skippedCount = 0;
    if (!items || !items.length) {
      items = Zotero.Items.get(await addon.api.sync.getSyncNoteIds());
    } else {
      items = items.filter((item) => addon.api.sync.isSyncNote(item.id));
    }
    if (items.length === 0) {
      addon.data.sync.lock = false;
      return;
    }
    if (skipActive) {
      // Skip active note editors' targets
      const activeNoteIds = Zotero.Notes._editorInstances
        .filter((editor) => {
          const elem = (editor._popup as XULPopupElement).closest(
            "note-editor",
          );
          return elem && isElementVisible(elem);
        })
        .map((editor) => editor._item.id);
      const filteredItems = items.filter(
        (item) => !activeNoteIds.includes(item.id),
      );
      skippedCount = items.length - filteredItems.length;
      items = filteredItems;
    }
    ztoolkit.log("sync start", reason, items.length, skippedCount);

    if (!quiet) {
      progress = new ztoolkit.ProgressWindow(
        `[${getString("sync-running-hint-title")}] ${
          addon.data.env === "development" ? reason : "better-notes"
        }`,
      )
        .createLine({
          text: `[${getString("sync-running-hint-check")}] 0/${
            items.length
          } ...`,
          type: "default",
          progress: 1,
        })
        .show(-1);
    }
    // Export items of same dir in batch
    const toExport = {} as Record<string, number[]>;
    const toImport: SyncStatus[] = [];
    const toDiff: SyncStatus[] = [];
    const mdStatusMap = {} as Record<number, MDStatus>;
    let i = 1;
    for (const item of items) {
      const syncStatus = addon.api.sync.getSyncStatus(item.id);
      const filepath = syncStatus.path;

      // Stat-gate: when the MD file is provably unchanged since the last sync
      // AND the note is unchanged, short-circuit to UpToDate and skip the
      // expensive file read+parse+hash. This only ever short-circuits on
      // positive "unchanged" signals; any doubt falls through to the full
      // compare below (which is the pre-U2 behavior), so it can never miss a
      // real change. See brainstorm.md U2.
      let compareResult: SyncCode;
      if (await isFastUpToDate(item, syncStatus)) {
        compareResult = SyncCode.UpToDate;
      } else {
        const mdStatus = await addon.api.sync.getMDStatus(item.id);
        mdStatusMap[item.id] = mdStatus;
        compareResult = await doCompare(item, mdStatus);
        // Self-populate the file mtime baseline so the next cycle can fast-path
        // while everything stays in sync.
        if (compareResult === SyncCode.UpToDate && mdStatus.meta) {
          persistMdModified(item.id, syncStatus, mdStatus.lastmodify.getTime());
        }
      }
      switch (compareResult) {
        case SyncCode.NoteAhead:
          if (Object.keys(toExport).includes(filepath)) {
            toExport[filepath].push(item.id);
          } else {
            toExport[filepath] = [item.id];
          }
          break;
        case SyncCode.MDAhead:
          toImport.push(syncStatus);
          break;
        case SyncCode.NeedDiff:
          toDiff.push(syncStatus);
          break;
        default:
          break;
      }
      progress?.changeLine({
        text: `[${getString("sync-running-hint-check")}] ${i}/${
          items.length
        } ...`,
        progress: ((i - 1) / items.length) * 100,
      });
      i += 1;
    }

    let totalCount = Object.keys(toExport).length;
    ztoolkit.log("will be synced:", totalCount, toImport.length, toDiff.length);

    i = 1;
    for (const filepath of Object.keys(toExport)) {
      progress?.changeLine({
        text: `[${getString("sync-running-hint-updateMD")}] ${i}/${
          items.length
        } ...`,
        progress: ((i - 1) / items.length) * 100,
      });
      const itemIDs = toExport[filepath];
      await addon.api.$export.syncMDBatch(
        filepath,
        itemIDs,
        itemIDs.map((id) => mdStatusMap[id].meta!),
      );
      i += 1;
    }
    i = 1;
    totalCount = toImport.length;
    for (const syncStatus of toImport) {
      progress?.changeLine({
        text: `[${getString(
          "sync-running-hint-updateNote",
        )}] ${i}/${totalCount}, ${toDiff.length} queuing...`,
        progress: ((i - 1) / totalCount) * 100,
      });
      const item = Zotero.Items.get(syncStatus.itemID);
      const filepath = jointPath(syncStatus.path, syncStatus.filename);
      await addon.api.$import.fromMD(filepath, { noteId: item.id });
      // Update md file to keep the metadata synced
      await addon.api.$export.syncMDBatch(
        syncStatus.path,
        [item.id],
        [mdStatusMap[item.id].meta!],
      );
      i += 1;
    }
    i = 1;
    totalCount = toDiff.length;
    for (const syncStatus of toDiff) {
      progress?.changeLine({
        text: `[${getString("sync-running-hint-diff")}] ${i}/${totalCount}...`,
        progress: ((i - 1) / totalCount) * 100,
      });

      await addon.hooks.onShowSyncDiff(
        syncStatus.itemID,
        jointPath(syncStatus.path, syncStatus.filename),
      );
      i += 1;
    }
    const syncCount =
      Object.keys(toExport).length + toImport.length + toDiff.length;
    progress?.changeLine({
      text:
        (syncCount
          ? `[${getString(
              "sync-running-hint-finish",
            )}] ${syncCount} ${getString("sync-running-hint-synced")}`
          : `[${getString("sync-running-hint-finish")}] ${getString(
              "sync-running-hint-upToDate",
            )}`) + (skippedCount ? `, ${skippedCount} skipped.` : ""),
      progress: 100,
    });
  } catch (e) {
    ztoolkit.log("[BetterNotes Syncing Error]", e);
    showHint(`Sync Error: ${String(e)}`);
  } finally {
    progress?.startCloseTimer(5000);
  }
  addon.data.sync.lock = false;
}

/**
 * Conservative fast path for the sync compare loop. Returns true only when both
 * the MD file and the note are provably unchanged since the last sync, so the
 * caller can treat the note as UpToDate without reading/parsing the file.
 *
 * Safety invariant: returns true ONLY on positive "unchanged" signals
 * (file mtime identical to last sync AND note md5 identical to last sync). Any
 * missing baseline, missing/unreadable file, differing mtime, or differing note
 * hash returns false → caller does the full compare. It therefore can produce a
 * false "do a full compare" (harmless, just the old cost) but never a false
 * "unchanged" (which would miss a real change).
 */
async function isFastUpToDate(
  noteItem: Zotero.Item,
  syncStatus: SyncStatus,
): Promise<boolean> {
  // No mtime baseline yet (pre-U2 record, or first sync) → full compare.
  if (!syncStatus.mdModified) {
    return false;
  }
  const filepath = jointPath(syncStatus.path, syncStatus.filename);
  let fileMtime: number;
  try {
    fileMtime = (await IOUtils.stat(filepath)).lastModified || 0;
  } catch (e) {
    // Missing/unreadable → let getMDStatus + doCompare decide.
    return false;
  }
  // MD file changed on disk since last sync → full compare.
  if (fileMtime !== syncStatus.mdModified) {
    return false;
  }
  // MD unchanged; confirm the note side is also unchanged.
  const noteMd5 = Zotero.Utilities.Internal.md5(noteItem.getNote(), false);
  return noteMd5 === syncStatus.noteMd5;
}

/** Persist the MD file mtime baseline used by {@link isFastUpToDate}. */
function persistMdModified(
  noteId: number,
  syncStatus: SyncStatus,
  mtime: number,
) {
  if (syncStatus.mdModified === mtime) {
    return;
  }
  addon.api.sync.updateSyncStatus(noteId, { ...syncStatus, mdModified: mtime });
}

async function doCompare(
  noteItem: Zotero.Item,
  mdStatus: MDStatus,
): Promise<SyncCode> {
  const syncStatus = addon.api.sync.getSyncStatus(noteItem.id);
  // No file found
  if (!mdStatus.meta) {
    // lastsync === 0 means this is the first export — create the file.
    // lastsync > 0 means the file existed before but was deleted — do not recreate.
    return syncStatus.lastsync === 0 ? SyncCode.NoteAhead : SyncCode.UpToDate;
  }
  // File meta is unavailable
  if (mdStatus.meta.$version < 0) {
    return SyncCode.NeedDiff;
  }
  let MDAhead = false;
  let noteAhead = false;
  const md5 = Zotero.Utilities.Internal.md5(mdStatus.content, false);
  const noteMd5 = Zotero.Utilities.Internal.md5(noteItem.getNote(), false);
  // MD5 doesn't match (md side change)
  if (md5 !== syncStatus.md5) {
    MDAhead = true;
  }
  // MD5 doesn't match (note side change)
  if (noteMd5 !== syncStatus.noteMd5) {
    noteAhead = true;
  }
  // Note version doesn't match (note side change)
  // This might be unreliable when Zotero account is not login
  if (Number(mdStatus.meta.$version) !== noteItem.version) {
    noteAhead = true;
  }
  if (noteAhead && MDAhead) {
    return SyncCode.NeedDiff;
  } else if (noteAhead) {
    return SyncCode.NoteAhead;
  } else if (MDAhead) {
    return SyncCode.MDAhead;
  } else {
    // const maxLastModifiedPeriod = 3000;
    // if (
    //   mdStatus.lastmodify &&
    //   syncStatus.lastsync &&
    //   // If the file is modified after the last sync, it's ahead
    //   Math.abs(mdStatus.lastmodify.getTime() - syncStatus.lastsync) >
    //     maxLastModifiedPeriod
    // ) {
    //   return SyncCode.MDAhead;
    // } else {
    //   return SyncCode.UpToDate;
    // }
    return SyncCode.UpToDate;
  }
}

enum SyncCode {
  UpToDate = 0,
  NoteAhead,
  MDAhead,
  NeedDiff,
}
