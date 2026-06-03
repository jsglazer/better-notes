import { config } from "../../../package.json";
import { getLinkedNotesRecursively, getNoteLink } from "../../utils/link";
import { getString } from "../../utils/locale";
import { fileExists, formatPath, jointPath } from "../../utils/str";
import { isWindowAlive } from "../../utils/window";

export interface SyncDataType {
  noteId: number;
  noteName: string;
  lastSync: string;
  filePath: string;
  isOrphaned: boolean;
}

export async function showSyncManager() {
  if (isWindowAlive(addon.data.sync.manager.window)) {
    addon.data.sync.manager.window?.focus();
    refresh();
  } else {
    const windowArgs = {
      _initPromise: Zotero.Promise.defer(),
    };
    const win = Zotero.getMainWindow().openDialog(
      `chrome://${config.addonRef}/content/syncManager.xhtml`,
      `${config.addonRef}-syncManager`,
      `chrome,centerscreen,resizable,status,dialog=no`,
      windowArgs,
    )!;
    await windowArgs._initPromise.promise;
    addon.data.sync.manager.window = win;
    await updateData();
    addon.data.sync.manager.tableHelper = new ztoolkit.VirtualizedTable(win!)
      .setContainerId("table-container")
      .setProp({
        id: "manager-table",
        // Do not use setLocale, as it modifies the Zotero.Intl.strings
        // Set locales directly to columns
        columns: [
          {
            dataKey: "noteName",
            label: "syncManager-noteName",
            fixedWidth: false,
          },
          {
            dataKey: "lastSync",
            label: "syncManager-lastSync",
            fixedWidth: false,
          },
          {
            dataKey: "filePath",
            label: "syncManager-filePath",
            fixedWidth: false,
          },
        ].map((column) =>
          Object.assign(column, {
            label: getString(column.label),
          }),
        ),
        showHeader: true,
        multiSelect: true,
        staticColumns: false,
        disableFontSizeScaling: true,
      })
      .setProp("getRowCount", () => addon.data.sync.manager.data.length)
      .setProp(
        "getRowData",
        (index) =>
          (addon.data.sync.manager.data[index] as {
            noteName: string;
            lastSync: string;
            filePath: string;
          }) || {
            noteName: "no data",
            lastSync: "no data",
            filePath: "no data",
          },
      )
      .setProp("onSelectionChange", (selection) => {
        updateButtons();
      })
      .setProp("onKeyDown", (event: KeyboardEvent) => {
        if (
          event.key == "Delete" ||
          (Zotero.isMac && event.key == "Backspace")
        ) {
          unSyncNotes(getSelectedNoteIds());
          refresh();
          return false;
        }
        return true;
      })
      .setProp("onActivate", (ev) => {
        const noteIds = getSelectedNoteIds();
        for (const noteId of noteIds) {
          const row = addon.data.sync.manager.data.find(
            (d) => d.noteId === noteId,
          );
          if (row?.isOrphaned) {
            handleOrphanedNoteClick(noteId);
            return false;
          }
          addon.hooks.onOpenNote(noteId, "builtin");
        }
        return true;
      })
      .setProp("renderItem", (index, selection, oldElem, columns) => {
        const row = addon.data.sync.manager.data[index];
        const managerDoc = addon.data.sync.manager.window!.document;
        let div: HTMLElement;
        if (oldElem) {
          div = oldElem;
          div.innerHTML = "";
        } else {
          div = managerDoc.createElement("div");
          div.className = "row";
        }
        div.classList.toggle("selected", selection.isSelected(index));
        div.classList.toggle("focused", selection.focused === index);
        for (const column of columns) {
          const span = managerDoc.createElement("span");
          // @ts-ignore
          span.className = `cell ${column?.className || ""}`;
          span.textContent = String(
            row?.[column.dataKey as keyof SyncDataType] || "",
          );
          if (row?.isOrphaned) {
            span.style.color = "red";
          }
          div.appendChild(span);
        }
        return div;
      })
      .setProp(
        "getRowString",
        (index) => addon.data.sync.manager?.data[index].noteName || "",
      )
      .setProp("onColumnSort", async (columnIndex, ascending) => {
        addon.data.sync.manager.columnIndex = columnIndex;
        addon.data.sync.manager.columnAscending = ascending > 0;
        await updateData();
        await refresh();
      })
      .render();
    const refreshButton = win.document.querySelector(
      "#refresh",
    ) as HTMLButtonElement;
    const syncButton = win.document.querySelector("#sync") as HTMLButtonElement;
    const unSyncButton = win.document.querySelector(
      "#unSync",
    ) as HTMLButtonElement;
    const detectButton = win.document.querySelector(
      "#detect",
    ) as HTMLButtonElement;
    refreshButton.addEventListener("click", (ev) => {
      refresh();
    });
    syncButton.addEventListener("click", async (ev) => {
      await addon.hooks.onSyncing(Zotero.Items.get(getSelectedNoteIds()), {
        quiet: false,
        skipActive: false,
        reason: "manual-manager",
      });
      refresh();
    });
    unSyncButton.addEventListener("click", (ev) => {
      getSelectedNoteIds().forEach((noteId) => {
        addon.api.sync.removeSyncNote(noteId);
      });
      refresh();
    });
    detectButton.addEventListener("click", () => {
      detectSyncedNotes();
    });
    const cleanupButton = win.document.querySelector(
      "#cleanup",
    ) as HTMLButtonElement;
    cleanupButton.addEventListener("click", async () => {
      await cleanupOrphanedSyncNotes();
    });
  }
}

const sortDataKeys = ["noteName", "lastSync", "filePath"] as Array<
  keyof SyncDataType
>;

async function updateData() {
  const sortKey = sortDataKeys[addon.data.sync.manager.columnIndex];
  const noteIds = await addon.api.sync.getSyncNoteIds();
  const rows: SyncDataType[] = [];
  for (const noteId of noteIds) {
    const syncStatus = addon.api.sync.getSyncStatus(noteId);
    const fullPath = jointPath(syncStatus.path, syncStatus.filename);
    const isOrphaned = !!(
      syncStatus.path &&
      syncStatus.filename &&
      !(await fileExists(fullPath))
    );
    rows.push({
      noteId,
      noteName: Zotero.Items.get(noteId).getNoteTitle(),
      lastSync: new Date(syncStatus.lastsync).toLocaleString(),
      filePath: fullPath,
      isOrphaned,
    });
  }
  addon.data.sync.manager.data = rows.sort((a, b) => {
    if (!a || !b) return 0;
    const valueA = String(a[sortKey] || "");
    const valueB = String(b[sortKey] || "");
    return addon.data.sync.manager.columnAscending
      ? valueA.localeCompare(valueB)
      : valueB.localeCompare(valueA);
  });
}

async function updateTable() {
  return new Promise<void>((resolve) => {
    addon.data.sync.manager.tableHelper?.render(undefined, (_) => {
      resolve();
    });
  });
}

function updateButtons() {
  const win = addon.data.sync.manager.window;
  if (!win) {
    return;
  }
  const unSyncButton = win.document.querySelector(
    "#unSync",
  ) as HTMLButtonElement;
  if (
    addon.data.sync.manager.tableHelper?.treeInstance.selection.selected.size
  ) {
    unSyncButton.disabled = false;
  } else {
    unSyncButton.disabled = true;
  }
}

async function refresh() {
  await updateData();
  await updateTable();
  updateButtons();
}

function getSelectedNoteIds() {
  const ids = [];
  for (const idx of addon.data.sync.manager.tableHelper?.treeInstance.selection.selected?.keys() ||
    []) {
    ids.push(addon.data.sync.manager.data[idx].noteId);
  }
  return ids;
}

async function unSyncNotes(itemIds: number[]) {
  if (itemIds.length === 0) {
    return;
  }
  const unSyncLinkedNotes = addon.data.sync.manager.window?.confirm(
    `Un-sync their linked notes?`,
  );
  if (unSyncLinkedNotes) {
    for (const item of Zotero.Items.get(itemIds)) {
      const linkedIds: number[] = getLinkedNotesRecursively(
        getNoteLink(item) || "",
        itemIds,
      );
      itemIds.push(...linkedIds);
    }
  }
  for (const itemId of itemIds) {
    await addon.api.sync.removeSyncNote(itemId);
  }
  await refresh();
}

async function cleanupOrphanedSyncNotes() {
  const noteIds = await addon.api.sync.getSyncNoteIds();
  let removed = 0;
  for (const noteId of noteIds) {
    const status = addon.api.sync.getSyncStatus(noteId);
    if (!status.path || !status.filename) continue;
    const filepath = jointPath(status.path, status.filename);
    const exists = await fileExists(filepath);
    if (!exists) {
      addon.api.sync.removeSyncNote(noteId);
      removed++;
    }
  }
  addon.data.sync.manager.window?.alert(
    `Removed ${removed} orphaned sync ${removed === 1 ? "entry" : "entries"}.`,
  );
  await refresh();
}

async function handleOrphanedNoteClick(noteId: number) {
  const syncStatus = addon.api.sync.getSyncStatus(noteId);
  const filePath = jointPath(syncStatus.path, syncStatus.filename);
  const win = addon.data.sync.manager.window;

  const choices = [
    "Delete sync entry",
    "Recreate sync entry (choose new file location)",
    "Delete sync entry and note in Zotero",
    "Delete sync entry, note in Zotero, and destination file",
    "Exit",
  ];
  const selected = { value: 4 };
  const ok = Services.prompt.select(
    win as any,
    "Sync Entry Invalid",
    `File not found:\n${filePath}\n\nWhat would you like to do?`,
    choices,
    selected,
  );

  if (!ok || selected.value === 4) return;

  switch (selected.value) {
    case 0: {
      addon.api.sync.removeSyncNote(noteId);
      break;
    }
    case 1: {
      const newFile = await new addon.data.ztoolkit.FilePicker(
        "Select new destination for this note",
        "open",
        [["Markdown Files", "*.md"]],
      ).open();
      if (newFile) {
        const splitPath = PathUtils.split(formatPath(newFile as string));
        const filename = splitPath.pop()!;
        const dir = formatPath(splitPath.join("/"));
        addon.api.sync.updateSyncStatus(noteId, {
          ...syncStatus,
          path: dir,
          filename,
        });
      }
      break;
    }
    case 2: {
      addon.api.sync.removeSyncNote(noteId);
      const noteItem2 = Zotero.Items.get(noteId);
      if (noteItem2) await noteItem2.eraseTx();
      break;
    }
    case 3: {
      addon.api.sync.removeSyncNote(noteId);
      try {
        await IOUtils.remove(filePath);
      } catch (e) {
        // File already gone — ignore
      }
      const noteItem3 = Zotero.Items.get(noteId);
      if (noteItem3) await noteItem3.eraseTx();
      break;
    }
  }

  await refresh();
}

async function detectSyncedNotes() {
  const dir = await new addon.data.ztoolkit.FilePicker(
    "Select folder to detect",
    "folder",
  ).open();
  if (!dir) return;

  const statusList = await addon.api.sync.findAllSyncedFiles(dir);
  let current = 0;
  for (const status of statusList) {
    if (addon.api.sync.isSyncNote(status.itemID)) {
      current++;
    }
  }
  const total = statusList.length;
  const newCount = total - current;
  if (
    !addon.data.sync.manager.window?.confirm(
      getString("syncManager-detectConfirmInfo", {
        args: {
          total,
          new: newCount,
          current,
          dir,
        },
      }),
    )
  )
    return;
  for (const status of statusList) {
    addon.api.sync.updateSyncStatus(status.itemID, status);
  }
  await addon.hooks.onSyncing();
  await refresh();
}
