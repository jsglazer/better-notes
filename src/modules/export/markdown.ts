import { showHintWithLink } from "../../utils/hint";
import { getPref } from "../../utils/prefs";
import { formatPath, jointPath, writeFileAtomic } from "../../utils/str";

export async function saveMD(
  filename: string,
  noteId: number,
  options: {
    keepNoteLink?: boolean;
    withYAMLHeader?: boolean;
  } = {},
) {
  const noteItem = Zotero.Items.get(noteId);
  const dir = jointPath(...PathUtils.split(formatPath(filename)).slice(0, -1));
  await IOUtils.makeDirectory(dir);
  const hasImage = noteItem.getNote().includes("<img");
  if (hasImage) {
    const attachmentsDir = jointPath(
      dir,
      getPref("syncAttachmentFolder") as string,
    );
    await IOUtils.makeDirectory(attachmentsDir);
  }
  await writeFileAtomic(
    filename,
    await addon.api.convert.note2md(noteItem, dir, options),
  );

  showHintWithLink(`Note Saved to ${filename}`, "Show in Folder", (ev) => {
    Zotero.File.reveal(filename);
  });
}

export async function syncMDBatch(
  saveDir: string,
  noteIds: number[],
  metaList?: Record<string, any>[],
) {
  const noteItems = Zotero.Items.get(noteIds);
  await IOUtils.makeDirectory(saveDir);
  const attachmentsDir = jointPath(
    saveDir,
    getPref("syncAttachmentFolder") as string,
  );
  const hasImage = noteItems.some((noteItem) =>
    noteItem.getNote().includes("<img"),
  );
  if (hasImage) {
    await IOUtils.makeDirectory(attachmentsDir);
  }
  let i = 0;
  for (const noteItem of noteItems) {
    // Reuse the note's already-assigned filename so a re-sync never renames or
    // re-collides the file. Only derive a name for a note that isn't linked yet
    // — and make it unique within saveDir so multiple notes on one item don't
    // all land on a single <citekey>.md (prompts for a short ID on a clash).
    const filename = addon.api.sync.isSyncNote(noteItem.id)
      ? addon.api.sync.getSyncStatus(noteItem.id).filename ||
        (await addon.api.sync.getUniqueMDFileName(noteItem.id, saveDir))
      : await addon.api.sync.getUniqueMDFileName(noteItem.id, saveDir);
    const filePath = jointPath(saveDir, filename);
    const content = await addon.api.convert.note2md(noteItem, saveDir, {
      keepNoteLink: false,
      withYAMLHeader: true,
      cachedYAMLHeader: metaList?.[i],
    });
    await writeFileAtomic(filePath, content);
    // Record the freshly-written file's mtime so the sync stat-gate can skip
    // re-reading this file next cycle while it stays unchanged.
    let mdModified = 0;
    try {
      mdModified = (await IOUtils.stat(filePath)).lastModified || 0;
    } catch (e) {
      ztoolkit.log("syncMDBatch stat after write failed", e);
    }
    // Front-matter-stripped body = the agreed state at this sync. Stored as the
    // diff3 common ancestor (U2b) and hashed for the stat-gate.
    const baseMd = addon.api.sync.getMDStatusFromContent(content).content;
    addon.api.sync.updateSyncStatus(noteItem.id, {
      path: saveDir,
      filename,
      itemID: noteItem.id,
      md5: Zotero.Utilities.Internal.md5(baseMd, false),
      noteMd5: Zotero.Utilities.Internal.md5(noteItem.getNote(), false),
      lastsync: new Date().getTime(),
      mdModified,
      baseMd,
    });
    i += 1;
  }
}
