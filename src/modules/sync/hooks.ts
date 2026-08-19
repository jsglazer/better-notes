import { showHint } from "../../utils/hint";
import { getString } from "../../utils/locale";
import { getPref } from "../../utils/prefs";
import { jointPath } from "../../utils/str";
import { isElementVisible } from "../../utils/window";
import { getEditorInstances, getEditorItem } from "../editor/adapter";
import { isEditorIdle } from "../editor/inputActivity";
import { threeWayMerge } from "./merge";

export { setSyncing, unsetSyncing, callSyncing };

// The recurring auto-sync timer. Kept at module scope so it can be cleared
// IMMEDIATELY on shutdown — a live setInterval holds the plugin's code alive,
// which made Zotero defer plugin removal to a restart (the timer otherwise only
// self-cleared on its NEXT tick, up to syncPeriodSeconds later, so it was still
// running at uninstall time). Clearing it here is part of making the plugin
// removable while enabled (alongside terminating the workers).
let syncTimer: ReturnType<typeof setInterval> | undefined;

function setSyncing() {
  const syncPeriod = getPref("syncPeriodSeconds") as number;
  const enableHint = addon.data.env === "development";
  if (syncPeriod > 0) {
    enableHint && showHint(`${getString("sync-start-hint")} ${syncPeriod} s`);
    unsetSyncing(); // never leave a previous timer running
    syncTimer = ztoolkit.getGlobal("setInterval")(
      () => {
        if (!addon.data.alive) {
          showHint(getString("sync-stop-hint"));
          unsetSyncing();
          return;
        }
        if ((getPref("syncPeriodSeconds") as number) <= 0) {
          return;
        }
        const focused = Zotero.getMainWindow()?.document?.hasFocus() ?? false;
        // Background sync (Zotero unfocused) is what makes Obsidian→Zotero edits
        // propagate live. It's opt-out via `sync.background` (default on); when
        // off, fall back to the old focus-only behavior. Unfocused runs use
        // `background: true` so conflicts are deferred, not popped as a modal.
        const backgroundEnabled = getPref("sync.background") !== false;
        if (!focused && !backgroundEnabled) {
          return;
        }
        callSyncing(undefined, {
          quiet: true,
          skipActive: true,
          reason: focused ? "auto" : "auto-background",
          background: !focused,
        });
      },
      Number(syncPeriod) * 1000,
    );
  }
}

/** Stop the auto-sync timer. Safe to call when no timer is running. */
function unsetSyncing() {
  if (syncTimer !== undefined) {
    ztoolkit.getGlobal("clearInterval")(syncTimer);
    syncTimer = undefined;
  }
}

async function callSyncing(
  items: Zotero.Item[] = [],
  {
    quiet = true,
    skipActive = true,
    reason = "unknown",
    background = false,
  }: {
    quiet?: boolean;
    skipActive?: boolean;
    reason?: string;
    // Background (Zotero unfocused) run: do the full stat-gated compare + diff3
    // auto-merge, but DEFER true conflicts (don't pop the modal diff window,
    // which would steal focus from Obsidian). Deferred conflicts surface on the
    // next focused sync.
    background?: boolean;
  } = {},
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
    // The set of notes the user currently has open, visible, AND focused in
    // Zotero — "protected" notes. These are NOT dropped before the compare any
    // more (the old code did, so a focused note never synced at all). Instead
    // they're compared like everything else, then handled specially in the loop
    // below: a one-way external edit (MDAhead) is imported only when the note is
    // idle (U2b-B), and a conflict/auto-merge (NeedDiff) is always deferred —
    // both writes reload the live editor, so neither may touch a note you're
    // typing into.
    //
    // CRUCIAL: gate this on the MAIN WINDOW having OS focus. A note editor
    // iframe's `document.hasFocus()` keeps returning true even while Zotero is
    // in the background (you're typing in Obsidian) — Gecko tracks the iframe's
    // internal focus independently of OS window activation. When Zotero is
    // unfocused you cannot be typing into a Zotero note, so nothing is protected
    // and background runs sync every note.
    let activeNoteIds: number[] = [];
    if (skipActive) {
      const appFocused =
        Zotero.getMainWindow()?.document?.hasFocus?.() ?? false;
      activeNoteIds = !appFocused
        ? []
        : getEditorInstances()
            .filter((editor) => {
              // _popup / _iframeWindow are accessed directly here on purpose:
              // both are guarded (closest()/visibility, and an optional-chained
              // hasFocus in a try/catch) against a dead/partial editor — the
              // adapter accessors don't replicate that, and getEditorPopup adds
              // type friction for no benefit.
              const elem = (editor._popup as XULPopupElement).closest(
                "note-editor",
              );
              if (!elem || !isElementVisible(elem)) {
                return false;
              }
              try {
                return editor._iframeWindow?.document?.hasFocus?.() ?? false;
              } catch (e) {
                return false;
              }
            })
            .map((editor) => getEditorItem(editor).id);
    }
    ztoolkit.log("sync start", reason, items.length, skippedCount);

    if (!quiet) {
      progress = new ztoolkit.ProgressWindow(
        `[${getString("sync-running-hint-title")}] ${
          addon.data.env === "development" ? reason : "enhanced-notes"
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
      const isProtected = activeNoteIds.includes(item.id);
      switch (compareResult) {
        case SyncCode.NoteAhead:
          if (isProtected) {
            // Don't re-export the focused note from a periodic run — your own
            // edits to it already flow out via the modify-notifier sync path.
            skippedCount += 1;
            break;
          }
          if (Object.keys(toExport).includes(filepath)) {
            toExport[filepath].push(item.id);
          } else {
            toExport[filepath] = [item.id];
          }
          break;
        case SyncCode.MDAhead:
          // U2b-B: a one-way external (Obsidian) edit. For the focused note an
          // import reloads the live editor, so defer it WHILE you're typing;
          // once the note is idle (no keypress for a few seconds — you're
          // reading, not editing) let it import so the Obsidian change appears.
          if (isProtected && !isEditorIdle(item.id)) {
            skippedCount += 1;
            break;
          }
          toImport.push(syncStatus);
          break;
        case SyncCode.NeedDiff:
          if (isProtected) {
            // Both an auto-merge and a diff dialog write the note (reloading the
            // live editor) and the dialog steals focus — never do that to the
            // note you're focused on. Defer to the next focused, idle tick.
            skippedCount += 1;
            break;
          }
          // U2b: both sides changed — try a 3-way auto-merge against the stored
          // baseline first; only fall back to the manual diff dialog on a real
          // (overlapping) conflict.
          if (await tryAutoMerge(item, mdStatusMap[item.id], syncStatus)) {
            // merged cleanly + applied to both sides; nothing to resolve
          } else {
            toDiff.push(syncStatus);
          }
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
    // In a background run, never open the modal diff window — it would yank
    // focus away from Obsidian. Leave the conflict unresolved (its sync status
    // isn't advanced), so the next FOCUSED sync re-detects and resolves it; just
    // surface a non-blocking hint.
    if (background) {
      if (toDiff.length > 0) {
        showHint(
          `${toDiff.length} note conflict(s) need review — focus Zotero to resolve.`,
        );
      }
    } else {
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
    ztoolkit.log("[EnhancedNotes Syncing Error]", e);
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

/**
 * U2b 3-way auto-merge for a both-sides-changed note. Compares in MD-body space:
 * `base` = the stored baseline (`SyncStatus.baseMd`), `mine` = the note rendered
 * to MD, `theirs` = the current MD file body. On a clean (non-overlapping) merge
 * it applies the result to the note AND re-exports to the file, returning true so
 * the caller skips the diff dialog. Any baseline gap, render failure, or real
 * conflict → returns false (fall back to manual resolution). Never throws.
 */
async function tryAutoMerge(
  noteItem: Zotero.Item,
  mdStatus: MDStatus,
  syncStatus: SyncStatus,
): Promise<boolean> {
  const base = syncStatus.baseMd;
  if (base === undefined || !mdStatus) {
    return false; // no common ancestor → cannot 3-way merge
  }
  try {
    // mine: the note as an MD body, in the same representation as baseMd.
    const mineFull = await addon.api.convert.note2md(noteItem, syncStatus.path, {
      withYAMLHeader: true,
      keepNoteLink: false,
    });
    const mine = addon.api.sync.getMDStatusFromContent(mineFull).content;
    const theirs = mdStatus.content;

    const merged = threeWayMerge(base, mine, theirs);
    if (!merged.clean) {
      return false;
    }

    // Apply merged MD → note, then re-export note → file (updates baseMd, md5s).
    const noteStatus = addon.api.sync.getNoteStatus(noteItem.id);
    if (!noteStatus) {
      return false;
    }
    const parsed = await addon.api.convert.md2note(
      { ...mdStatus, content: merged.text },
      noteItem,
      { isImport: true },
    );
    noteItem.setNote(noteStatus.meta + parsed + noteStatus.tail);
    // skipBN so this write doesn't re-trigger onSyncing via the modify notifier.
    await noteItem.saveTx({ notifierData: { skipBN: true } });
    await addon.api.$export.syncMDBatch(syncStatus.path, [noteItem.id]);
    return true;
  } catch (e) {
    ztoolkit.log("tryAutoMerge failed; falling back to diff", e);
    return false;
  }
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
